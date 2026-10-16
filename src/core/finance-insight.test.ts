import { describe, expect, it } from "vitest";
import {
  aggregateByProduct,
  decomposeProfitChange,
  marginWarnings,
  totalsByChannel,
  totalsByVariant,
  totalsOverLines,
  type SaleItemLine,
} from "./finance";
import {
  categoryShares,
  channelMarginRows,
  dailyFinanceRows,
  effectRows,
  lineFromFinDaily,
  linesIn,
  MARGIN_WARNING_LABEL,
  narrateMarginWarning,
  narrateProfitChange,
  narrateProfitHeadline,
  OTHER_CATEGORY,
  parseFinancePeriodDays,
  periodLabels,
  periodResult,
  productMarginRows,
  profitInsight,
  sumDailyRows,
  summaryCards,
  warningRows,
  type ExpenseEntry,
  type FinDailyRow,
  type FinLine,
  type VariantLabel,
} from "./finance-insight";
import { formatRupiah, formatSignedRupiah } from "./money";
import { daysOf, periodComparison, weekOverWeek } from "./period";

type RawLine = SaleItemLine & { day: string };

const TODAY = "2026-10-15";
const { current, previous } = weekOverWeek(TODAY);

const VARIANTS = new Map<string, VariantLabel>([
  ["serum", { title: "Serum Vit C", category: "Serum" }],
  ["toner", { title: "Toner", category: "Toner" }],
  ["masker", { title: "Masker Clay", category: "Masker" }],
  ["mist", { title: "Hair Mist", category: null }],
]);
const CHANNELS = new Map([
  ["pos", "Kasir"],
  ["tiktok", "TikTok Shop"],
]);
const COST: Record<string, number> = { serum: 45_000, toner: 30_000, masker: 0, mist: 40_000 };
const PRICE: Record<string, number> = { serum: 89_000, toner: 65_000, masker: 50_000, mist: 75_000 };

function raw(day: string, variant: string, channel: string, qty: number, extra: Partial<SaleItemLine> = {}): RawLine {
  return {
    day,
    variant_id: variant,
    product_name: VARIANTS.get(variant)?.title,
    channel_id: channel,
    channel_name: CHANNELS.get(channel),
    qty,
    unit_price: PRICE[variant],
    line_discount: 0,
    unit_cost: COST[variant],
    cost_is_set: variant !== "masker",
    alloc_order_discount: 0,
    alloc_platform_fee: channel === "tiktok" ? Math.round(qty * PRICE[variant] * 0.24) : 0,
    alloc_shipping_subsidy: 0,
    ...extra,
  };
}

/** Sale lines for two weeks: steady POS sales, then TikTok + a promo + a below-cost sale this week. */
function history(): RawLine[] {
  const out: RawLine[] = [];
  for (const day of daysOf(previous)) {
    out.push(raw(day, "serum", "pos", 3), raw(day, "toner", "pos", 2), raw(day, "mist", "pos", 1));
    out.push(raw(day, "masker", "pos", 1));
  }
  for (const day of daysOf(current)) {
    out.push(raw(day, "serum", "pos", 2), raw(day, "serum", "pos", 1, { alloc_order_discount: 40_000 }));
    out.push(raw(day, "serum", "tiktok", 2, { line_discount: 20_000 }));
    out.push(raw(day, "toner", "pos", 3, { line_discount: 60_000 }), raw(day, "masker", "tiktok", 1));
  }
  // One flash-sale toner below cost.
  out.push(raw(TODAY, "toner", "tiktok", 2, { line_discount: 80_000 }));
  return out;
}

/** What the `fin_daily` view does in SQL: Σ per day × variant × channel. */
function toFinDaily(lines: readonly RawLine[]): FinDailyRow[] {
  const by = new Map<string, FinDailyRow>();
  for (const l of lines) {
    const k = `${l.day}|${l.variant_id}|${l.channel_id}`;
    const r = by.get(k) ?? {
      day: l.day,
      variant_id: l.variant_id,
      channel_id: l.channel_id,
      q: 0,
      revenue_gross: 0,
      line_discount: 0,
      order_discount_alloc: 0,
      cost: 0,
      platform_fee_alloc: 0,
      shipping_subsidy_alloc: 0,
      cost_is_set: true,
    };
    r.q += l.qty;
    r.revenue_gross += l.qty * l.unit_price;
    r.line_discount += l.line_discount;
    r.order_discount_alloc += l.alloc_order_discount;
    r.cost += l.qty * l.unit_cost;
    r.platform_fee_alloc += l.alloc_platform_fee;
    r.shipping_subsidy_alloc += l.alloc_shipping_subsidy;
    r.cost_is_set = r.cost_is_set && l.cost_is_set;
    by.set(k, r);
  }
  return [...by.values()];
}

