import { describe, expect, it } from "vitest";
import { ApiOrdersInput, resolveApiOrders } from "./api-orders";

const V = [
  { id: "00000000-0000-4000-8000-000000000001", sku: "SRM-1" },
  { id: "00000000-0000-4000-8000-000000000002", sku: null },
];

describe("API orders", () => {
  it("maps SKUs case-insensitively and keeps variant ids", () => {
    const input = ApiOrdersInput.parse({
      channel: "shopee",
      orders: [
        { external_order_id: "A1", items: [{ sku: "srm-1", qty: 2, unit_price: 89000 }] },
        { external_order_id: "A2", items: [{ variant_id: V[1]!.id, qty: 1 }] },
        { external_order_id: "A3", items: [{ sku: "NOPE", qty: 1 }] },
      ],
    });
    const { ready, errors } = resolveApiOrders(input, V);
    expect(ready.map((o) => o.items[0]?.variant_id)).toEqual([V[0]!.id, V[1]!.id]);
    expect(ready[0]).toMatchObject({ status: "completed", order_discount: 0, platform_fee: null });
    expect(errors).toEqual([{ order: "A3", error: 'Produk "NOPE" tidak ditemukan di WADAR.' }]);
  });

  it("rejects items without a product reference and unknown channels", () => {
    expect(ApiOrdersInput.safeParse({ orders: [{ external_order_id: "A", items: [{ qty: 1 }] }] }).success).toBe(false);
    expect(ApiOrdersInput.safeParse({ channel: "lazada", orders: [{ external_order_id: "A", items: [{ sku: "X", qty: 1 }] }] }).success).toBe(false);
  });
});
