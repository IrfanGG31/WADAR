import { describe, expect, it, vi } from "vitest";
import { FonnteConnectInput, fonnteAdapter, fonnteValidateToken } from "./fonnte";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const TOKEN = "abcdef1234567890ABCDEF";

describe("Fonnte connector", () => {
  it("accepts a valid token and rejects short ones", () => {
    expect(FonnteConnectInput.safeParse({ token: ` ${TOKEN} ` }).success).toBe(true);
    expect(FonnteConnectInput.safeParse({ token: "short" }).success).toBe(false);
    expect(FonnteConnectInput.safeParse({ token: "" }).success).toBe(false);
  });

  it("verifies the secret query param (timing-safe)", async () => {
    const adapter = fonnteAdapter();
    const creds = { webhook_secret: "s3cret-token" };
    const req = (secret?: string, method = "POST") => ({ method, headers: {}, query: { secret }, rawBody: "{}" });
    expect((await adapter.verifyWebhook(req("s3cret-token"), creds)).kind).toBe("ok");
    expect((await adapter.verifyWebhook(req("wrong-token"), creds)).kind).toBe("rejected");
    expect((await adapter.verifyWebhook(req(undefined), creds)).kind).toBe("rejected");
    expect((await adapter.verifyWebhook(req("s3cret-token", "GET"), creds)).kind).toBe("rejected");
    expect((await adapter.verifyWebhook(req("s3cret-token"), {})).kind).toBe("rejected");
  });

  it("parses a standard Fonnte inbound message", () => {
    const adapter = fonnteAdapter();
    const body = JSON.stringify({ sender: "6281234567890", message: "  serum ready? ", name: "Sari", timestamp: "1760860800", inboxid: "abc123" });
    const result = adapter.parseInbound(body);
    expect(result).toEqual([
      {
        externalMessageId: "abc123",
        externalUserId: "6281234567890",
        displayName: "Sari",
        text: "serum ready?",
        receivedAt: "2025-10-19T08:00:00.000Z",
      },
    ]);
  });

  it("uses text field as fallback and handles missing name", () => {
    const adapter = fonnteAdapter();
    const body = JSON.stringify({ sender: "628111", text: "hai" });
    const result = adapter.parseInbound(body);
    expect(result[0]).toMatchObject({ text: "hai", displayName: null });
  });

  it("marks empty text as unsupported (media without caption)", () => {
    const adapter = fonnteAdapter();
    const body = JSON.stringify({ sender: "628111", url: "https://example.com/photo.jpg" });
    expect(adapter.parseInbound(body)[0]).toMatchObject({ text: "", unsupported: true });
  });

  it("ignores invalid JSON and missing sender", () => {
    const adapter = fonnteAdapter();
    expect(adapter.parseInbound("not json")).toEqual([]);
    expect(adapter.parseInbound(JSON.stringify({}))).toEqual([]);
    expect(adapter.parseInbound(JSON.stringify({ sender: "" }))).toEqual([]);
  });

  it("sends text and returns the message id", async () => {
    const fetchFn = vi.fn(async () => json(200, { status: true, id: "msg-42" }));
    const adapter = fonnteAdapter(fetchFn as unknown as typeof fetch);
    expect(await adapter.sendText("628111", "Halo Kak", { token: TOKEN })).toEqual({ ok: true, externalMessageId: "msg-42" });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.fonnte.com/send");
    expect(JSON.parse(init.body as string)).toMatchObject({ target: "628111", message: "Halo Kak" });
    expect((init.headers as Record<string, string>).Authorization).toBe(TOKEN);
  });

  it("handles 401 as non-retryable", async () => {
    const adapter = fonnteAdapter((async () => json(401, { status: false, reason: "Unauthorized" })) as unknown as typeof fetch);
    const r = await adapter.sendText("628111", "x", { token: TOKEN });
    expect(r).toMatchObject({ ok: false, retryable: false });
  });

  it("handles 429 as retryable", async () => {
    const adapter = fonnteAdapter((async () => json(429, { status: false, reason: "Rate limit" })) as unknown as typeof fetch);
    const r = await adapter.sendText("628111", "x", { token: TOKEN });
    expect(r).toMatchObject({ ok: false, retryable: true });
  });

  it("handles timeout as retryable", async () => {
    const adapter = fonnteAdapter((async () => { throw Object.assign(new Error("timeout"), { name: "TimeoutError" }); }) as unknown as typeof fetch);
    const r = await adapter.sendText("628111", "x", { token: TOKEN });
    expect(r).toMatchObject({ ok: false, retryable: true });
  });

  it("validates token against Fonnte device endpoint", async () => {
    const ok = await fonnteValidateToken(TOKEN, (async () => json(200, { status: true, device_name: "Sari Shop" })) as unknown as typeof fetch);
    expect(ok).toEqual({ ok: true, device: "Sari Shop" });

    const bad = await fonnteValidateToken(TOKEN, (async () => json(401, { status: false })) as unknown as typeof fetch);
    expect(bad).toMatchObject({ ok: false });
  });
});
