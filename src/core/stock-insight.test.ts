import { describe, expect, it } from "vitest";
import { forecastStock, type StockDailyRow, type StockInput } from "./stock";
import {
  categoriesOf,
  countByStatus,
  DEFAULT_FORECAST_FILTER,
  filterForecastRows,
  formatDaysLeft,
  formatRate,
  narrateSlowMoving,
  narrateStockOverview,
  NO_CATEGORY,
  slowMovingSummary,
  sortByUrgency,
  toForecastRow,
  type ForecastRow,
  type StockItem,
} from "./stock-insight";

function days(n: number, sold: (i: number) => number, opening = 50): StockDailyRow[] {
  return Array.from({ length: n }, (_, i) => ({
    day: `2026-09-${String(i + 1).padStart(2, "0")}`,
    opening,
    sold: sold(i),
  }));
}

function item(partial: Partial<StockItem> = {}): StockItem {
  return {
    variant_id: "V1",
    product_id: "P1",
    product_name: "Serum Vit C",
    option_label: null,
    category: "Serum",
    unit: "pcs",
    on_hand: 7,
    avg_cost: 45_000,
    cost_is_set: true,
    min_stock: 5,
    lead_time_days: 4,
    pack_size: 10,
    ...partial,
  };
}

/** Build a row exactly like the db layer does: forecastStock → toForecastRow. */
function rowFor(meta: StockItem, daily: StockDailyRow[]): { row: ForecastRow; input: StockInput } {
  const input: StockInput = {
    on_hand: meta.on_hand,
    avg_cost: meta.avg_cost,
    min_stock: meta.min_stock,
    lead_time_days: meta.lead_time_days,
    pack_size: meta.pack_size,
    daily,
  };
  return { row: toForecastRow(meta, forecastStock(input)), input };
}

/** Every number written in an Indonesian sentence ("Rp1.200.000", "2,4", "±3"). */
function numbersIn(text: string): number[] {
  return (text.match(/\d[\d.]*(?:,\d+)?/g) ?? []).map((t) => Number(t.replace(/\./g, "").replace(",", ".")));
}

const urgent = rowFor(item(), days(28, (i) => (i % 2 === 0 ? 2 : 3)));
const healthy = rowFor(item({ variant_id: "V2", product_name: "Toner", category: "Toner", on_hand: 100 }), days(28, () => 2));
const slow = rowFor(
  item({ variant_id: "V3", product_name: "Hair Mist", category: "Rambut", on_hand: 30, avg_cost: 40_000 }),
  days(56, (i) => (i < 20 ? 1 : 0)),
);
const slowCover = rowFor(
  item({ variant_id: "V4", product_name: "Body Scrub", category: null, on_hand: 120, avg_cost: 27_000 }),
  days(28, (i) => (i % 2 === 0 ? 1 : 0)),
);
const empty = rowFor(item({ variant_id: "V5", product_name: "Lip Tint", on_hand: 0, min_stock: 3 }), []);
const rows = [healthy.row, slow.row, urgent.row, slowCover.row, empty.row];

describe("toForecastRow — table numbers are forecastStock's numbers", () => {
  it.each([urgent, healthy, slow, slowCover, empty])("matches the core forecast field by field (%#)", ({ row, input }) => {
    const f = forecastStock(input);
    expect(row.rate).toBe(f.v);
    expect(row.safety_stock).toBe(f.safety_stock);
    expect(row.rop).toBe(f.rop);
    expect(row.days_left).toBe(Number.isFinite(f.days_left) ? f.days_left : null);
    expect(row.stockout_in_days).toBe(f.stockout_in_days);
    expect(row.status).toBe(f.status);
    expect(row.reorder_qty).toBe(f.reorder_qty);
    expect(row.slow_moving).toBe(f.slow_moving);
    expect(row.idle_capital).toBe(f.idle_capital);
    expect(row.on_hand).toBe(input.on_hand);
  });

  it("keeps rows JSON-safe: no Infinity when nothing sells", () => {
    expect(empty.row.rate).toBe(0);
    expect(empty.row.days_left).toBeNull();
    expect(JSON.parse(JSON.stringify(empty.row))).toEqual(empty.row);
  });

  it("titles include the variant option", () => {
    const { row } = rowFor(item({ option_label: "30 ml" }), []);
    expect(row.title).toBe("Serum Vit C — 30 ml");
  });

  it("demo story: Serum Vit C is kritis and the narrative quotes days and reorder qty", () => {
    expect(urgent.row.status).toBe("kritis");
    expect(urgent.row.narrative).toBe(
      `Serum Vit C habis ±${urgent.row.stockout_in_days} hari lagi. Disarankan pesan ulang ${urgent.row.reorder_qty} pcs.`,
    );
    expect(urgent.row.reorder_qty % 10).toBe(0);
  });
});

