import { describe, expect, it } from "vitest";
import {
  mapColumns,
  parseCount,
  parseCsv,
  parseRupiahCell,
  planImport,
  prepareImport,
  storedRowErrors,
  MAX_IMPORT_ROWS,
  IMPORT_TEMPLATE_CSV,
} from "./catalog-import";

const HEADER = "nama produk,varian,sku,harga jual,hpp,stok awal,kategori";

describe("parseCsv", () => {
  it("reads quoted cells with commas, doubled quotes and newlines; keeps line numbers", () => {
    const rows = parseCsv('nama,sku\r\n"Serum ""Glow"", 20ml",SG-20\r\n\r\n"baris\nbaru",X-1\r\n');
    expect(rows).toEqual([
      { line: 1, cells: ["nama", "sku"] },
      { line: 2, cells: ['Serum "Glow", 20ml', "SG-20"] },
      { line: 4, cells: ["baris\nbaru", "X-1"] },
    ]);
  });

  it("strips a UTF-8 BOM and detects ; (Excel Indonesia) and tab delimiters", () => {
    expect(parseCsv("﻿nama;sku\nKopi;K-1")[1].cells).toEqual(["Kopi", "K-1"]);
    expect(parseCsv("nama\tsku\nKopi\tK-1")[1].cells).toEqual(["Kopi", "K-1"]);
  });

  it("an unclosed quote is an error, not a silently merged file", () => {
    expect(() => parseCsv('nama,sku\n"Kopi,K-1\n')).toThrow(/tanda kutip/);
  });
});

describe("parseRupiahCell / parseCount (whole rupiah, never float)", () => {
  it("accepts plain, dotted, Rp-prefixed and ,00 amounts", () => {
    expect(parseRupiahCell("89000")).toBe(89000);
    expect(parseRupiahCell("89.000")).toBe(89000);
    expect(parseRupiahCell("Rp 1.250.000")).toBe(1250000);
    expect(parseRupiahCell("Rp89.000,00")).toBe(89000);
    expect(parseRupiahCell("89,000")).toBe(89000);
    expect(parseRupiahCell("  ")).toBeNull();
  });

  it("rejects fractions of a rupiah, negatives and text", () => {
    expect(parseRupiahCell("89000,50")).toBeNaN();
    expect(parseRupiahCell("12.5")).toBeNaN();
    expect(parseRupiahCell("-5000")).toBeNaN();
    expect(parseRupiahCell("gratis")).toBeNaN();
  });

  it("counts are whole numbers", () => {
    expect(parseCount("12")).toBe(12);
    expect(parseCount("1.000")).toBe(1000);
    expect(parseCount("")).toBeNull();
    expect(parseCount("2,5")).toBeNaN();
  });
});

describe("mapColumns", () => {
  it("maps Indonesian and marketplace header names, case/space-insensitive", () => {
    const r = mapColumns(["Nama Produk", "Nama Variasi", "SKU", "Harga", "HPP", "Stok", "Kategori"]);
    expect(r).toEqual({ ok: true, columns: ["name", "option_label", "sku", "price", "cost", "initial_qty", "category"] });
  });

  it("rejects an unknown header and names it", () => {
    const r = mapColumns(["nama", "sku", "harga", "hpp", "warna kesukaan"]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.unknown).toEqual(["warna kesukaan"]);
    expect(r.error).toMatch(/warna kesukaan/);
  });

  it("a manual mapping makes an unknown header usable or ignored", () => {
    expect(mapColumns(["nama", "sku", "harga", "hpp", "Harga Coret"], { "Harga Coret": "ignore" })).toEqual({
      ok: true,
      columns: ["name", "sku", "price", "cost", null],
    });
    expect(mapColumns(["Judul", "sku", "harga", "hpp"], { Judul: "name" })).toMatchObject({ ok: true, columns: ["name", "sku", "price", "cost"] });
  });

  it("required columns missing → rejected; the same field twice → rejected", () => {
    const missing = mapColumns(["nama", "harga"]);
    expect(missing).toMatchObject({ ok: false, missing: ["sku", "cost"] });
    const twice = mapColumns(["nama", "sku", "harga", "harga jual", "hpp"]);
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error).toMatch(/harga jual/);
  });
});