const RAW = history();
const LINES: FinLine[] = toFinDaily(RAW).map((r) => lineFromFinDaily(r, VARIANTS, CHANNELS));
const EXPENSES: ExpenseEntry[] = [
  { day: "2026-10-03", amount: 350_000 },
  { day: "2026-10-10", amount: 350_000 },
  { day: "2026-10-12", amount: 150_000 },
];
const rawIn = (w: typeof current) => RAW.filter((l) => l.day >= w.from && l.day <= w.to);

describe("fin_daily rows → core lines", () => {
  it("aggregated rows give exactly the same totals as the raw sale lines", () => {
    expect(totalsOverLines(LINES)).toEqual(totalsOverLines(RAW));
    expect(totalsOverLines(linesIn(LINES, current))).toEqual(totalsOverLines(rawIn(current)));
  });

  it("per channel and per variant totals match too", () => {
    const strip = (xs: { key: string; totals: unknown }[]) => xs.map(({ key, totals }) => ({ key, totals }));
    expect(strip(totalsByChannel(LINES))).toEqual(strip(totalsByChannel(RAW)));
    expect(strip(totalsByVariant(LINES))).toEqual(strip(totalsByVariant(RAW)));
  });

  it("decomposition input is identical (Σ per product)", () => {
    const strip = (xs: ReturnType<typeof aggregateByProduct>) =>
      xs.map((x) => ({ ...x, product_name: undefined })).sort((a, b) => a.variant_id.localeCompare(b.variant_id));
    expect(strip(aggregateByProduct(LINES))).toEqual(strip(aggregateByProduct(RAW)));
  });

  it("labels lines with product title, category and channel name", () => {
    const l = LINES.find((x) => x.variant_id === "mist");
    expect(l?.product_name).toBe("Hair Mist");
    expect(l?.category).toBeNull();
    expect(LINES.find((x) => x.channel_id === "tiktok")?.channel_name).toBe("TikTok Shop");
  });
});

describe("Ringkasan cards", () => {
  const cur = periodResult(LINES, EXPENSES, current);
  const prev = periodResult(LINES, EXPENSES, previous);
  const cards = summaryCards(cur, prev);
  const card = (key: string) => cards.find((c) => c.key === key)!;

  it("R/C/F/S/GP are the core totals for the window; NP = GP − E", () => {
    const t = totalsOverLines(rawIn(current));
    expect(card("R").value).toBe(t.R);
    expect(card("C").value).toBe(t.C);
    expect(card("F").value).toBe(t.F);
    expect(card("S").value).toBe(t.S);
    expect(card("GP").value).toBe(t.GP);
    expect(cur.expenses).toBe(500_000);
    expect(card("NP").value).toBe(t.GP - 500_000);
    expect(card("NP").previous).toBe(totalsOverLines(rawIn(previous)).GP - 350_000);
  });

  it("deltas and tone", () => {
    for (const c of cards) expect(c.delta).toBe(c.value - c.previous);
    const s = card("S");
    expect(s.delta_pct).toBeNull(); // previous 0
    expect(card("C").tone).toBe("neutral");
    expect(card("NP").tone).toBe(card("NP").delta > 0 ? "good" : "bad");
    expect(card("NP").hint).toBe(`Setelah pengeluaran ${formatRupiah(500_000)}`);
  });
});

