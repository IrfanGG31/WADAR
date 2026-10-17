import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import vercel from "../../../../../vercel.json";
import { isPublicPath } from "@/proxy";

const admin = { tag: "service-role" };
let dueShops = 0;
let expiredRows = 0;
const purgeDueShops = vi.fn(async (db: unknown) => {
  if (db !== admin) throw new Error("not service role");
  const n = dueShops;
  dueShops = 0;
  return n;
});
const pruneExpiredAnswerCache = vi.fn(async (db: unknown, now: Date) => {
  if (!(now instanceof Date)) throw new Error("now required");
  if (db !== admin) throw new Error("not service role");
  const n = expiredRows;
  expiredRows = 0;
  return n;
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
vi.mock("@/db/maintenance", () => ({
  purgeDueShops: (db: unknown) => purgeDueShops(db),
  pruneExpiredAnswerCache: (db: unknown, now: Date) => pruneExpiredAnswerCache(db, now),
}));

const { GET } = await import("./route");
const call = (auth?: string) => GET(new Request("https://wadar.test/api/cron/daily-cleanup", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  dueShops = 2;
  expiredRows = 9;
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "s3cret");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/daily-cleanup (Vercel Cron)", () => {
  it("refuses to run without CRON_SECRET configured, or with a missing / wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer s3cret")).status).toBe(503);
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer salah")).status).toBe(401);
    expect(purgeDueShops).not.toHaveBeenCalled();
    expect(pruneExpiredAnswerCache).not.toHaveBeenCalled();
  });

  it("purges due shops and prunes the answer cache with the service-role client, then is a no-op on re-run", async () => {
    const first = await call("Bearer s3cret");
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ purged_shops: 2, pruned_cache_rows: 9, errors: [] });
    expect(purgeDueShops).toHaveBeenCalledWith(admin);
    expect(pruneExpiredAnswerCache.mock.calls[0][0]).toBe(admin);

    const again = await call("Bearer s3cret");
    expect(await again.json()).toMatchObject({ purged_shops: 0, pruned_cache_rows: 0, errors: [] });
  });

  it("is scheduled daily in vercel.json and reachable without a session", () => {
    expect(vercel.crons).toContainEqual({ path: "/api/cron/daily-cleanup", schedule: "0 19 * * *" });
    expect(isPublicPath("/api/cron/daily-cleanup")).toBe(true);
  });
});
