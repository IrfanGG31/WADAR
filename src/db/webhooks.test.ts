import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fakeSupabase, type Chain } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.stubEnv("WADAR_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
const { sealSecret } = await import("@/lib/secret-box");
const { dispatchWebhooks } = await import("./webhooks");

const NOW = new Date("2026-10-20T01:00:00Z");
const due = () => [
  {
    event_id: "e1",
    endpoint_id: "w1",
    attempts: 0,
    outbox_events: { id: "e1", type: "sale.created", created_at: "2026-10-20T00:59:00Z", payload: { total: 100000 } },
    webhook_endpoints: { url: "https://hooks.example.com/w", secret_cipher: sealSecret("whsec_test") },
  },
];

function db() {
  return fakeSupabase(
    (c: Chain) => (c.table === "webhook_deliveries" && c.calls[0]?.[0] === "select" ? { data: due(), error: null } : c.table === "tenants" ? { data: { slug: "glow" }, error: null } : { data: null, error: null }),
    () => ({ data: 1, error: null }),
  );
}
const updateOf = (d: ReturnType<typeof db>, table: string) => d.chains.find((c) => c.table === table && c.calls[0]?.[0] === "update")?.calls[0]?.[1];

describe("dispatchWebhooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts the signed event and marks it sent", async () => {
    const d = db();
    const fetchFn = vi.fn(async () => new Response("ok", { status: 200 }));
    expect(await dispatchWebhooks(d.client as unknown as SupabaseClient, "t1", { fetchFn: fetchFn as unknown as typeof fetch, now: NOW })).toEqual({ sent: 1, failed: 0 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://hooks.example.com/w");
    const headers = init.headers as Record<string, string>;
    const t = Math.floor(NOW.getTime() / 1000);
    expect(headers["x-wadar-signature"]).toBe(`t=${t},v1=${createHmac("sha256", "whsec_test").update(`${t}.${init.body}`).digest("hex")}`);
    expect(JSON.parse(init.body as string)).toMatchObject({ type: "sale.created", shop: "glow", data: { total: 100000 } });
    expect(updateOf(d, "webhook_deliveries")).toMatchObject({ status: "sent", attempts: 1, last_error: null });
    expect(d.rpcs[0]).toEqual({ fn: "queue_webhook_deliveries", args: { p_tenant_id: "t1" } });
  });

  it("keeps a failed delivery pending with a retry time", async () => {
    const d = db();
    const fetchFn = vi.fn(async () => new Response("no", { status: 500 }));
    expect(await dispatchWebhooks(d.client as unknown as SupabaseClient, "t1", { fetchFn: fetchFn as unknown as typeof fetch, now: NOW })).toEqual({ sent: 0, failed: 1 });
    expect(updateOf(d, "webhook_deliveries")).toMatchObject({ status: "pending", attempts: 1, last_error: "HTTP 500", next_attempt_at: "2026-10-20T01:01:00.000Z" });
    expect(updateOf(d, "webhook_endpoints")).toMatchObject({ last_status: 500, last_error: "HTTP 500" });
  });
});
