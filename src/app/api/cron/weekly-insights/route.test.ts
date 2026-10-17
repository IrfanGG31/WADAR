import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPublicPath } from "@/proxy";

const shops = [
  { id: "t1", name: "Glow", slug: "glow", timezone: "Asia/Jakarta", is_demo: false, business_type: null },
  { id: "t2", name: "Kopi", slug: "kopi", timezone: "Asia/Jakarta", is_demo: true, business_type: null },
];
const table = new Map<string, unknown>();
const admin = { tag: "service-role" };
const build = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ text: "Narasi", points: [], insight_keys: [], engine: "offline", model: "offline:template-v1", source: "offline" }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
vi.mock("@/ai", () => ({ getConsult: () => ({ narrateWeekly: vi.fn() }) }));
vi.mock("@/db/weekly-digest", () => ({
  listDigestShops: async (db: unknown) => (db === admin ? shops : []),
  digestExists: async (_db: unknown, t: string, w: string) => table.has(`${t}:${w}`),
  buildDigestContent: (...a: unknown[]) => build(...a),
  saveDigest: async (_db: unknown, d: { tenant_id: string; week_start: string }) => {
    if (table.has(`${d.tenant_id}:${d.week_start}`)) return false;
    table.set(`${d.tenant_id}:${d.week_start}`, d);
    return true;
  },
  markDigestDelivery: async () => {},
}));

const { GET } = await import("./route");
const call = (auth?: string) => GET(new Request("https://wadar.test/api/cron/weekly-insights", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  table.clear();
  build.mockClear();
  vi.stubEnv("CRON_SECRET", "s3cret");
  vi.useFakeTimers({ now: new Date("2026-10-19T00:00:00Z"), toFake: ["Date"] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("GET /api/cron/weekly-insights (Vercel Cron)", () => {
  it("refuses to run without CRON_SECRET configured, or with a wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer s3cret")).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer salah")).status).toBe(401);
    expect(build).not.toHaveBeenCalled();
  });

  it("stores one digest per shop for this week with the service-role client, then is a no-op on re-run", async () => {
    const first = await call("Bearer s3cret");
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ shops: 2, created: 2, skipped: 0, failed: 0 });
    expect([...table.keys()]).toEqual(["t1:2026-10-19", "t2:2026-10-19"]);
    expect(build.mock.calls[0][0]).toBe(admin);

    const again = await call("Bearer s3cret");
    expect(await again.json()).toMatchObject({ created: 0, skipped: 2 });
    expect(build).toHaveBeenCalledTimes(2);
  });

  it("is reachable without a user session (the proxy does not send it to /masuk)", () => {
    expect(isPublicPath("/api/cron/weekly-insights")).toBe(true);
  });
});