describe("Kenapa untung berubah (FIN-5)", () => {
  const insight = profitInsight(LINES, EXPENSES, current, previous);

  it("Σ effects = ΔNP = NP card delta (invariant holds on screen numbers)", () => {
    const sum = Object.values(insight.change.effects).reduce((s, n) => s + n, 0);
    const npCard = summaryCards(periodResult(LINES, EXPENSES, current), periodResult(LINES, EXPENSES, previous)).find(
      (c) => c.key === "NP",
    )!;
    expect(sum).toBe(insight.change.delta);
    expect(insight.change.delta).toBe(npCard.delta);
  });

  it("is the same decomposition the core computes from the raw lines", () => {
    const direct = decomposeProfitChange(
      aggregateByProduct(rawIn(previous)),
      aggregateByProduct(rawIn(current)),
      350_000,
      500_000,
    );
    expect(insight.change.effects).toEqual(direct.effects);
    expect(insight.change.delta).toBe(direct.delta);
  });

  it("effect rows: non-zero, sorted by |amount|", () => {
    const amounts = insight.effects.map((e) => Math.abs(e.amount));
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    expect(insight.effects.every((e) => e.amount !== 0)).toBe(true);
    expect(insight.effects.find((e) => e.key === "fee")?.label).toBe("Komisi kanal");
  });

  it("narrative quotes ΔNP and at most 3 effects, all from the decomposition", () => {
    const text = insight.narrative;
    const dir = insight.change.delta > 0 ? "naik" : "turun";
    expect(text.startsWith(`Untung bersih 7 hari terakhir ${dir} ${formatRupiah(Math.abs(insight.change.delta))}`)).toBe(true);
    const amounts = [...text.matchAll(/[+\u2212]?Rp[\d.]+/g)].map((m) =>
      Number(m[0].replace("\u2212", "-").replace(/Rp|\./g, "")),
    );
    const allowed = new Set([
      Math.abs(insight.change.delta),
      ...insight.effects.slice(0, 3).map((e) => e.amount),
      insight.topProduct?.delta_gp,
      insight.topChannel?.delta_gp,
    ]);
    for (const a of amounts) expect(allowed.has(a)).toBe(true);
    expect(text.match(/Penyebab terbesar: ([^.]*)\./)?.[1].split(", ").length).toBeLessThanOrEqual(3);
  });

  it("headline for Beranda names ΔNP and the largest effect only", () => {
    const top = insight.effects[0];
    expect(narrateProfitHeadline(insight)).toBe(
      `Untung bersih 7 hari terakhir ${insight.change.delta > 0 ? "naik" : "turun"} ${formatRupiah(Math.abs(insight.change.delta))}, terutama karena ${top.label.toLowerCase()} (${formatSignedRupiah(top.amount)}).`,
    );
  });

  it("no change and no previous data have their own sentences", () => {
    const flat = decomposeProfitChange([], [], 0, 0);
    expect(narrateProfitChange(flat)).toBe("Untung bersih 7 hari terakhir sama dengan 7 hari sebelumnya.");
    const fresh = profitInsight(linesIn(LINES, current), [], current, previous);
    expect(fresh.comparable).toBe(false);
    expect(fresh.narrative).toBe("Belum ada data 7 hari sebelumnya untuk dibandingkan.");
  });
});

describe("Donut kategori", () => {
  it("shares sum to exactly 100% and Σ slices = penjualan bersih", () => {
    const cur = linesIn(LINES, current);
    const { total, slices } = categoryShares(cur);
    expect(slices.reduce((s, c) => s + c.share_permille, 0)).toBe(1000);
    expect(total).toBe(totalsOverLines(cur).R);
    expect(slices.map((s) => s.label)).toEqual(["Serum", "Toner", "Masker"]);
    // Arcs tile the ring: each starts where the previous ended, the last ends at 100%.
    slices.forEach((s, i) => expect(s.start_permille).toBe(i === 0 ? 0 : slices[i - 1].start_permille + slices[i - 1].share_permille));
    expect(slices.at(-1)!.start_permille + slices.at(-1)!.share_permille).toBe(1000);
  });

  it("folds small categories into Lainnya", () => {
    const { slices, total } = categoryShares(LINES, 2);
    expect(slices).toHaveLength(3);
    expect(slices[2].label).toBe(OTHER_CATEGORY);
    expect(slices.reduce((s, c) => s + c.R, 0)).toBe(total);
  });

  it("no sales → no slices", () => {
    expect(categoryShares([])).toEqual({ total: 0, slices: [] });
  });
});

