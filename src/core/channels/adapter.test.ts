import { describe, expect, it, vi } from "vitest";
import { NotConnectedAdapter, sendWithRetry, type ChannelAdapter, type SendResult } from "./adapter";

describe("channel adapters (ADR-002)", () => {
  it("a channel that is not connected refuses every webhook and send", async () => {
    const adapter = new NotConnectedAdapter("whatsapp");
    expect((await adapter.verifyWebhook()).kind).toBe("rejected");
    expect(adapter.parseInbound()).toEqual([]);
    expect(await adapter.sendText()).toMatchObject({ ok: false, retryable: false });
  });
});

describe("sendWithRetry", () => {
  const adapterWith = (...results: SendResult[]) => {
    const sendText = vi.fn(async () => results.shift() ?? { ok: false as const, retryable: false, reason: "habis" });
    return { adapter: { kind: "telegram", sendText } as unknown as ChannelAdapter, sendText };
  };

  it("tries once more when the provider says try again", async () => {
    const { adapter, sendText } = adapterWith({ ok: false, retryable: true, reason: "429" }, { ok: true, externalMessageId: "9" });
    expect(await sendWithRetry(adapter, "1", "halo", {}, { pauseMs: 0 })).toEqual({ ok: true, externalMessageId: "9", attempts: 2 });
    expect(sendText).toHaveBeenCalledTimes(2);
  });

  it("stops at a final refusal and at the attempt limit", async () => {
    const blocked = adapterWith({ ok: false, retryable: false, reason: "diblokir" });
    expect(await sendWithRetry(blocked.adapter, "1", "halo", {}, { pauseMs: 0 })).toMatchObject({ ok: false, reason: "diblokir", attempts: 1 });
    const busy = adapterWith({ ok: false, retryable: true, reason: "a" }, { ok: false, retryable: true, reason: "b" }, { ok: true, externalMessageId: "x" });
    expect(await sendWithRetry(busy.adapter, "1", "halo", {}, { pauseMs: 0 })).toMatchObject({ ok: false, reason: "b", attempts: 2 });
    expect(busy.sendText).toHaveBeenCalledTimes(2);
  });
});
