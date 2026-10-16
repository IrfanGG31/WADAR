/**
 * Finance Insight — pure finance over rupiah integers (TECH-SPEC §7.2).
 *
 * All inputs and outputs are plain integers (rupiah); the module does not
 * read sessions, databases, or the clock. One sale produces N "lines"; each
 * line already carries its allocated share of order_discount / platform_fee /
 * shipping_subsidy (allocated with largest-remainder when the sale was written
 * — see src/core/money.ts and app.alloc_lr in SQL).
 *
 * Vocabulary (per spec):
 *   R  = Σ (qty × unit_price − line_discount − alloc_order_discount)
 *   C  = Σ (qty × unit_cost)                    — items with cost_is_set only
 *   F  = Σ alloc_platform_fee
 *   S  = Σ alloc_shipping_subsidy
 *   GP = R − C − F − S
 *   NP = GP − E (period expenses)
 */

import { formatPercent } from "./number-format";

/** One row from sale_items joined with product/channel identity, period-restricted by the caller. */
export interface SaleItemLine {
  variant_id: string;
  product_name?: string;
  channel_id: string;
  channel_name?: string;
  qty: number;
  unit_price: number;
  line_discount: number;
  unit_cost: number;
  cost_is_set: boolean;
  alloc_order_discount: number;
  alloc_platform_fee: number;
  alloc_shipping_subsidy: number;
  /**
   * Pre-aggregated rows (the `fin_daily` view: day × variant × channel) carry
   * exact rupiah totals; when set they replace `qty × unit_price` and
   * `qty × unit_cost`, so no per-unit average (a fraction) is ever needed.
   */
  gross_total?: number;
  cost_total?: number;
}

/** Σ qty × unit_price of a line (or its exact aggregated total). */
export function lineGross(l: SaleItemLine): number {
  return l.gross_total ?? l.qty * l.unit_price;
}

/** Σ qty × unit_cost of a line (or its exact aggregated total). */
export function lineCost(l: SaleItemLine): number {
  return l.cost_total ?? l.qty * l.unit_cost;
}

/** Totals for one slice (period, period × channel, period × product, …). */
export interface FinanceTotals {
  q: number;
  revenue_gross: number; // Σ qty * unit_price
  R: number;
  C: number;
  F: number;
  S: number;
  GP: number;
  /** Σ(line_discount + alloc_order_discount) */
  discount: number;
  /** 10_000 → 100.00%; integer basis points × 100 is easier at the UI. 0 when R = 0. */
  margin_pct: number;
  /** R and GP contributed only by lines where cost_is_set — margin% is derived from these if you need an honest percentage. */
  cost_known_R: number;
  cost_known_GP: number;
  cost_known_margin_pct: number;
}

const ZERO: Omit<FinanceTotals, "margin_pct" | "cost_known_margin_pct"> = {
  q: 0,
  revenue_gross: 0,
  R: 0,
  C: 0,
  F: 0,
  S: 0,
  GP: 0,
  discount: 0,
  cost_known_R: 0,
  cost_known_GP: 0,
};

function marginPct(gp: number, r: number): number {
  return r <= 0 ? 0 : Math.round((gp / r) * 10_000) / 100;
}

function finalizeTotals(acc: typeof ZERO): FinanceTotals {
  return {
    ...acc,
    margin_pct: marginPct(acc.GP, acc.R),
    cost_known_margin_pct: marginPct(acc.cost_known_GP, acc.cost_known_R),
  };
}

function addLine(acc: typeof ZERO, l: SaleItemLine): void {
  const gross = lineGross(l);
  const rev = gross - l.line_discount - l.alloc_order_discount;
  const cost = lineCost(l);
  const gp = rev - cost - l.alloc_platform_fee - l.alloc_shipping_subsidy;
  acc.q += l.qty;
  acc.revenue_gross += gross;
  acc.R += rev;
  acc.C += cost;
  acc.F += l.alloc_platform_fee;
  acc.S += l.alloc_shipping_subsidy;
  acc.GP += gp;
  acc.discount += l.line_discount + l.alloc_order_discount;
  if (l.cost_is_set) {
    acc.cost_known_R += rev;
    acc.cost_known_GP += gp;
  }
}

