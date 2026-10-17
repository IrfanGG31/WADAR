import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import vercel from "../../../../../vercel.json";
import { isPublicPath } from "@/proxy";

const admin = { tag: "service-role" };
const listShopsForRollup = vi.fn(async (db: unknown) => {
  if (db !== admin) throw new Error("not service role");
  return [{ id: "t1", timezone: "Asia/Jakarta" }];
});
const rollupShopDays = vi.fn(async (db: unknown, tenantId: string, window: { from: string; to: string }) => {
  if (db !== admin || !tenantId || window.from > window.to) throw new Error("bad call");
  return { fin_rows: 2, stock_rows: 3 };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
vi.mock("@/db/rollup", () => ({
  listShopsForRollup: (db: unknown) => listShopsForRollup(db),
  rollupShopDays: (db: unknown, t: string, w: { from: string; to: string }) => rollupShopDays(db, t, w),
}));

const { GET } = await import("./route");
const call = (auth?: string, query = "") =>
  GET(new Request(`https://wadar.test/api/cron/daily-rollup${query}`, { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/daily-rollup (Vercel Cron)", () => {
  it("refuses to run without CRON_SECRET configured, or with a missing / wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer s3cret")).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer salah")).status).toBe(401);
    expect(listShopsForRollup).not.toHaveBeenCalled();
    expect(rollupShopDays).not.toHaveBeenCalled();
  });

  it("rolls up the last 2 closed days of every shop with the service-role client", async () => {
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ days: 2, shops: 1, fin_rows: 2, stock_rows: 3, errors: [] });
    const [, tenantId, window] = rollupShopDays.mock.calls[0];
    expect(tenantId).toBe("t1");
    expect(window.to < window.from).toBe(false);
  });

  it("?days=7 backfills a longer window (capped at 31)", async () => {
    expect(await (await call("Bearer s3cret", "?days=7")).json()).toMatchObject({ days: 7 });
    expect(await (await call("Bearer s3cret", "?days=999")).json()).toMatchObject({ days: 31 });
    expect(await (await call("Bearer s3cret", "?days=abc")).json()).toMatchObject({ days: 2 });
  });

  it("is scheduled daily after midnight WIB in vercel.json and reachable without a session", () => {
    expect(vercel.crons).toContainEqual({ path: "/api/cron/daily-rollup", schedule: "30 17 * * *" });
    expect(isPublicPath("/api/cron/daily-rollup")).toBe(true);
  });
});
