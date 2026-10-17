import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WeeklyDigest } from "@/core/consult/weekly-job";
import { fakeSupabase, has } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));
const loadConsultData = vi.fn<(shop: unknown, today: string, opts: unknown) => Promise<unknown>>(async (_shop, today) => ({ today, insights: [] }));
const getWeeklyInsights = vi.fn<(shop: unknown, data: unknown, opts: unknown) => Promise<unknown>>(async () => ({
  weekStart: "2026-10-19",
  saved: true,
  selected: [{ type: "low_stock", urgency: 3, impact: 0, score: 0, title: "Stok menipis", text: "Serum tinggal 2", dedupe_key: "low_stock:v1", evidence: {} }],
}));
const recordConsultRuns = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
vi.mock("./consult", () => ({
  loadConsultData: (...a: [unknown, string, unknown]) => loadConsultData(...a),
  getWeeklyInsights: (...a: [unknown, unknown, unknown]) => getWeeklyInsights(...a),
  recordConsultRuns: (...a: unknown[]) => recordConsultRuns(...a),
}));
vi.mock("./answer-cache", () => ({ tableAnswerStore: () => ({ get: async () => null, set: async () => {} }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));

const { buildDigestContent, digestExists, getWeeklyDigest, listDigestShops, markDigestDelivery, saveDigest } = await import("./weekly-digest");

let db = fakeSupabase();
const DIGEST: WeeklyDigest = {
  tenant_id: "t1",
  week_start: "2026-10-19",
  text: "Ada 1 hal yang perlu perhatianmu minggu ini.",
  points: ["Stok menipis: Serum tinggal 2"],
  insight_keys: ["low_stock:v1"],
  engine: "offline",
  model: "offline:template-v1",
  source: "offline",
  generated_by: "cron",
};

beforeEach(() => {
  db = fakeSupabase();
  vi.clearAllMocks();
});

describe("weekly digest store", () => {
  it("lists shops not scheduled for deletion (works before the deletion migration too)", async () => {
    db = fakeSupabase(() => ({
      data: [
        { id: "t1", name: "Glow", slug: "glow", timezone: "Asia/Jakarta", is_demo: false, business_type: null, deletion_requested_at: null },
        { id: "t2", name: "Tutup", slug: "tutup", timezone: "Asia/Jakarta", is_demo: false, business_type: null, deletion_requested_at: "2026-10-17T00:00:00Z" },
        { id: "t3", name: "Lama", slug: "lama", timezone: "Asia/Makassar", is_demo: true, business_type: null },
      ],
      error: null,
    }));
    const shops = await listDigestShops(db.client as never);
    expect(shops.map((s) => s.slug)).toEqual(["glow", "lama"]);
    expect(db.chains[0].table).toBe("tenants");
  });

  it("save is insert-if-absent on (tenant_id, week_start): true only when this call inserted", async () => {
    db = fakeSupabase(() => ({ data: [{ id: "d1" }], error: null }));
    expect(await saveDigest(db.client as never, DIGEST)).toBe(true);
    const chain = db.chains[0];
    expect(chain.table).toBe("weekly_insight_digests");
    expect(has(chain, "upsert", { ...DIGEST }, { onConflict: "tenant_id,week_start", ignoreDuplicates: true })).toBe(true);

    db = fakeSupabase(() => ({ data: [], error: null }));
    expect(await saveDigest(db.client as never, DIGEST)).toBe(false);
  });

  it("exists / delivery status are per shop and week", async () => {
    db = fakeSupabase(() => ({ data: { id: "d1" }, error: null }));
    expect(await digestExists(db.client as never, "t1", "2026-10-19")).toBe(true);
    expect(has(db.chains[0], "eq", "tenant_id", "t1")).toBe(true);
    expect(has(db.chains[0], "eq", "week_start", "2026-10-19")).toBe(true);

    await markDigestDelivery(db.client as never, "t1", "2026-10-19", { status: "failed", error: "smtp down" });
    const update = db.chains[1];
    expect(has(update, "update", { delivery_status: "failed", delivery_error: "smtp down", delivered_at: null })).toBe(true);
    expect(has(update, "eq", "tenant_id", "t1")).toBe(true);
  });

  it("read errors surface (the job reports the shop as failed instead of making a duplicate)", async () => {
    db = fakeSupabase(() => ({ data: null, error: { code: "57014", message: "timeout" } }));
    await expect(digestExists(db.client as never, "t1", "2026-10-19")).rejects.toMatchObject({ code: "57014" });
  });
});

describe("getWeeklyDigest (Beranda reads the stored digest)", () => {
  it("returns this week's stored row for the shop", async () => {
    db = fakeSupabase(() => ({ data: { ...DIGEST, created_at: "2026-10-19T00:00:03Z" }, error: null }));
    const d = await getWeeklyDigest("t1", "2026-10-19");
    expect(d).toMatchObject({ text: DIGEST.text, points: DIGEST.points, generated_by: "cron" });
    expect(has(db.chains[0], "eq", "tenant_id", "t1")).toBe(true);
    expect(has(db.chains[0], "eq", "week_start", "2026-10-19")).toBe(true);
  });

  it("no row, or the table not there yet (migration not applied) → null, Beranda falls back", async () => {
    db = fakeSupabase(() => ({ data: null, error: null }));
    expect(await getWeeklyDigest("t1", "2026-10-19")).toBeNull();
    db = fakeSupabase(() => ({ data: null, error: { code: "42P01", message: "relation does not exist" } }));
    expect(await getWeeklyDigest("t1", "2026-10-19")).toBeNull();
  });
});

describe("buildDigestContent", () => {
  it("stores the week's insights, narrates them and meters the run — all with the given client", async () => {
    const narrateWeekly = vi.fn(async () => ({ text: "Narasi", engine: "offline" as const, model: "offline:template-v1", source: "offline" as const, fallbackReason: "no_key", attempts: [] }));
    const shop = { id: "t1", name: "Glow", slug: "glow", timezone: "Asia/Jakarta", is_demo: false, business_type: null };
    const content = await buildDigestContent(db.client as never, { narrateWeekly } as never, shop, "2026-10-19");
    expect(content).toEqual({
      text: "Narasi",
      points: ["Stok menipis: Serum tinggal 2"],
      insight_keys: ["low_stock:v1"],
      engine: "offline",
      model: "offline:template-v1",
      source: "offline",
    });
    expect(loadConsultData).toHaveBeenCalledWith(shop, "2026-10-19", { db: db.client });
    expect(getWeeklyInsights.mock.calls[0][2]).toEqual({ persist: true, db: db.client });
    expect(recordConsultRuns.mock.calls[0][2]).toBe(db.client);
  });
});