export function totalsOverLines(lines: readonly SaleItemLine[]): FinanceTotals {
  const acc = { ...ZERO };
  for (const l of lines) addLine(acc, l);
  return finalizeTotals(acc);
}

/** Groups one grouped-by field (variant or channel), totals per group, sorted by R desc. */
function groupBy(
  lines: readonly SaleItemLine[],
  keyOf: (l: SaleItemLine) => string,
  labelOf: (l: SaleItemLine) => string | undefined,
): { key: string; label: string | undefined; totals: FinanceTotals }[] {
  const buckets = new Map<string, { label: string | undefined; acc: typeof ZERO }>();
  for (const l of lines) {
    const key = keyOf(l);
    let b = buckets.get(key);
    if (!b) {
      b = { label: labelOf(l), acc: { ...ZERO } };
      buckets.set(key, b);
    }
    addLine(b.acc, l);
  }
  return [...buckets.entries()]
    .map(([key, { label, acc }]) => ({ key, label, totals: finalizeTotals(acc) }))
    .sort((a, b) => b.totals.R - a.totals.R);
}

export function totalsByVariant(lines: readonly SaleItemLine[]) {
  return groupBy(lines, (l) => l.variant_id, (l) => l.product_name);
}
export function totalsByChannel(lines: readonly SaleItemLine[]) {
  return groupBy(lines, (l) => l.channel_id, (l) => l.channel_name);
}

/* ─── Profit-change decomposition (FIN-5) ─────────────────────────────────── */

/** Period aggregate for one product, needed by the decomposition. */
export interface ProductPeriodAgg {
  variant_id: string;
  product_name?: string;
  qty: number;
  revenue_gross: number; // Σ qty × unit_price
  line_discount: number;
  order_discount_alloc: number;
  cost: number;
  platform_fee_alloc: number;
  shipping_subsidy_alloc: number;
}

export interface ProfitEffects {
  volume: number;
  price: number;
  discount: number;
  cogs: number;
  fee: number;
  shipping: number;
  new_products: number;
  stopped_products: number;
  expense: number;
}

export interface ProfitChange {
  np0: number;
  np1: number;
  delta: number;
  effects: ProfitEffects;
  /** Per-product contribution (continuing/new/stopped) sorted by |ΔGP| desc. */
  by_product: {
    variant_id: string;
    product_name: string | undefined;
    kind: "continuing" | "new" | "stopped";
    delta_gp: number;
  }[];
}

function gpOf(a: ProductPeriodAgg): number {
  return (
    a.revenue_gross -
    a.line_discount -
    a.order_discount_alloc -
    a.cost -
    a.platform_fee_alloc -
    a.shipping_subsidy_alloc
  );
}

/**
 * Decompose Δ untung bersih (period 0 → 1) into the FIN-5 effects (plus
 * expenses). The invariant Σ(efek) = NP1 − NP0 holds exactly in integer
 * rupiah: per product the fractional effects are rounded with normal
 * banker/half-away rounding, and whatever rounding slack remains after
 * adding them up is folded into the "volume" effect of that product, which
 * is the baseline-anchored catch-all (`(q1−q0) × u0`).
 */
