import { describe, expect, it } from "vitest";
import { normalizeImportRow, parseIndonesianNumber, planProductImport } from "./product-import.js";

const none = { skus: new Set<string>(), barcodes: new Set<string>() };

describe("parseIndonesianNumber", () => {
  it.each([
    ["Rp15.000", 15000],
    ["15.000", 15000],
    ["15,000", 15000],
    ["Rp 1.250.000", 1250000],
    ["15.000,50", 15000],
    [15000, 15000],
    [15000.4, 15000],
    ["12", 12],
  ])("%s → %s", (input, expected) => {
    expect(parseIndonesianNumber(input)).toBe(expected);
  });

  it.each(["abc", "", "12a", null, undefined])("%s → NaN", (input) => {
    expect(parseIndonesianNumber(input)).toBeNaN();
  });
});

describe("normalizeImportRow", () => {
  it("maps Indonesian headers and parses numbers", () => {
    expect(
      normalizeImportRow({ "Nama Produk": "Serum Vit C", "Harga Jual": "Rp89.000", HPP: "45.000", "Stok Awal": "12", Kategori: "" }),
    ).toEqual({ name: "Serum Vit C", price: 89000, cost: 45000, stock: 12 });
  });
});

describe("planProductImport", () => {
  it("groups variants by product name and reports invalid rows with spreadsheet row numbers", () => {
    const plan = planProductImport(
      [
        { nama: "Kaos Polos", varian: "M", harga: "50.000", sku: "KP-M" },
        { nama: "Kaos Polos", varian: "L", harga: "55.000", sku: "KP-L" },
        { nama: "Topi", harga: "abc" },
        { nama: "Tas", harga: "-5" },
        { harga: "10.000" },
        { nama: "Sabun", harga: "5.000", sku: "kp-m" },
      ],
      none,
    );
    expect(plan.validRows).toBe(2);
    expect(plan.products).toHaveLength(1);
    expect(plan.products[0]!.variants.map((v) => v.name)).toEqual(["M", "L"]);
    expect(plan.errors).toEqual([
      { row: 4, message: "Harga harus berupa angka" },
      { row: 5, message: "Harga tidak boleh minus" },
      { row: 6, message: "Nama wajib diisi" },
      { row: 7, message: 'SKU "kp-m" dobel dengan baris 2' },
    ]);
  });

  it("rejects SKUs/barcodes the tenant already uses", () => {
    const plan = planProductImport([{ nama: "Ab", harga: 1000, sku: "X1", barcode: "899" }], {
      skus: new Set(["x1"]),
      barcodes: new Set(["899"]),
    });
    expect(plan.validRows).toBe(0);
    expect(plan.errors[0]!.message).toContain("SKU");
    expect(plan.errors[0]!.message).toContain("Barcode");
  });

  it("plans 500 rows quickly", () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ nama: `Produk ${i}`, harga: 1000 + i, sku: `SKU${i}` }));
    const started = performance.now();
    const plan = planProductImport(rows, none);
    expect(plan.validRows).toBe(500);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
