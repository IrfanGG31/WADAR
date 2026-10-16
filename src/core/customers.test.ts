import { describe, expect, it } from "vitest";
import {
  customerList,
  daysSinceLastOrder,
  isLapsedCustomer,
  LAPSED_AFTER_DAYS,
  lastOrderText,
  parseCustomerFilter,
  type CustomerListRow,
} from "./customers";

const TODAY = "2026-10-17";

function cust(id: string, over: Partial<CustomerListRow> = {}): CustomerListRow {
  return {
    id,
    name: `Pelanggan ${id}`,
    phone_e164: "+6281200000000",
    total_spent: 100_000,
    orders_count: 1,
    first_day: "2026-08-01",
    last_order_day: TODAY,
    ...over,
  };
}

describe("Pelanggan lama tidak belanja (batas 30 hari)", () => {
  it("counts whole days since the last order; no order yet → null", () => {
    expect(daysSinceLastOrder(cust("a", { last_order_day: "2026-09-17" }), TODAY)).toBe(30);
    expect(daysSinceLastOrder(cust("a", { last_order_day: null, orders_count: 0 }), TODAY)).toBeNull();
  });

  it("is lapsed only after MORE than 30 days without buying", () => {
    expect(LAPSED_AFTER_DAYS).toBe(30);
    expect(isLapsedCustomer(cust("a", { last_order_day: "2026-09-17" }), TODAY)).toBe(false); // tepat 30 hari
    expect(isLapsedCustomer(cust("a", { last_order_day: "2026-09-16" }), TODAY)).toBe(true); // 31 hari
    expect(isLapsedCustomer(cust("a", { last_order_day: TODAY }), TODAY)).toBe(false);
  });

  it("a customer who never bought is not 'lama tidak belanja'", () => {
    expect(isLapsedCustomer(cust("a", { last_order_day: null, orders_count: 0, total_spent: 0 }), TODAY)).toBe(false);
  });

  it("filter param: only 'tidak-belanja' narrows, anything else is all", () => {
    expect(parseCustomerFilter("tidak-belanja")).toBe("tidak-belanja");
    expect(parseCustomerFilter(["tidak-belanja"])).toBe("tidak-belanja");
    expect(parseCustomerFilter(undefined)).toBe("semua");
    expect(parseCustomerFilter("x")).toBe("semua");
  });
});

describe("Daftar pelanggan (agregasi)", () => {
  const rows = [
    cust("baru", { total_spent: 50_000, orders_count: 1, last_order_day: "2026-10-16", first_day: "2026-10-16" }),
    cust("setia", { total_spent: 900_000, orders_count: 3, last_order_day: "2026-08-01" }),
    cust("kecil", { total_spent: 40_000, orders_count: 2, last_order_day: "2026-07-01" }),
    cust("belum", { name: null, total_spent: 0, orders_count: 0, last_order_day: null }),
    cust("kemarin", { total_spent: 300_000, orders_count: 3, last_order_day: "2026-10-10" }),
  ];

  it("summary: totals are integer sums; lapsed and active-30-day counts follow the rule", () => {
    const { summary } = customerList(rows, TODAY, "semua");
    expect(summary).toEqual({ total: 5, lapsed: 2, active: 2, total_spent: 1_290_000 });
  });

  it("all: most recent buyer first, never-bought last", () => {
    const { rows: out } = customerList(rows, TODAY, "semua");
    expect(out.map((r) => r.id)).toEqual(["baru", "kemarin", "setia", "kecil", "belum"]);
  });

  it("tidak-belanja: only lapsed, biggest spender first (worth a message first)", () => {
    const { rows: out } = customerList(rows, TODAY, "tidak-belanja");
    expect(out.map((r) => r.id)).toEqual(["setia", "kecil"]);
    expect(out[0]).toMatchObject({ lapsed: true, days_since: 77, avg_order: 300_000 });
  });

  it("average order is whole rupiah (rounded), 0 when no orders; nameless gets a label", () => {
    const odd = customerList([cust("x", { total_spent: 100_000, orders_count: 3 })], TODAY, "semua").rows[0];
    expect(odd.avg_order).toBe(33_333);
    expect(Number.isInteger(odd.avg_order)).toBe(true);
    const none = customerList(rows, TODAY, "semua").rows.find((r) => r.id === "belum")!;
    expect(none.avg_order).toBe(0);
    expect(none.label).toBe("Pelanggan tanpa nama");
  });
});

describe("lastOrderText", () => {
  it("reads naturally for today, yesterday, n days and never", () => {
    expect(lastOrderText(0)).toBe("Belanja hari ini");
    expect(lastOrderText(1)).toBe("Terakhir belanja kemarin");
    expect(lastOrderText(31)).toBe("Terakhir belanja 31 hari lalu");
    expect(lastOrderText(null)).toBe("Belum pernah belanja");
  });
});
