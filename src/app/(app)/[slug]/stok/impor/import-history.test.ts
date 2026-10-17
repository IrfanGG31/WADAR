import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImportHistory, SHOWN_ERRORS } from "./import-history";

const rows = [
  { id: "i2", file_name: "shopee.csv", rows_total: 12, created_count: 8, updated_count: 3, failed_count: 1, created_at: "2026-10-17T03:05:00Z", errors: [{ line: 5, sku: "KP-02", message: "HPP harus angka." }] },
  { id: "i1", file_name: null, rows_total: 4, created_count: 0, updated_count: 4, failed_count: 0, created_at: "2026-10-16T10:00:00Z", errors: [] },
];

describe("ImportHistory", () => {
  it("lists each import with its time (shop time zone) and new / updated / failed counts", () => {
    const html = renderToStaticMarkup(createElement(ImportHistory, { imports: rows, timeZone: "Asia/Jakarta" }));
    expect(html).toContain("Riwayat impor");
    expect(html).toContain("shopee.csv");
    expect(html).toContain("17 Okt");
    expect(html).toContain("10.05"); // 03.05 UTC = 10.05 WIB
    expect(html).toContain("8 baru");
    expect(html).toContain("3 diperbarui");
    expect(html).toContain("1 gagal");
    expect(html).toContain("Tanpa nama file");
    expect(html).toContain("4 diperbarui");
    expect(html.indexOf("shopee.csv")).toBeLessThan(html.indexOf("Tanpa nama file"));
  });

  it("shows each failed row with its CSV line number and reason", () => {
    const html = renderToStaticMarkup(createElement(ImportHistory, { imports: rows, timeZone: "Asia/Jakarta" }));
    expect(html).toContain("Lihat baris gagal (1)");
    expect(html).toContain("Baris 5");
    expect(html).toContain("KP-02");
    expect(html).toContain("HPP harus angka.");
    expect(html.match(/Lihat baris gagal/g)).toHaveLength(1); // the clean import has no list
  });

  it("cuts a long error list and says how many more", () => {
    const errors = Array.from({ length: SHOWN_ERRORS + 3 }, (_, i) => ({ line: i + 2, sku: "", message: "Nama wajib diisi." }));
    const html = renderToStaticMarkup(createElement(ImportHistory, { imports: [{ ...rows[0], errors }], timeZone: "Asia/Jakarta" }));
    expect(html).toContain(`Lihat baris gagal (${SHOWN_ERRORS + 3})`);
    expect(html).toContain("dan 3 baris lainnya");
    expect(html).not.toContain(`Baris ${SHOWN_ERRORS + 2}<`);
  });

  it("no import yet → a short empty note", () => {
    const html = renderToStaticMarkup(createElement(ImportHistory, { imports: [], timeZone: "Asia/Jakarta" }));
    expect(html).toContain("Belum ada impor");
  });
});
