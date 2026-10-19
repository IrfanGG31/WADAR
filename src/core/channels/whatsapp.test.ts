import { describe, expect, it, vi } from "vitest";
import {
  describeWhatsAppError,
  newVerifyToken,
  WhatsAppConnectInput,
  whatsappAdapter,
  whatsappSignature,
  whatsappSubscribeApp,
  whatsappNumberInfo,
} from "./whatsapp";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const SECRET = "0123456789abcdef0123456789abcdef";

const payload = (messages: unknown[], phoneNumberId = "1111") =>
  JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "6281100000000", phone_number_id: phoneNumberId },
              contacts: [{ profile: { name: "Sari" }, wa_id: "6281234567890" }],
              messages,
            },
          },
        ],
      },
    ],
  });
const msg = (over: Record<string, unknown>) => ({ from: "6281234567890", id: "wamid.A1", timestamp: "1760860800", ...over });

describe("WhatsApp Cloud API connector", () => {
  it("accepts the five Meta values and explains a wrong one", () => {
    const good = { phone_number_id: "1111111111", waba_id: "2222222222", app_id: "3333333333", app_secret: SECRET, access_token: "EAAG".padEnd(60, "x") };
    expect(WhatsAppConnectInput.safeParse(good).success).toBe(true);
    const r = WhatsAppConnectInput.safeParse({ ...good, app_secret: "abc" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain("App secret");
    expect(WhatsAppConnectInput.safeParse({ ...good, access_token: "EAAG xx yy".padEnd(40, "z") }).success).toBe(false);
    expect(newVerifyToken()).toMatch(/^wadar_[A-Za-z0-9_-]{20,}$/);
  });

  it("answers Meta's GET handshake only with the right verify token", async () => {
    const adapter = whatsappAdapter();
    const get = (token: string, mode = "subscribe") => ({
      method: "GET",
      headers: {},
      query: { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": "12345" },
      rawBody: "",
    });
    expect(await adapter.verifyWebhook(get("vt"), { verify_token: "vt" })).toEqual({ kind: "challenge", body: "12345" });
    expect((await adapter.verifyWebhook(get("nope"), { verify_token: "vt" })).kind).toBe("rejected");
    expect((await adapter.verifyWebhook(get("vt", "unsubscribe"), { verify_token: "vt" })).kind).toBe("rejected");
  });

  it("checks Meta's signature over the raw body", async () => {
    const adapter = whatsappAdapter();
    const body = payload([msg({ type: "text", text: { body: "halo" } })]);
    const post = (signature: string | undefined, rawBody = body) => ({ method: "POST", headers: { "x-hub-signature-256": signature }, query: {}, rawBody });
    expect((await adapter.verifyWebhook(post(whatsappSignature(SECRET, body)), { app_secret: SECRET })).kind).toBe("ok");
    expect((await adapter.verifyWebhook(post(whatsappSignature(SECRET, body), body.replace("halo", "HALO")), { app_secret: SECRET })).kind).toBe("rejected");
    expect((await adapter.verifyWebhook(post(whatsappSignature("f".repeat(32), body)), { app_secret: SECRET })).kind).toBe("rejected");
    expect((await adapter.verifyWebhook(post(undefined), { app_secret: SECRET })).kind).toBe("rejected");
    expect((await adapter.verifyWebhook(post("sha256=zz"), { app_secret: SECRET })).kind).toBe("rejected");
  });

  it("reads text, buttons, list picks and captions; flags media without words", () => {
    const adapter = whatsappAdapter();
    const parsed = adapter.parseInbound(
      payload([
        msg({ id: "w1", type: "text", text: { body: " serum ready? " } }),
        msg({ id: "w2", type: "button", button: { text: "Mau pesan" } }),
        msg({ id: "w3", type: "interactive", interactive: { type: "list_reply", list_reply: { title: "Serum Vit C" } } }),
        msg({ id: "w4", type: "image", image: { caption: "yang ini ada?" } }),
        msg({ id: "w5", type: "audio", audio: {} }),
        msg({ id: "w6", type: "reaction", reaction: { emoji: "👍" } }),
      ]),
    );
    expect(parsed.map((m) => [m.externalMessageId, m.text, m.unsupported ?? false])).toEqual([
      ["w1", "serum ready?", false],
      ["w2", "Mau pesan", false],
      ["w3", "Serum Vit C", false],
      ["w4", "yang ini ada?", false],
      ["w5", "", true],
    ]);
    expect(parsed[0]).toMatchObject({ externalUserId: "6281234567890", displayName: "Sari", recipientId: "1111", receivedAt: "2025-10-19T08:00:00.000Z" });
  });

  it("ignores delivery statuses and other objects", () => {
    const adapter = whatsappAdapter();
    const statusOnly = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { statuses: [{ id: "wamid.X", status: "read" }] } }] }],
    });
    expect(adapter.parseInbound(statusOnly)).toEqual([]);
    expect(adapter.parseInbound(JSON.stringify({ object: "page", entry: [] }))).toEqual([]);
    expect(adapter.parseInbound("{")).toEqual([]);
  });

  it("sends text and separates final refusals from retryable ones", async () => {
    const fetchFn = vi.fn(async () => json(200, { messaging_product: "whatsapp", messages: [{ id: "wamid.OUT" }] }));
    const adapter = whatsappAdapter(fetchFn as unknown as typeof fetch);
    const creds = { phone_number_id: "1111", access_token: "TOKEN" };
    expect(await adapter.sendText("6281234567890", "Halo Kak", creds)).toEqual({ ok: true, externalMessageId: "wamid.OUT" });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v23.0/1111/messages");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer TOKEN");
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "6281234567890",
      type: "text",
      text: { preview_url: false, body: "Halo Kak" },
    });

    const late = whatsappAdapter((async () => json(400, { error: { code: 131047, message: "Re-engagement message" } })) as unknown as typeof fetch);
    expect(await late.sendText("62", "x", creds)).toEqual({ ok: false, retryable: false, reason: expect.stringContaining("24 jam") });
    const busy = whatsappAdapter((async () => json(400, { error: { code: 130429, message: "Rate limit hit" } })) as unknown as typeof fetch);
    expect(await busy.sendText("62", "x", creds)).toMatchObject({ ok: false, retryable: true });
    const down = whatsappAdapter((async () => json(503, {})) as unknown as typeof fetch);
    expect(await down.sendText("62", "x", creds)).toMatchObject({ ok: false, retryable: true });
  });

  it("registers WADAR's webhook with the app token and checks the number", async () => {
    const fetchFn = vi.fn(async () => json(200, { success: true }));
    const r = await whatsappSubscribeApp(
      { appId: "3333", appSecret: SECRET, callbackUrl: "https://wadar.app/api/channels/whatsapp/abc", verifyToken: "vt" },
      fetchFn as unknown as typeof fetch,
    );
    expect(r).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v23.0/3333/subscriptions");
    const form = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(form)).toMatchObject({
      object: "whatsapp_business_account",
      callback_url: "https://wadar.app/api/channels/whatsapp/abc",
      verify_token: "vt",
      fields: "messages",
      access_token: `3333|${SECRET}`,
    });

    const expired = (async () => json(401, { error: { code: 190, message: "Error validating access token" } })) as unknown as typeof fetch;
    expect(await whatsappNumberInfo("1111", "TOKEN", expired)).toEqual({ ok: false, error: expect.stringContaining("kedaluwarsa") });
  });

  it("speaks plainly about common Graph errors", () => {
    expect(describeWhatsAppError(131030, "Recipient not in allowed list")).toContain("Mode uji");
    expect(describeWhatsAppError(null, "Tidak bisa menghubungi Meta.")).toBe("Tidak bisa menghubungi Meta.");
    expect(describeWhatsAppError(999, "Something odd")).toBe("WhatsApp menolak: Something odd");
  });
});
