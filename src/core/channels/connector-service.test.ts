import { describe, expect, it, vi } from "vitest";
import type { WidgetResult } from "@/core/chat/widget-service";
import type { InboundMessage } from "./adapter";
import { connectorGreeting, processConnectorMessages, UNSUPPORTED_NOTE, type ConnectorDeps, type Delivery } from "./connector-service";

const inbound = (over: Partial<InboundMessage> = {}): InboundMessage => ({
  externalMessageId: "555:1",
  externalUserId: "555",
  displayName: "Sari",
  text: "serum ready?",
  receivedAt: "2026-10-19T08:00:00.000Z",
  ...over,
});
const sent: Delivery = { ok: true, externalMessageId: "9", attempts: 1 };
const answered: WidgetResult = {
  status: 200,
  body: { mode: "ai", messages: [{ id: "m-out", author: "ai", content: "Ready Kak, Rp89.000.", created_at: "2026-10-19T08:00:01.000Z" }] },
};

function deps(over: Partial<ConnectorDeps> = {}) {
  const d = {
    answer: vi.fn(async () => answered),
    send: vi.fn(async () => sent),
    recordDelivery: vi.fn(async () => undefined),
    greeting: vi.fn(async () => "Halo Kak!"),
    acknowledge: vi.fn(async () => undefined),
    ...over,
  };
  return d;
}

describe("processConnectorMessages", () => {
  it("answers through the chat pipeline and sends every visible reply back, recording delivery", async () => {
    const d = deps();
    const out = await processConnectorMessages(d, [inbound()]);
    expect(d.acknowledge).toHaveBeenCalledOnce();
    expect(d.answer).toHaveBeenCalledWith(inbound());
    expect(d.send).toHaveBeenCalledWith("555", "Ready Kak, Rp89.000.");
    expect(d.recordDelivery).toHaveBeenCalledWith("m-out", sent);
    expect(out).toEqual({ answered: 1, sent: 1, failed: 0 });
  });

  it("greets on /start without calling the assistant", async () => {
    const d = deps();
    await processConnectorMessages(d, [inbound({ text: "/start" }), inbound({ text: "/start@toko_bot ref123" })]);
    expect(d.answer).not.toHaveBeenCalled();
    expect(d.send).toHaveBeenCalledTimes(2);
    expect(d.send).toHaveBeenNthCalledWith(2, "555", "Halo Kak!");
  });

  it("tells the buyer it can only read text for photos and voice notes", async () => {
    const d = deps();
    await processConnectorMessages(d, [inbound({ text: "", unsupported: true })]);
    expect(d.answer).not.toHaveBeenCalled();
    expect(d.send).toHaveBeenCalledWith("555", UNSUPPORTED_NOTE);
  });

  it("says nothing for a webhook retry or a closed shop, passes on limits, counts failed sends", async () => {
    const duplicate = deps({ answer: vi.fn(async (): Promise<WidgetResult> => ({ status: 200, body: { mode: "ai", messages: [], duplicate: true } })) });
    await processConnectorMessages(duplicate, [inbound()]);
    expect(duplicate.send).not.toHaveBeenCalled();

    const closed = deps({ answer: vi.fn(async (): Promise<WidgetResult> => ({ status: 404, body: { error: "Toko tidak ditemukan." } })) });
    await processConnectorMessages(closed, [inbound()]);
    expect(closed.send).not.toHaveBeenCalled();

    const limited = deps({ answer: vi.fn(async (): Promise<WidgetResult> => ({ status: 429, body: { error: "Pesannya terlalu cepat. Tunggu sebentar ya." } })) });
    await processConnectorMessages(limited, [inbound()]);
    expect(limited.send).toHaveBeenCalledWith("555", "Pesannya terlalu cepat. Tunggu sebentar ya.");

    const failing = deps({ send: vi.fn(async (): Promise<Delivery> => ({ ok: false, retryable: false, reason: "diblokir", attempts: 1 })) });
    expect(await processConnectorMessages(failing, [inbound()])).toEqual({ answered: 1, sent: 0, failed: 1, lastError: "diblokir" });
    expect(failing.recordDelivery).toHaveBeenCalledWith("m-out", { ok: false, retryable: false, reason: "diblokir", attempts: 1 });
  });

  it("does not resend the buyer's own message and survives a failing typing indicator", async () => {
    const withEcho: WidgetResult = {
      status: 200,
      body: { mode: "ai", messages: [{ id: "m-in", author: "customer", content: "serum ready?", created_at: "x" }, ...(answered.status === 200 ? answered.body.messages : [])] },
    };
    const d = deps({ answer: vi.fn(async () => withEcho), acknowledge: vi.fn(async () => Promise.reject(new Error("offline"))) });
    await processConnectorMessages(d, [inbound()]);
    expect(d.send).toHaveBeenCalledTimes(1);
  });
});

describe("connectorGreeting", () => {
  it("introduces the assistant by the persona's name when there is one", () => {
    expect(connectorGreeting("Glow by Sari", { name: "Mimi", salutation: "Kak", emoji: true })).toBe(
      "Halo Kak! Aku Mimi dari Glow by Sari. Mau tanya produk, stok, ongkir, atau cara pesan? Tulis saja di sini 😊",
    );
    expect(connectorGreeting("Toko A", { name: "", salutation: "Bapak/Ibu", emoji: false })).toBe(
      "Halo Bapak/Ibu! Aku asisten Toko A. Mau tanya produk, stok, ongkir, atau cara pesan? Tulis saja di sini.",
    );
  });
});
