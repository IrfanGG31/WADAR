import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnswerStore } from "@/core/answer-cache";

vi.mock("server-only", () => ({}));
const table = new Map<string, unknown>();
vi.mock("./answer-cache", () => ({
  tableAnswerStore: (_db: unknown, tenantId: string): AnswerStore => ({
    get: async <V>(k: string) => (table.get(`${tenantId}:${k}`) as V) ?? null,
    set: async (k, v) => void table.set(`${tenantId}:${k}`, v),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
const loadConsultData = vi.fn(async (_shop: unknown, today: string) => ({ today, stock: [], lines: [], expenses: [], insights: [] }));
const getWeeklyInsights = vi.fn(async () => ({ weekStart: "2026-10-12", saved: false, selected: [] }));
vi.mock("./consult", () => ({
  loadConsultData: (...a: [unknown, string]) => loadConsultData(...a),
  getWeeklyInsights: () => getWeeklyInsights(),
}));

const { getBerandaInsight } = await import("./beranda-insight");
const shop = (id: string) => ({ id, name: "Glow", slug: "glow", timezone: "Asia/Jakarta", is_demo: false, business_type: null });

beforeEach(() => {
  table.clear();
  vi.clearAllMocks();
});

describe("getBerandaInsight", () => {
  it("loads the shop's data once per day; later opens read the shared cache", async () => {
    const first = await getBerandaInsight(shop("t-a"), "2026-10-17");
    const second = await getBerandaInsight(shop("t-a"), "2026-10-17");
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.items).toEqual(first.items);
    expect(loadConsultData).toHaveBeenCalledTimes(1);
    expect(loadConsultData.mock.calls[0][1]).toBe("2026-10-17");
    expect([...table.keys()]).toHaveLength(1);
  });

  it("each shop gets its own entry", async () => {
    await getBerandaInsight(shop("t-b"), "2026-10-17");
    await getBerandaInsight(shop("t-c"), "2026-10-17");
    expect(loadConsultData).toHaveBeenCalledTimes(2);
  });
});