describe("prepareImport", () => {
  it("valid CSV → one item per row, money as integer rupiah", () => {
    const r = prepareImport(`${HEADER}\nSerum Vit C,20 ml,SVC-20,89.000,35000,12,Serum\nSerum Vit C,Mini,SVC-M,25000,,0,Serum\n`);
    if (!r.ok) throw new Error(r.error);
    expect(r.errors).toEqual([]);
    expect(r.items).toEqual([
      { line: 2, name: "Serum Vit C", option_label: "20 ml", sku: "SVC-20", price: 89000, cost: 35000, initial_qty: 12, category: "Serum", unit: "", min_stock: null, description: "" },
      { line: 3, name: "Serum Vit C", option_label: "Mini", sku: "SVC-M", price: 25000, cost: null, initial_qty: 0, category: "Serum", unit: "", min_stock: null, description: "" },
    ]);
  });

  it("bad rows are reported per line and the rest still import", () => {
    const r = prepareImport(
      [
        HEADER,
        "Serum Vit C,20 ml,SVC-20,89000,35000,12,Serum",
        ",x,NONAME,1000,0,0,",
        "Toner,,TN-1,murah,0,0,",
        "Toner,,TN-2,50000,20000,2.5,",
        "Masker,,SVC-20,30000,10000,1,",
        "Masker,,,30000,10000,1,",
        "Lip Tint,,LT-1,45000,15000,3,Bibir",
      ].join("\n"),
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.items.map((i) => i.sku)).toEqual(["SVC-20", "LT-1"]);
    expect(r.errors).toEqual([
      { line: 3, sku: "NONAME", message: "Nama produk wajib diisi." },
      { line: 4, sku: "TN-1", message: "Harga jual harus angka rupiah bulat (contoh 89000)." },
      { line: 5, sku: "TN-2", message: "Stok awal harus angka bulat." },
      { line: 6, sku: "SVC-20", message: "SKU SVC-20 sudah dipakai di baris 2." },
      { line: 7, sku: "", message: "SKU wajib diisi (dipakai supaya impor ulang tidak dobel)." },
    ]);
    expect(r.totalRows).toBe(7);
  });

  it("an unknown header rejects the whole file before any row is read", () => {
    const r = prepareImport("nama,sku,harga,hpp,diskon rahasia\nKopi,K-1,18000,6000,10\n");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/diskon rahasia/);
      expect(r.headers).toEqual(["nama", "sku", "harga", "hpp", "diskon rahasia"]);
    }
  });

  it("empty file, header only, and too many rows are rejected", () => {
    expect(prepareImport("").ok).toBe(false);
    expect(prepareImport(`${HEADER}\n`)).toMatchObject({ ok: false, error: expect.stringMatching(/belum ada baris/) });
    const many = [HEADER, ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `P${i},,S${i},1000,0,0,`)].join("\n");
    expect(prepareImport(many)).toMatchObject({ ok: false, error: expect.stringMatching(/maksimal/) });
  });
});

describe("planImport (preview: SKU already in the shop = update, not a duplicate)", () => {
  it("marks existing SKUs as update (case-insensitive) and the rest as create", () => {
    const r = prepareImport(`${HEADER}\nSerum Vit C,20 ml,SVC-20,95000,36000,12,Serum\nSerum Vit C,50 ml,SVC-50,159000,70000,4,Serum\n`);
    if (!r.ok) throw new Error(r.error);
    const plan = planImport(r.items, [{ sku: "svc-20" }]);
    expect(plan.rows.map((p) => [p.sku, p.action])).toEqual([
      ["SVC-20", "update"],
      ["SVC-50", "create"],
    ]);
    expect(plan.counts).toEqual({ create: 1, update: 1 });
    // opening stock on an existing SKU is not added again (re-import is idempotent)
    expect(plan.rows[0].stockIgnored).toBe(true);
    expect(plan.rows[1].stockIgnored).toBe(false);
  });
});

describe("IMPORT_TEMPLATE_CSV", () => {
  it("the downloadable template imports cleanly", () => {
    const r = prepareImport(IMPORT_TEMPLATE_CSV);
    if (!r.ok) throw new Error(r.error);
    expect(r.errors).toEqual([]);
    expect(r.items.length).toBeGreaterThan(0);
  });
});

describe("storedRowErrors (riwayat impor: baris gagal)", () => {
  it("reads what import_catalog stored — app-rejected rows and RPC failures — in line order", () => {
    const prepared = prepareImport(`${HEADER}\nKopi,,KP-1,abc,1000,0,\nTeh,,TH-1,5000,2000,0,`);
    expect(prepared.ok).toBe(true);
    const rejected = prepared.ok ? prepared.errors : [];
    expect(rejected.length).toBeGreaterThan(0);
    const stored = [...rejected, { line: 1, sku: "X", message: "SKU sudah dipakai varian lain." }];
    const read = storedRowErrors(JSON.parse(JSON.stringify(stored)));
    expect(read[0]).toEqual({ line: 1, sku: "X", message: "SKU sudah dipakai varian lain." });
    expect(read.slice(1)).toEqual(rejected);
  });

  it("tolerates anything else in the column", () => {
    expect(storedRowErrors(null)).toEqual([]);
    expect(storedRowErrors({})).toEqual([]);
    expect(storedRowErrors([{ line: "4", message: "ok" }, { line: 0, message: "no" }, { line: 2, message: "  " }])).toEqual([
      { line: 4, sku: "", message: "ok" },
    ]);
  });
});
