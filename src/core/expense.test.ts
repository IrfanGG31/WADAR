import { describe, expect, it } from "vitest";
import { ExpenseInput, expenseDateProblem, expensesByCategory, type ExpenseRow } from "./expense";

const row = (category: string, amount: number, voided = false): ExpenseRow => ({
  id: `${category}-${amount}`,
  category,
  amount,
  occurred_at: "2026-10-18",
  note: null,
  voided_at: voided ? "2026-10-18T10:00:00Z" : null,
});

describe("ExpenseInput (FIN-1)", () => {
  const ok = { amount: 50_000, category: "Iklan", occurred_on: "2026-10-18", idempotency_key: "exp-12345678" };

  it("accepts three required fields, note optional", () => {
    expect(ExpenseInput.parse(ok)).toMatchObject({ amount: 50_000, category: "Iklan", note: "" });
  });

  it("rejects zero, fractions and missing category", () => {
    expect(ExpenseInput.safeParse({ ...ok, amount: 0 }).success).toBe(false);
    expect(ExpenseInput.safeParse({ ...ok, amount: 10.5 }).success).toBe(false);
    expect(ExpenseInput.safeParse({ ...ok, category: " " }).error?.issues[0].message).toBe("Pilih kategori.");
  });

  it("refuses a date after the shop's today", () => {
    expect(expenseDateProblem("2026-10-19", "2026-10-18")).toMatch(/setelah hari ini/);
    expect(expenseDateProblem("2026-10-18", "2026-10-18")).toBeNull();
    expect(expenseDateProblem("18-10-2026", "2026-10-18")).toBe("Tanggal belum benar.");
  });
});

describe("expensesByCategory", () => {
  it("leaves voided rows out and shares add up to 100", () => {
    const r = expensesByCategory([row("Gaji", 1_500_000), row("Iklan", 350_000), row("Iklan", 350_000), row("Sewa", 9_999, true), row("Ongkir", 200_000)]);
    expect(r.total).toBe(2_400_000);
    expect(r.categories.map((c) => c.category)).toEqual(["Gaji", "Iklan", "Ongkir"]);
    expect(r.categories[1]).toMatchObject({ amount: 700_000, count: 2 });
    expect(r.categories.reduce((s, c) => s + c.share_pct, 0)).toBe(100);
  });

  it("empty list", () => {
    expect(expensesByCategory([])).toEqual({ total: 0, categories: [] });
  });
});