describe("filters", () => {
  it("default filter keeps everything", () => {
    expect(filterForecastRows(rows, DEFAULT_FORECAST_FILTER)).toHaveLength(rows.length);
  });

  it("filters by status, category, restock-only and slow-only", () => {
    const f = DEFAULT_FORECAST_FILTER;
    expect(filterForecastRows(rows, { ...f, status: "kritis" }).map((r) => r.variant_id)).toEqual(["V1"]);
    expect(filterForecastRows(rows, { ...f, category: "Rambut" }).map((r) => r.variant_id)).toEqual(["V3"]);
    expect(filterForecastRows(rows, { ...f, category: NO_CATEGORY }).map((r) => r.variant_id)).toEqual(["V4"]);
    expect(filterForecastRows(rows, { ...f, restockOnly: true }).every((r) => r.status !== "aman")).toBe(true);
    expect(filterForecastRows(rows, { ...f, slowOnly: true }).map((r) => r.variant_id).sort()).toEqual(["V3", "V4"]);
    expect(filterForecastRows(rows, { ...f, query: "toner" }).map((r) => r.variant_id)).toEqual(["V2"]);
  });

  it("counts per status add up to the total", () => {
    const c = countByStatus(rows);
    expect(c.habis + c.kritis + c.menipis + c.aman).toBe(c.semua);
    expect(c.habis).toBe(1);
  });

  it("lists categories alphabetically with 'Tanpa kategori' last", () => {
    expect(categoriesOf(rows)).toEqual(["Rambut", "Serum", "Toner", NO_CATEGORY]);
  });

  it("sorts by urgency: habis, kritis, then the rest", () => {
    const sorted = sortByUrgency(rows).map((r) => r.status);
    expect(sorted.slice(0, 2)).toEqual(["habis", "kritis"]);
  });
});

describe("slow movers (STK-4)", () => {
  it("sorted by idle capital, total = Σ idle capital of slow movers only", () => {
    const s = slowMovingSummary(rows);
    expect(s.rows.map((r) => r.variant_id)).toEqual(["V4", "V3"]); // 120 × 27.000 > 30 × 40.000
    expect(s.total_idle_capital).toBe(slow.row.idle_capital + slowCover.row.idle_capital);
  });
});

describe("narration (STK-7): every number comes from the row", () => {
  it("slow mover without recent sales", () => {
    const text = narrateSlowMoving(slow.row);
    expect(text).toBe("Hair Mist tidak terjual 30 hari terakhir. Modal tertahan Rp1.200.000 (30 pcs).");
  });

  it("slow mover with a long cover", () => {
    const text = narrateSlowMoving(slowCover.row);
    expect(text).toContain("lambat laku");
    const allowed = new Set([slowCover.row.on_hand, slowCover.row.stockout_in_days, slowCover.row.idle_capital]);
    for (const n of numbersIn(text)) expect(allowed.has(n)).toBe(true);
  });

  it("forecast narratives only quote the forecast's numbers", () => {
    for (const r of rows) {
      const allowed = new Set([r.stockout_in_days, r.reorder_qty, r.on_hand]);
      for (const n of numbersIn(r.narrative)) expect(allowed.has(n)).toBe(true);
    }
  });

  it("overview counts restock items and idle capital", () => {
    const restock = rows.filter((r) => r.status !== "aman").length;
    const s = slowMovingSummary(rows);
    expect(narrateStockOverview(rows)).toBe(
      `${restock} produk perlu dipesan ulang dan 2 produk lambat laku menahan modal Rp${new Intl.NumberFormat("id-ID").format(s.total_idle_capital)}.`,
    );
    expect(narrateStockOverview([healthy.row])).toBe("Semua stok aman dan tidak ada barang lambat laku.");
  });

  it("formats rate and days left", () => {
    expect(formatRate(2.437)).toBe("2,4/hari");
    expect(formatDaysLeft({ stockout_in_days: 3, status: "kritis" })).toBe("±3 hari");
    expect(formatDaysLeft({ stockout_in_days: null, status: "aman" })).toBe("—");
    expect(formatDaysLeft({ stockout_in_days: 0, status: "habis" })).toBe("Sudah habis");
  });
});