describe("Margin tab", () => {
  const cur = linesIn(LINES, current);

  it("channel rows carry the core totals, thinnest margin first", () => {
    const rows = channelMarginRows(cur);
    const core = new Map(totalsByChannel(cur).map((c) => [c.key, c.totals]));
    for (const r of rows) {
      const t = core.get(r.key)!;
      expect(r.R).toBe(t.R);
      expect(r.F).toBe(t.F);
      expect(r.GP).toBe(t.GP);
      expect(r.margin_pct).toBe(t.cost_known_margin_pct);
    }
    expect(rows[0].label).toBe("TikTok Shop");
    expect(rows[0].thinnest).toBe(true);
    expect(rows.filter((r) => r.thinnest)).toHaveLength(1);
  });

  it("product rows: no HPP → flagged, no margin, listed last", () => {
    const rows = productMarginRows(cur);
    const masker = rows.at(-1)!;
    expect(masker.label).toBe("Masker Clay");
    expect(masker.margin_pct).toBeNull();
    expect(masker.missing_cost).toBe(true);
    const core = new Map(totalsByVariant(cur).map((v) => [v.key, v.totals]));
    for (const r of rows) expect(r.GP).toBe(core.get(r.key)!.GP);
  });

  it("warnings: same set as marginWarnings, Indonesian labels, numbers from stats", () => {
    const rows = warningRows(cur);
    const core = marginWarnings(cur);
    expect(rows.map((r) => r.code)).toEqual(core.map((w) => w.code));
    expect(new Set(rows.map((r) => r.code))).toEqual(new Set(["SELL_BELOW_COST", "FEE_HEAVY", "DISCOUNT_HEAVY", "MISSING_COST"]));
    for (const r of rows) expect(r.title).toBe(MARGIN_WARNING_LABEL[r.code]);
    const below = core.find((w) => w.code === "SELL_BELOW_COST")!;
    expect(narrateMarginWarning(below)).toBe(
      `Toner: ${below.stats.qty} unit terjual di bawah modal, rugi ${formatRupiah(below.stats.loss)}.`,
    );
    expect(rows.find((r) => r.code === "FEE_HEAVY")?.anchor).toBe("kanal");
    expect(rows.find((r) => r.code === "SELL_BELOW_COST")?.anchor).toBe("produk");
    expect(rows.find((r) => r.code === "FEE_HEAVY")?.detail).toMatch(/^Komisi TikTok Shop \d+(,\d)?% dari penjualan/);
  });
});

describe("Detail: tabel per hari", () => {
  const window = { from: "2026-09-18", to: TODAY };
  const rows = dailyFinanceRows(LINES, EXPENSES, window);

  it("one zero-filled row per day", () => {
    expect(rows).toHaveLength(28);
    expect(rows[0]).toEqual({ day: "2026-09-18", q: 0, R: 0, C: 0, F: 0, S: 0, GP: 0, E: 0, NP: 0 });
  });

  it("each day equals totalsOverLines for that day; Σ days = window totals", () => {
    const t = totalsOverLines(RAW.filter((l) => l.day === TODAY));
    const today = rows.at(-1)!;
    expect([today.R, today.C, today.F, today.GP]).toEqual([t.R, t.C, t.F, t.GP]);
    const sum = sumDailyRows(rows);
    const all = totalsOverLines(RAW);
    expect([sum.R, sum.C, sum.F, sum.S, sum.GP, sum.q]).toEqual([all.R, all.C, all.F, all.S, all.GP, all.q]);
    expect(sum.E).toBe(850_000);
    expect(sum.NP).toBe(all.GP - 850_000);
  });

  it("NP per day = GP − E", () => {
    for (const r of rows) expect(r.NP).toBe(r.GP - r.E);
  });
});

describe("effectRows on a hand-built change", () => {
  it("drops zero effects", () => {
    const change = decomposeProfitChange(
      [{ variant_id: "a", qty: 1, revenue_gross: 10_000, line_discount: 0, order_discount_alloc: 0, cost: 6_000, platform_fee_alloc: 0, shipping_subsidy_alloc: 0 }],
      [{ variant_id: "a", qty: 2, revenue_gross: 20_000, line_discount: 0, order_discount_alloc: 0, cost: 12_000, platform_fee_alloc: 0, shipping_subsidy_alloc: 0 }],
      0,
      0,
    );
    expect(effectRows(change)).toEqual([{ key: "volume", label: "Jumlah terjual", amount: 4_000 }]);
  });
});