export function decomposeProfitChange(
  p0: readonly ProductPeriodAgg[],
  p1: readonly ProductPeriodAgg[],
  expenses0: number,
  expenses1: number,
): ProfitChange {
  const by0 = new Map(p0.map((a) => [a.variant_id, a]));
  const by1 = new Map(p1.map((a) => [a.variant_id, a]));
  const ids = new Set<string>([...by0.keys(), ...by1.keys()]);

  const effects: ProfitEffects = {
    volume: 0,
    price: 0,
    discount: 0,
    cogs: 0,
    fee: 0,
    shipping: 0,
    new_products: 0,
    stopped_products: 0,
    expense: 0,
  };
  const byProduct: ProfitChange["by_product"] = [];

  for (const id of ids) {
    const a0 = by0.get(id);
    const a1 = by1.get(id);
    const name = a1?.product_name ?? a0?.product_name;
    const gp0 = a0 ? gpOf(a0) : 0;
    const gp1 = a1 ? gpOf(a1) : 0;

    if (!a0 || a0.qty === 0) {
      if (a1 && a1.qty > 0) {
        effects.new_products += gp1;
        byProduct.push({ variant_id: id, product_name: name, kind: "new", delta_gp: gp1 });
      }
      continue;
    }
    if (!a1 || a1.qty === 0) {
      effects.stopped_products -= gp0;
      byProduct.push({ variant_id: id, product_name: name, kind: "stopped", delta_gp: -gp0 });
      continue;
    }

    // Continuing product — compute each effect as a float, round, fold the rounding slack into volume.
    const q0 = a0.qty;
    const q1 = a1.qty;
    const u0 = gp0 / q0;

    const p0u = a0.revenue_gross / q0;
    const p1u = a1.revenue_gross / q1;
    const d0u = (a0.line_discount + a0.order_discount_alloc) / q0;
    const d1u = (a1.line_discount + a1.order_discount_alloc) / q1;
    const c0u = a0.cost / q0;
    const c1u = a1.cost / q1;
    const f0u = a0.platform_fee_alloc / q0;
    const f1u = a1.platform_fee_alloc / q1;
    const s0u = a0.shipping_subsidy_alloc / q0;
    const s1u = a1.shipping_subsidy_alloc / q1;

    const price = Math.round(q1 * (p1u - p0u));
    const discount = Math.round(-q1 * (d1u - d0u));
    const cogs = Math.round(-q1 * (c1u - c0u));
    const fee = Math.round(-q1 * (f1u - f0u));
    const shipping = Math.round(-q1 * (s1u - s0u));
    const volumeRaw = (q1 - q0) * u0;
    const otherRounded = price + discount + cogs + fee + shipping;
    const target = gp1 - gp0;
    const volume = target - otherRounded;
    // Volume absorbs the per-product rounding residual; the identity still equals (q1−q0)·u0 up to that residual,
    // which per the spec is acceptable (volume is defined as the baseline-anchored catch-all).
    void volumeRaw;

    effects.volume += volume;
    effects.price += price;
    effects.discount += discount;
    effects.cogs += cogs;
    effects.fee += fee;
    effects.shipping += shipping;
    byProduct.push({ variant_id: id, product_name: name, kind: "continuing", delta_gp: target });
  }

  effects.expense = -(expenses1 - expenses0);

  const np0 = p0.reduce((s, a) => s + gpOf(a), 0) - expenses0;
  const np1 = p1.reduce((s, a) => s + gpOf(a), 0) - expenses1;
  byProduct.sort((a, b) => Math.abs(b.delta_gp) - Math.abs(a.delta_gp));

  return { np0, np1, delta: np1 - np0, effects, by_product: byProduct };
}

/* ─── Margin warnings (FIN-6) ─────────────────────────────────────────────── */

export type MarginWarningCode = "SELL_BELOW_COST" | "FEE_HEAVY" | "DISCOUNT_HEAVY";

export interface MarginWarning {
  code: MarginWarningCode;
  severity: 1 | 2 | 3;
  /** Scope the warning is about: a specific variant, a channel, or the whole period. */
  scope: "variant" | "channel" | "period";
  key?: string;
  label?: string;
  /** Short human-readable summary in Indonesian, numbers already formatted (except money → caller formats). */
  message: string;
  /** Raw numbers, so callers can format or re-render. */
  stats: Record<string, number>;
}

/** FEE_HEAVY threshold: F / R > 20%. */
export const FEE_HEAVY_RATIO = 0.2;
/** DISCOUNT_HEAVY threshold: diskon > 15% of penjualan kotor. */
export const DISCOUNT_HEAVY_RATIO = 0.15;

