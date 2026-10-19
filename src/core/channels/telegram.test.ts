import { describe, expect, it, vi } from "vitest";
import { newWebhookSecret, TelegramConnectInput, telegramAdapter, telegramGetMe, telegramSetWebhook } from "./telegram";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const TOKEN = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";

const update = (message: Record<string, unknown>) =>
  JSON.stringify({ update_id: 1, message: { message_id: 7, date: 1760860800, chat: { id: 555, type: "private" }, from: { first_name: "Sari", last_name: "W" }, ...message } });

describe("Telegram connector", () => {
  it("accepts a BotFather token and refuses anything else", () => {
    expect(TelegramConnectInput.safeParse({ bot_token: ` ${TOKEN} ` }).success).toBe(true);
    expect(TelegramConnectInput.safeParse({ bot_token: "AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw" }).success).toBe(false);
    expect(TelegramConnectInput.safeParse({ bot_token: "123:abc" }).success).toBe(false);
  });

  it("webhook secrets use only the characters Telegram allows", () => {
    expect(newWebhookSecret()).toMatch(/^[A-Za-z0-9_-]{40,256}$/);
    expect(newWebhookSecret()).not.toBe(newWebhookSecret());
  });

  it("verifies the secret token header", async () => {
    const adapter = telegramAdapter();
    const creds = { webhook_secret: "s3cret" };
    const req = (secret?: string, method = "POST") => ({ method, headers: { "x-telegram-bot-api-secret-token": secret }, query: {}, rawBody: "{}" });
    expect((await adapter.verifyWebhook(req("s3cret"), creds)).kind).toBe("ok");
    expect((await adapter.verifyWebhook(req("s3cret!"), creds)).kind).toBe("rejected");
    expect((await adapter.verifyWebhook(req(undefined), creds)).kind).toBe("rejected");
    expect((await adapter.verifyWebhook(req("s3cret", "GET"), creds)).kind).toBe("rejected");
    expect((await adapter.verifyWebhook(req("s3cret"), {})).kind).toBe("rejected");
  });

  it("reads private text messages and photo captions", () => {
    const adapter = telegramAdapter();
    expect(adapter.parseInbound(update({ text: "  serum ready? " }))).toEqual([
      { externalMessageId: "555:7", externalUserId: "555", displayName: "Sari W", text: "serum ready?", receivedAt: "2025-10-19T08:00:00.000Z" },
    ]);
    expect(adapter.parseInbound(update({ caption: "ada warna lain?" }))[0]).toMatchObject({ text: "ada warna lain?" });
  });

  it("marks stickers/voice as unsupported and ignores groups, bots and junk", () => {
    const adapter = telegramAdapter();
    expect(adapter.parseInbound(update({ sticker: {} }))[0]).toMatchObject({ text: "", unsupported: true });
    expect(adapter.parseInbound(update({ text: "hai", chat: { id: -100, type: "group" } }))).toEqual([]);
    expect(adapter.parseInbound(update({ text: "hai", from: { is_bot: true } }))).toEqual([]);
    expect(adapter.parseInbound(JSON.stringify({ update_id: 2, edited_message: {} }))).toEqual([]);
    expect(adapter.parseInbound("not json")).toEqual([]);
  });

  it("sends plain text and maps refusals", async () => {
    const fetchFn = vi.fn(async () => json(200, { ok: true, result: { message_id: 99 } }));
    const adapter = telegramAdapter(fetchFn as unknown as typeof fetch);
    expect(await adapter.sendText("555", "Halo Kak", { bot_token: TOKEN })).toEqual({ ok: true, externalMessageId: "99" });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(JSON.parse(init.body as string)).toMatchObject({ chat_id: "555", text: "Halo Kak" });

    const blocked = telegramAdapter((async () => json(403, { ok: false, description: "Forbidden: bot was blocked by the user" })) as unknown as typeof fetch);
    expect(await blocked.sendText("555", "x", { bot_token: TOKEN })).toMatchObject({ ok: false, retryable: false });
    const busy = telegramAdapter((async () => json(429, { ok: false, description: "Too Many Requests", parameters: { retry_after: 3 } })) as unknown as typeof fetch);
    expect(await busy.sendText("555", "x", { bot_token: TOKEN })).toMatchObject({ ok: false, retryable: true });
    const offline = telegramAdapter((async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    expect(await offline.sendText("555", "x", { bot_token: TOKEN })).toMatchObject({ ok: false, retryable: true, reason: "Tidak bisa menghubungi Telegram." });
  });

  it("explains a wrong token and a non-https webhook in plain words", async () => {
    const bad = (async () => json(401, { ok: false, error_code: 401, description: "Unauthorized" })) as unknown as typeof fetch;
    expect(await telegramGetMe(TOKEN, bad)).toEqual({ ok: false, error: expect.stringContaining("Token bot salah") });
    const http = (async () => json(400, { ok: false, description: "Bad Request: bad webhook: An HTTPS URL must be provided for webhook" })) as unknown as typeof fetch;
    expect(await telegramSetWebhook(TOKEN, "http://localhost:3000/x", "s", http)).toEqual({ ok: false, error: expect.stringContaining("https") });
  });

  it("registers the webhook for messages only, with the secret", async () => {
    const fetchFn = vi.fn(async () => json(200, { ok: true, result: true }));
    expect(await telegramSetWebhook(TOKEN, "https://wadar.app/api/channels/telegram/abc", "sec", fetchFn as unknown as typeof fetch)).toEqual({ ok: true });
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      url: "https://wadar.app/api/channels/telegram/abc",
      secret_token: "sec",
      allowed_updates: ["message"],
      drop_pending_updates: true,
      max_connections: 20,
    });
  });
});
