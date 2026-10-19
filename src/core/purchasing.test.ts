import { describe, expect, it } from "vitest";
import {
  billAmount,
  canAutoApprove,
  outstandingAmount,
  overpaidAmount,
  PaymentInput,
  planPurchaseDrafts,
  PurchaseOrderInput,
  purchaseOrderMessage,
  ReceiveInput,
  sumLines,
  SupplierInput,
  whatsappLink,
} from "./purchasing";

const V1 = "00000000-0000-4000-8000-000000000001";
const V2 = "00000000-0000-4000-8000-000000000002";
const V3 = "00000000-0000-4000-8000-000000000003";

describe("purchase money", () => {
  it("sums in integer rupiah without losing precision", () => {
    expect(sumLines([{ qty: 3, unit_cost: 45_000 }, { qty: 1, unit_cost: 1 }])).toBe(135_001);
    expect(sumLines([{ qty: 1_000_000, unit_cost: 1_000_000_000 }])).toBe(1_000_000_000_000_000);
    expect(sumLines([])).toBe(0);
  });

  it("bills the goods that came, or the whole order when paying ahead", () => {
    expect(billAmount({ status: "draft", total: 900_000, received_total: 0 })).toBe(0);
    expect(billAmount({ status: "ordered", total: 900_000, received_total: 0 })).toBe(900_000);
    expect(billAmount({ status: "partial", total: 900_000, received_total: 450_000 })).toBe(450_000);
    expect(billAmount({ status: "canceled", total: 900_000, received_total: 0 })).toBe(0);
    expect(outstandingAmount({ status: "received", total: 900_000, received_total: 1_000_000, paid_total: 600_000 })).toBe(400_000);
    expect(outstandingAmount({ status: "received", total: 1, received_total: 1, paid_total: 5 })).toBe(0);
    // Paid the whole order ahead, half arrived so far: a balance with the supplier, not a debt.
    expect(overpaidAmount({ status: "partial", total: 3_080_000, received_total: 2_648_000, paid_total: 3_080_000 })).toBe(432_000);
    expect(overpaidAmount({ status: "ordered", total: 100, received_total: 0, paid_total: 100 })).toBe(0);
  });
});

describe("inputs", () => {
  it("validates an order and its lines", () => {
    const ok = PurchaseOrderInput.safeParse({ supplier_id: null, lines: [{ variant_id: V1, qty: 2, unit_cost: 1000 }] });
    expect(ok.success && ok.data.note).toBe("");
    expect(PurchaseOrderInput.safeParse({ supplier_id: null, lines: [] }).error?.issues[0]?.message).toBe("Tambahkan minimal satu barang.");
    expect(PurchaseOrderInput.safeParse({ supplier_id: null, lines: [{ variant_id: V1, qty: 0, unit_cost: 1 }] }).success).toBe(false);
    expect(PurchaseOrderInput.safeParse({ supplier_id: null, lines: [{ variant_id: V1, qty: 1, unit_cost: 1.5 }] }).success).toBe(false);
  });

  it("needs at least one arriving item to receive, and a sane payment", () => {
    const key = "rcv-12345678";
    expect(ReceiveInput.safeParse({ lines: [{ variant_id: V1, qty: 0, unit_cost: 1 }], idempotency_key: key }).error?.issues[0]?.message).toBe(
      "Isi jumlah barang yang datang.",
    );
    expect(ReceiveInput.safeParse({ lines: [{ variant_id: V1, qty: 2, unit_cost: 1 }], idempotency_key: key }).success).toBe(true);
    expect(PaymentInput.safeParse({ amount: 0, idempotency_key: key }).success).toBe(false);
    expect(PaymentInput.parse({ amount: 10, idempotency_key: key }).method).toBe("transfer");
  });

  it("normalizes the supplier's WhatsApp number", () => {
    expect(SupplierInput.parse({ name: " CV Jaya ", phone: "0812-3456-7890" })).toEqual({ name: "CV Jaya", phone: "+6281234567890", note: "" });
    expect(SupplierInput.parse({ name: "Tanpa nomor" }).phone).toBeNull();
    expect(SupplierInput.safeParse({ name: "X", phone: "12" }).error?.issues[0]?.message).toContain("Nomor WhatsApp");
  });
});

describe("planPurchaseDrafts", () => {
  const needs = [
    { variant_id: V1, title: "Serum", unit: "pcs", qty: 20, avg_cost: 40_000 },
    { variant_id: V2, title: "Toner", unit: "pcs", qty: 10, avg_cost: 20_000 },
    { variant_id: V3, title: "Masker", unit: "pcs", qty: 5, avg_cost: 0 },
    { variant_id: "skip", title: "Nol", unit: "pcs", qty: 0, avg_cost: 1 },
  ];
  const suppliers: Record<string, { supplier_id: string; last_unit_cost: number }> = {
    [V1]: { supplier_id: "s1", last_unit_cost: 45_000 },
    [V2]: { supplier_id: "s1", last_unit_cost: 18_000 },
  };

  it("groups products by their last supplier at that supplier's price; unknown ones wait for a supplier", () => {
    const plans = planPurchaseDrafts(needs, (id) => suppliers[id]);
    expect(plans).toEqual([
      {
        supplier_id: "s1",
        lines: [
          { variant_id: V1, qty: 20, unit_cost: 45_000 },
          { variant_id: V2, qty: 10, unit_cost: 18_000 },
        ],
        items: [
          { title: "Serum", qty: 20, unit: "pcs" },
          { title: "Toner", qty: 10, unit: "pcs" },
        ],
        total: 1_080_000,
      },
      { supplier_id: null, lines: [{ variant_id: V3, qty: 5, unit_cost: 0 }], items: [{ title: "Masker", qty: 5, unit: "pcs" }], total: 0 },
    ]);
  });

  it("approves by itself only with a supplier and within a set limit", () => {
    expect(canAutoApprove({ supplier_id: "s1", total: 500_000 }, 500_000)).toBe(true);
    expect(canAutoApprove({ supplier_id: "s1", total: 500_001 }, 500_000)).toBe(false);
    expect(canAutoApprove({ supplier_id: "s1", total: 1 }, 0)).toBe(false);
    expect(canAutoApprove({ supplier_id: null, total: 1 }, 500_000)).toBe(false);
  });
});

describe("supplier message", () => {
  it("lists items with prices and the total, and opens WhatsApp to the supplier", () => {
    const text = purchaseOrderMessage("Glow by Sari", "PO-2610-0001", [
      { title: "Serum Vit C", qty: 20, unit: "pcs", unit_cost: 45_000 },
      { title: "Toner", qty: 10, unit: "pcs", unit_cost: 18_000 },
    ]);
    expect(text).toBe(
      [
        "Halo, saya dari Glow by Sari. Pesanan PO-2610-0001:",
        "- Serum Vit C: 20 pcs × Rp45.000",
        "- Toner: 10 pcs × Rp18.000",
        "Total Rp1.080.000",
        "",
        "Mohon konfirmasi stok dan estimasi kirimnya. Terima kasih.",
      ].join("\n"),
    );
    expect(whatsappLink("+6281234567000", "a b")).toBe("https://wa.me/6281234567000?text=a%20b");
    expect(whatsappLink(null, "x")).toBe("https://wa.me/?text=x");
  });
});