describe("Peringatan margin tergerus (FIN-6 MARGIN_DROP, MISSING_COST)", () => {
  const sale = (day: string, unitCost: number): RawLine => ({ ...raw(day, "serum", "pos", 10), unit_price: 10_000, unit_cost: unitCost });

  it("warningRows with the previous period narrates a 6-point drop with its cause", () => {
    const w = weekOverWeek(TODAY);
    const lines = [...daysOf(w.previous).map((d) => sale(d, 6_000)), ...daysOf(w.current).map((d) => sale(d, 6_600))];
    const rows = warningRows(linesIn(lines, w.current), { previous: linesIn(lines, w.previous) });
    const drop = rows.find((r) => r.code === "MARGIN_DROP")!;
    expect(drop.title).toBe(MARGIN_WARNING_LABEL.MARGIN_DROP);
    expect(drop.anchor).toBe("produk");
    expect(drop.detail).toBe(
      `Margin 7 hari terakhir turun 6 poin, dari 40% jadi 34% dibanding 7 hari sebelumnya. ` +
        `Sebabnya: modal barang (HPP) makin besar dibanding harga jual, dari 60% jadi 66% penjualan kotor. ` +
        `Akibatnya, dari setiap ${formatRupiah(100_000)} penjualan, untung kotormu berkurang ±${formatRupiah(6_000)} ` +
        `(±${formatRupiah(42_000)} di periode ini).`,
    );
  });

  it("a 3-point drop gives no MARGIN_DROP row", () => {
    const w = weekOverWeek(TODAY);
    const lines = [...daysOf(w.previous).map((d) => sale(d, 6_000)), ...daysOf(w.current).map((d) => sale(d, 6_300))];
    const rows = warningRows(linesIn(lines, w.current), { previous: linesIn(lines, w.previous) });
    expect(rows.map((r) => r.code)).not.toContain("MARGIN_DROP");
  });

  it("MISSING_COST narration says which products and why the margin is off", () => {
    const cur = linesIn(LINES, current);
    const row = warningRows(cur).find((r) => r.code === "MISSING_COST")!;
    expect(row.title).toBe("HPP belum diisi");
    expect(row.anchor).toBe("produk");
    const core = marginWarnings(cur).find((w) => w.code === "MISSING_COST")!;
    expect(row.detail).toBe(
      `Masker Clay terjual ${formatRupiah(core.stats.R_missing)} tanpa HPP (modal). ` +
        `Akibatnya margin dan untung terlihat lebih besar dari aslinya. Isi HPP-nya di Stok supaya angkanya akurat.`,
    );
  });

  it("30-day period: windows, labels and totals cover exactly 30 days, compared with the 30 days before", () => {
    expect(parseFinancePeriodDays(undefined)).toBe(7);
    expect(parseFinancePeriodDays("30")).toBe(30);
    expect(parseFinancePeriodDays("90")).toBe(7);
    expect(periodLabels(30)).toEqual({ current: "30 hari terakhir", previous: "30 hari sebelumnya" });
    expect(periodLabels(7)).toEqual({ current: "7 hari terakhir", previous: "7 hari sebelumnya" });

    const p = periodComparison(TODAY, 30);
    expect(p.current).toEqual({ from: "2026-09-16", to: TODAY });
    expect(p.previous).toEqual({ from: "2026-08-17", to: "2026-09-15" });
    expect(periodComparison(TODAY, 7)).toEqual(weekOverWeek(TODAY));

    // Margin slid 40% → 34% three weeks ago: a 7-vs-7 view can't see it, 30-vs-30 can.
    const lines: RawLine[] = [];
    for (const d of daysOf({ from: "2026-08-17", to: TODAY })) lines.push(sale(d, d < "2026-09-16" ? 6_000 : 6_600));
    const w7 = weekOverWeek(TODAY);
    expect(marginWarnings(linesIn(lines, w7.current), { previous: linesIn(lines, w7.previous) }).map((x) => x.code)).not.toContain("MARGIN_DROP");
    const drop = marginWarnings(linesIn(lines, p.current), { previous: linesIn(lines, p.previous), days: 30 }).find((x) => x.code === "MARGIN_DROP")!;
    expect(drop.stats).toMatchObject({ margin_before: 40, margin_now: 34, drop_pts: 6, days: 30, R: 30 * 100_000, lost_gp: 30 * 6_000 });
    const res = periodResult(lines as FinLine[], [], p.current);
    expect(res.totals.q).toBe(300);
    expect(res.totals.R).toBe(3_000_000);
    expect(warningRows(linesIn(lines, p.current), { previous: linesIn(lines, p.previous), days: 30 }).find((r) => r.code === "MARGIN_DROP")?.detail).toMatch(
      /^Margin 30 hari terakhir turun 6 poin, .* dibanding 30 hari sebelumnya\./,
    );
  });
});