/** Lines where (unit_price·qty − line_discount − order_discount − fee − shipping) / qty < unit_cost, cost known only. */
export function sellBelowCostLines(lines: readonly SaleItemLine[]): MarginWarning[] {
  const perVariant = new Map<string, {
    label: string | undefined;
    net: number;
    cost: number;
    qty: number;
    hits: number;
  }>();
  for (const l of lines) {
    if (!l.cost_is_set) continue;
    const rev = lineGross(l) - l.line_discount - l.alloc_order_discount;
    const net = rev - l.alloc_platform_fee - l.alloc_shipping_subsidy;
    const cost = lineCost(l);
    if (net < cost) {
      const b = perVariant.get(l.variant_id) ?? { label: l.product_name, net: 0, cost: 0, qty: 0, hits: 0 };
      b.net += net;
      b.cost += cost;
      b.qty += l.qty;
      b.hits += 1;
      perVariant.set(l.variant_id, b);
    }
  }
  return [...perVariant.entries()]
    .map(([variant_id, b]): MarginWarning => ({
      code: "SELL_BELOW_COST",
      severity: 3,
      scope: "variant",
      key: variant_id,
      label: b.label,
      message: `${b.label ?? "Produk"} dijual di bawah modal pada ${b.hits} transaksi.`,
      stats: { net: b.net, cost: b.cost, qty: b.qty, hits: b.hits, loss: b.cost - b.net },
    }))
    .sort((a, b) => b.stats.loss - a.stats.loss);
}

export function feeHeavyChannels(lines: readonly SaleItemLine[]): MarginWarning[] {
  const byChannel = totalsByChannel(lines);
  return byChannel
    .filter((c) => c.totals.R > 0 && c.totals.F / c.totals.R > FEE_HEAVY_RATIO)
    .map((c): MarginWarning => ({
      code: "FEE_HEAVY",
      severity: 2,
      scope: "channel",
      key: c.key,
      label: c.label,
      message: `Komisi ${c.label ?? "kanal"} ${formatPercent((c.totals.F / c.totals.R) * 100)} dari penjualan.`,
      stats: { F: c.totals.F, R: c.totals.R, ratio: c.totals.F / c.totals.R },
    }));
}

export function discountHeavyPeriod(lines: readonly SaleItemLine[]): MarginWarning[] {
  const t = totalsOverLines(lines);
  if (t.revenue_gross <= 0 || t.discount / t.revenue_gross <= DISCOUNT_HEAVY_RATIO) return [];
  return [
    {
      code: "DISCOUNT_HEAVY",
      severity: 1,
      scope: "period",
      message: `Diskon ${formatPercent((t.discount / t.revenue_gross) * 100)} dari penjualan kotor.`,
      stats: { discount: t.discount, revenue_gross: t.revenue_gross, ratio: t.discount / t.revenue_gross },
    },
  ];
}

export function marginWarnings(lines: readonly SaleItemLine[]): MarginWarning[] {
  return [...sellBelowCostLines(lines), ...feeHeavyChannels(lines), ...discountHeavyPeriod(lines)].sort(
    (a, b) => b.severity - a.severity,
  );
}

/* ─── Convenience: aggregate sale items into ProductPeriodAgg[] ───────────── */

export function aggregateByProduct(lines: readonly SaleItemLine[]): ProductPeriodAgg[] {
  const by = new Map<string, ProductPeriodAgg>();
  for (const l of lines) {
    let agg = by.get(l.variant_id);
    if (!agg) {
      agg = {
        variant_id: l.variant_id,
        product_name: l.product_name,
        qty: 0,
        revenue_gross: 0,
        line_discount: 0,
        order_discount_alloc: 0,
        cost: 0,
        platform_fee_alloc: 0,
        shipping_subsidy_alloc: 0,
      };
      by.set(l.variant_id, agg);
    }
    agg.qty += l.qty;
    agg.revenue_gross += lineGross(l);
    agg.line_discount += l.line_discount;
    agg.order_discount_alloc += l.alloc_order_discount;
    agg.cost += lineCost(l);
    agg.platform_fee_alloc += l.alloc_platform_fee;
    agg.shipping_subsidy_alloc += l.alloc_shipping_subsidy;
  }
  return [...by.values()];
}
