import type { FinLine } from "../finance-insight";
import type { ForecastRow } from "../stock-insight";
import type { ConsultData, CustomerRow } from "./tools";

/**
 * A small shop with hand-checkable numbers (today = Fri 2026-10-16, still running;
 * 7d = the closed days 10-09…10-15, previous 7d = 10-02…10-08). Tests assert exact
 * rupiah, so the arithmetic is written out here:
 *   previous week  R 1.735.000  C 730.000  F 80.100  GP 924.900  expenses 200.000  NP 724.900
 *   this week      R 2.027.800  C 938.000  F 192.240 GP 897.560  expenses 250.000  NP 647.560
 *   today (10-16)  R 120.000 (2 pcs)  GP 70.000 — not part of "this week"
 */
export const TODAY = "2026-10-16";

function line(p: Partial<FinLine> & Pick<FinLine, "day" | "variant_id" | "product_name" | "channel_id" | "channel_name" | "qty"> & { gross_total: number; cost_total: number }): FinLine {
  return {
    category: null,
    unit_price: Math.round(p.gross_total / p.qty),
    unit_cost: Math.round(p.cost_total / p.qty),
    line_discount: 0,
    cost_is_set: true,
    alloc_order_discount: 0,
    alloc_platform_fee: 0,
    alloc_shipping_subsidy: 0,
    ...p,
  };
}

const POS = { channel_id: "ch-pos", channel_name: "Toko Offline (POS)" };
const TIKTOK = { channel_id: "ch-tt", channel_name: "TikTok Shop" };
const SERUM = { variant_id: "v-serum", product_name: "Serum Vit C", category: "Serum" };
const TONER = { variant_id: "v-toner", product_name: "Toner", category: "Toner" };
const HAIR = { variant_id: "v-hair", product_name: "Hair Mist", category: "Rambut" };

export const LINES: FinLine[] = [
  // previous week
  line({ day: "2026-10-03", ...SERUM, ...POS, qty: 10, gross_total: 890_000, cost_total: 380_000 }),
  line({ day: "2026-10-05", ...TONER, ...POS, qty: 5, gross_total: 400_000, cost_total: 160_000 }),
  line({ day: "2026-10-06", ...SERUM, ...TIKTOK, qty: 5, gross_total: 445_000, cost_total: 190_000, alloc_platform_fee: 80_100 }),
  // this week
  line({ day: "2026-10-10", ...SERUM, ...POS, qty: 8, gross_total: 712_000, cost_total: 304_000 }),
  line({ day: "2026-10-12", ...TONER, ...POS, qty: 4, gross_total: 320_000, cost_total: 128_000, line_discount: 32_000 }),
  line({ day: "2026-10-14", ...SERUM, ...TIKTOK, qty: 12, gross_total: 1_068_000, cost_total: 456_000, alloc_order_discount: 160_200, alloc_platform_fee: 192_240 }),
  line({ day: "2026-10-15", ...HAIR, ...POS, qty: 2, gross_total: 120_000, cost_total: 50_000 }),
  // today
  line({ day: "2026-10-16", ...HAIR, ...POS, qty: 2, gross_total: 120_000, cost_total: 50_000 }),
];

function stockRow(p: Partial<ForecastRow> & Pick<ForecastRow, "variant_id" | "title" | "on_hand">): ForecastRow {
  return {
    product_id: `p-${p.variant_id}`,
    product_name: p.title,
    option_label: null,
    category: null,
    unit: "pcs",
    min_stock: 5,
    lead_time_days: 3,
    pack_size: 10,
    cost_is_set: true,
    rate: 1,
    safety_stock: 2,
    rop: 8,
    days_left: 30,
    stockout_in_days: 30,
    status: "aman",
    reorder_qty: 0,
    slow_moving: false,
    idle_capital: 0,
    narrative: "",
    ...p,
  };
}

export const STOCK: ForecastRow[] = [
  stockRow({ variant_id: "v-serum", title: "Serum Vit C", on_hand: 7, status: "kritis", rate: 2.4, days_left: 3, stockout_in_days: 3, reorder_qty: 40, idle_capital: 266_000 }),
  stockRow({ variant_id: "v-toner", title: "Toner", on_hand: 30 }),
  stockRow({ variant_id: "v-hair", title: "Hair Mist", on_hand: 40, rate: 0.1, days_left: 400, stockout_in_days: 400, slow_moving: true, idle_capital: 1_200_000 }),
];

export const CUSTOMERS: CustomerRow[] = [
  { id: "c1", name: "Sari Dewi", total_spent: 3_000_000, orders_count: 12, first_day: "2026-07-20", last_order_day: "2026-09-02" },
  { id: "c2", name: "Budi", total_spent: 1_500_000, orders_count: 6, first_day: "2026-08-01", last_order_day: "2026-10-12" },
  { id: "c3", name: "Rina", total_spent: 800_000, orders_count: 4, first_day: "2026-10-05", last_order_day: "2026-10-10" },
  { id: "c4", name: "Tono", total_spent: 2_000_000, orders_count: 8, first_day: "2026-06-01", last_order_day: "2026-08-01" },
];

export function makeData(over: Partial<ConsultData> = {}): ConsultData {
  return {
    today: TODAY,
    lines: LINES,
    expenses: [
      { day: "2026-10-06", amount: 200_000 },
      { day: "2026-10-13", amount: 250_000 },
    ],
    stock: STOCK,
    customers: CUSTOMERS,
    insights: [],
    memory: [{ id: "m1", kind: "preference", content: "Jangan pernah diskon di atas 15%", pinned: true }],
    escalatedChats: 2,
    ...over,
  };
}
