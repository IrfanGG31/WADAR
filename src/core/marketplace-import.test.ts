import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mapOrderStatus, matchLines, parseMarketplaceCsv, parseOrderTime, toImportPayload } from "./marketplace-import";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures/marketplace", name), "utf8");
const TZ = "Asia/Jakarta";
const VARIANTS = [
  { id: "v-serum", sku: "SERU-001", label: "Serum Vit C 20ml" },
  { id: "v-toner", sku: "tone-001", label: "Hydrating Toner 100ml" },
  { id: "v-lip", sku: "LIPB-001", label: "Lip Balm — Pink" },
];

describe("parseOrderTime", () => {
  it("reads common seller-center formats in the shop's zone", () => {
    expect(parseOrderTime("2026-10-18 09:15", TZ)).toBe("2026-10-18T02:15:00.000Z");
    expect(parseOrderTime("18/10/2026 21:30", TZ)).toBe("2026-10-18T14:30:00.000Z");
    expect(parseOrderTime("18-10-2026 08:01:00", TZ)).toBe("2026-10-18T01:01:00.000Z");
    expect(parseOrderTime("2026-10-18T09:15:00+07:00", TZ)).toBe("2026-10-18T02:15:00.000Z");
    expect(parseOrderTime("kemarin", TZ)).toBeNull();
  });
});

describe("mapOrderStatus", () => {
  it("books paid orders, keeps canceled/returned, skips unpaid", () => {
    expect(mapOrderStatus("Selesai")).toBe("completed");
    expect(mapOrderStatus("Perlu Dikirim")).toBe("completed");
    expect(mapOrderStatus("Cancelled")).toBe("canceled");
    expect(mapOrderStatus("Dikembalikan")).toBe("returned");
    expect(mapOrderStatus("Pengembalian Dana")).toBe("returned");
    expect(mapOrderStatus("Belum Bayar")).toBeNull();
  });
});

describe("Shopee export (IMP-1)", () => {
  const parsed = parseMarketplaceCsv(fixture("shopee.csv"), TZ);
  if (!parsed.ok) throw new Error(parsed.error);

  it("groups item rows into orders, skips unpaid, takes order-level numbers once", () => {
    expect(parsed.detected).toBe("shopee");
    expect(parsed.unpaid).toBe(1);
    expect(parsed.orders.map((o) => [o.external_order_id, o.status, o.lines.length])).toEqual([
      ["2610180A1B2C3D", "completed", 2],
      ["2610181X9Y8Z7W", "canceled", 1],
      ["2610183P6Q7R8S", "completed", 1],
    ]);
    const first = parsed.orders[0];
    expect(first?.order_discount).toBe(10000);
    expect(first?.platform_fee).toBeNull(); // not in this export → estimated from the channel rate
    expect(first?.buyer_name).toBe("rina_beauty");
    expect(first?.lines[0]).toMatchObject({ key: "SERU-001", qty: 2, unit_price: 89000, line_discount: 0 });
  });

  it("matches by SKU, holds orders with an unknown product until it is matched by hand", () => {
    const auto = matchLines(parsed.orders, VARIANTS);
    expect(auto.unmatched).toEqual([{ key: "LIPB-XX", name: "Lip Balm Edisi Lama — Pink", orders: 1 }]);
    expect(toImportPayload(parsed.orders, auto.match)).toMatchObject({ held: 1, ready: [{ external_order_id: "2610180A1B2C3D" }, {}] });

    const manual = matchLines(parsed.orders, VARIANTS, { "LIPB-XX": "v-lip", bogus: "x" });
    expect(manual.unmatched).toEqual([]);
    const { ready, held } = toImportPayload(parsed.orders, manual.match);
    expect(held).toBe(0);
    expect(ready[2]?.items).toEqual([{ variant_id: "v-lip", qty: 3, unit_price: 35000, line_discount: 0 }]);
  });
});

describe("TikTok Shop export (IMP-2)", () => {
  it("reads English headers and the after-discount subtotal", () => {
    const parsed = parseMarketplaceCsv(fixture("tiktok.csv"), TZ);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.detected).toBe("tiktok_shop");
    expect(parsed.orders.map((o) => o.status)).toEqual(["completed", "canceled"]);
    expect(parsed.orders[0]).toMatchObject({ order_discount: 0, occurred_at: "2026-10-18T03:05:11.000Z" });
    expect(parsed.orders[0]?.lines[0]).toMatchObject({ unit_price: 89000, line_discount: 0 });
    expect(matchLines(parsed.orders, VARIANTS).unmatched).toEqual([]); // SKU match is case-insensitive
  });
});

describe("Tokopedia export (IMP-3)", () => {
  it("reads invoices and returned orders", () => {
    const parsed = parseMarketplaceCsv(fixture("tokopedia.csv"), TZ);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.detected).toBe("tokopedia");
    expect(parsed.orders.map((o) => [o.external_order_id, o.status])).toEqual([
      ["INV/20261018/MPL/1234567", "completed"],
      ["INV/20261018/MPL/1234568", "returned"],
    ]);
  });
});

describe("parseMarketplaceCsv edge cases", () => {
  it("splits a line total that does not divide evenly into whole-rupiah unit price + line discount", () => {
    const parsed = parseMarketplaceCsv("Order ID,Seller SKU,Quantity,SKU Subtotal After Discount\nA1,X,3,100000\n", TZ);
    if (!parsed.ok) throw new Error(parsed.error);
    const l = parsed.orders[0]?.lines[0];
    expect(l).toMatchObject({ unit_price: 33334, line_discount: 2 });
    expect((l?.unit_price ?? 0) * 3 - (l?.line_discount ?? 0)).toBe(100000);
  });

  it("refuses a file that is not an order export", () => {
    const parsed = parseMarketplaceCsv("Nama,Harga\nKopi,10000\n", TZ);
    expect(parsed.ok).toBe(false);
  });

  it("reports unreadable rows without dropping the rest", () => {
    const parsed = parseMarketplaceCsv("Order ID,Seller SKU,Quantity,SKU Subtotal After Discount\nA1,X,dua,100000\nA2,X,1,5000\n", TZ);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.orders).toHaveLength(1);
    expect(parsed.errors).toEqual([{ line: 2, message: "Pesanan A1: jumlah barang tidak terbaca." }]);
  });
});
