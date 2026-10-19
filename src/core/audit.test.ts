import { describe, expect, it } from "vitest";
import { describeAudit, signedAdjustQty, type AuditEntry } from "./audit";

const entry = (action: string, detail: Record<string, unknown>): AuditEntry => ({
  id: "a1",
  action,
  entity_id: null,
  actor_id: null,
  detail,
  created_at: "2026-10-19T03:00:00Z",
});

describe("signedAdjustQty (STK-0b)", () => {
  it("forces the reason's direction and keeps the typed sign for koreksi", () => {
    expect(signedAdjustQty("rusak", 3)).toBe(-3);
    expect(signedAdjustQty("retur_pemasok", -2)).toBe(-2);
    expect(signedAdjustQty("ditemukan", -4)).toBe(4);
    expect(signedAdjustQty("koreksi", -5)).toBe(-5);
    expect(signedAdjustQty("koreksi", 5)).toBe(5);
  });
});

describe("describeAudit (POS-5)", () => {
  it("explains a stock adjustment with the product, change, and note", () => {
    const d = describeAudit(entry("stock.adjusted", { qty: -2, reason: "rusak", before: 10, after: 8, note: "jatuh" }), "Kopi Susu");
    expect(d.title).toBe("Stok disesuaikan: Rusak");
    expect(d.detail).toBe('Kopi Susu · −2 (10 → 8) · "jatuh"');
  });

  it("explains an opname difference", () => {
    expect(describeAudit(entry("stock.counted", { system: 12, counted: 9, diff: -3 }), "Teh").detail).toBe("Teh · tercatat 12, dihitung 9 (−3)");
  });

  it("formats money and roles in everyday words", () => {
    expect(describeAudit(entry("product.price_changed", { old: 15000, new: 18000 }), "Kopi").detail).toMatch(/Rp15\.000 → Rp18\.000$/);
    expect(describeAudit(entry("member.role_changed", { old: "cashier", new: "admin" }), "a@b.c").detail).toMatch(/^a@b\.c · /);
    expect(describeAudit(entry("sale.voided", { total: 20000, reason: "salah input" })).detail).toBe('Rp20.000 · "salah input"');
  });

  it("never breaks on an unknown action", () => {
    expect(describeAudit(entry("something.new", {}))).toEqual({ title: "something.new", detail: "" });
  });
});
