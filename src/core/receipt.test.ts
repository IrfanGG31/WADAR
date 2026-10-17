import { describe, expect, it, vi } from "vitest";
import { isReceiptToken, loadPublicReceipt, parseReceipt, receiptLinkError, receiptPath } from "./receipt";

const TOKEN_A = "a".repeat(32) + "0123456789abcdef0123456789abcdef";
const TOKEN_B = "b".repeat(64);
const SALE_ID = "0192f0a1-0000-7000-8000-000000000001";

const RECEIPT_A = {
  sale_id: SALE_ID,
  shop_name: "Glow Lab",
  timezone: "Asia/Jakarta",
  occurred_at: "2026-10-17T03:15:00+00:00",
  status: "completed",
  payment_method: "tunai",
  channel_name: "Toko (POS)",
  subtotal: 200000,
  order_discount: 10000,
  total: 190000,
  items: [{ name: "Serum — 30ml", qty: 2, unit_price: 100000, line_discount: 0 }],
};

/** Stand-in for get_public_receipt: one stored sale, keyed by its token only. */
function fakeRpc() {
  const rows = new Map<string, unknown>([[TOKEN_A, RECEIPT_A]]);
  return vi.fn(async (token: string) => ({ data: rows.get(token) ?? null, error: null }));
}

describe("struk publik (POS-3)", () => {
  it("accepts only 64 lowercase hex characters (not a sale id)", () => {
    expect(isReceiptToken(TOKEN_A)).toBe(true);
    expect(isReceiptToken(TOKEN_A.toUpperCase())).toBe(false);
    expect(isReceiptToken(TOKEN_A.slice(1))).toBe(false);
    expect(isReceiptToken(SALE_ID)).toBe(false);
    expect(isReceiptToken("1")).toBe(false);
    expect(isReceiptToken(undefined)).toBe(false);
  });

  it("wrong token = not found (404); a malformed one never reaches the database", async () => {
    const rpc = fakeRpc();
    expect(await loadPublicReceipt(TOKEN_B, rpc)).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(await loadPublicReceipt("12345", rpc)).toBeNull();
    expect(await loadPublicReceipt(SALE_ID, rpc)).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("right token = only that sale", async () => {
    const rpc = fakeRpc();
    const receipt = await loadPublicReceipt(TOKEN_A, rpc);
    expect(rpc).toHaveBeenCalledWith(TOKEN_A);
    expect(receipt).toEqual({
      saleId: SALE_ID,
      shopName: "Glow Lab",
      timezone: "Asia/Jakarta",
      occurredAt: "2026-10-17T03:15:00+00:00",
      status: "completed",
      paymentMethod: "tunai",
      channelName: "Toko (POS)",
      subtotal: 200000,
      orderDiscount: 10000,
      total: 190000,
      items: [{ name: "Serum — 30ml", qty: 2, unitPrice: 100000, lineDiscount: 0, lineTotal: 200000 }],
    });
  });

  it("a lookup error or an odd payload is also 'not found'", async () => {
    expect(await loadPublicReceipt(TOKEN_A, async () => ({ data: null, error: { code: "42883" } }))).toBeNull();
    expect(await loadPublicReceipt(TOKEN_A, async () => ({ data: { total: 1 }, error: null }))).toBeNull();
    expect(parseReceipt("x")).toBeNull();
  });

  it("bigints from PostgREST strings stay whole rupiah; private fields are never copied", () => {
    const r = parseReceipt({ ...RECEIPT_A, total: "190000", unit_cost: 40000, items: [{ name: "A", qty: "3", unit_price: "5000", line_discount: "1000", unit_cost_snapshot: 2000 }] });
    expect(r?.total).toBe(190000);
    expect(r?.items).toEqual([{ name: "A", qty: 3, unitPrice: 5000, lineDiscount: 1000, lineTotal: 14000 }]);
    expect(Object.keys(r ?? {})).not.toContain("unit_cost");
  });

  it("paths and staff messages", () => {
    expect(receiptPath(TOKEN_A)).toBe(`/struk/${TOKEN_A}`);
    expect(receiptLinkError({ code: "42703" })).toBe("Struk publik belum aktif di server.");
    expect(receiptLinkError(null)).toBe("Tautan struk belum bisa dibuat. Coba lagi sebentar.");
  });
});
