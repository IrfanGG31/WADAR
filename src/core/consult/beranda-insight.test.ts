import { describe, expect, it, vi } from "vitest";
import { memoryAnswerStore, type AnswerStore } from "../answer-cache";
import { narrateStockOverview } from "../stock-insight";
import { berandaInsightKey, buildBerandaInsight, dailyBerandaInsight, type BerandaInsight } from "./beranda-insight";
import type { InsightCandidate } from "./insights";

const LOW: InsightCandidate = {
  type: "stock_critical",
  urgency: 3,
  impact: 0,
  score: 0,
  title: "Stok menipis",
  text: "Serum tinggal 2",
  dedupe_key: "stock_critical:svc-20",
  evidence: {},
};
const insight = (text: string): BerandaInsight => ({ day: "2026-10-17", items: [{ key: "stock_critical:svc-20", type: "stock_critical", title: "Stok menipis", text }] });

describe("dailyBerandaInsight (CON-5: 1×/hari/toko, bukan per buka halaman)", () => {
  it("first open of the day computes and stores; the next open the same day reads the cache without computing", async () => {
    const store = memoryAnswerStore();
    const compute = vi.fn(async () => insight("Serum tinggal 2"));
    expect(await dailyBerandaInsight(store, "t1", "2026-10-17", compute)).toMatchObject({ cached: false, items: [{ text: "Serum tinggal 2" }] });
    expect(await dailyBerandaInsight(store, "t1", "2026-10-17", compute)).toMatchObject({ cached: true, items: [{ text: "Serum tinggal 2" }] });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("a new shop-local day or another shop computes again", async () => {
    const store = memoryAnswerStore();
    const compute = vi.fn(async () => insight("x"));
    await dailyBerandaInsight(store, "t1", "2026-10-17", compute);
    await dailyBerandaInsight(store, "t1", "2026-10-18", compute);
    await dailyBerandaInsight(store, "t2", "2026-10-17", compute);
    expect(compute).toHaveBeenCalledTimes(3);
    expect(berandaInsightKey("t1", "2026-10-17")).not.toBe(berandaInsightKey("t2", "2026-10-17"));
  });

  it("a broken cache never breaks Beranda: it just computes", async () => {
    const broken: AnswerStore = { get: async () => Promise.reject(new Error("down")), set: async () => Promise.reject(new Error("down")) };
    const compute = vi.fn(async () => insight("Serum tinggal 2"));
    expect(await dailyBerandaInsight(broken, "t1", "2026-10-17", compute)).toMatchObject({ cached: false });
    expect(compute).toHaveBeenCalledTimes(1);
  });
});

describe("buildBerandaInsight", () => {
  it("this week's top insights become the items", () => {
    expect(buildBerandaInsight({ today: "2026-10-17", selected: [LOW], data: { stock: [], lines: [], expenses: [] } }).items).toEqual([
      { key: "stock_critical:svc-20", type: "stock_critical", title: "Stok menipis", text: "Serum tinggal 2" },
    ]);
  });

  it("nothing selected → the stock and finance one-liners", () => {
    const r = buildBerandaInsight({ today: "2026-10-17", selected: [], data: { stock: [], lines: [], expenses: [] } });
    expect(r.items).toEqual([
      { key: "stok", type: "stok", title: "Prediksi Stok", text: narrateStockOverview([]) },
      { key: "keuangan", type: "keuangan", title: "Analisis Keuangan", text: "Belum ada penjualan 14 hari terakhir." },
    ]);
  });
});
