import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImportHistory } from "./import-history";

const rows = [
  { id: "i2", file_name: "shopee.csv", rows_total: 12, created_count: 8, updated_count: 3, failed_count: 1, created_at: "2026-10-17T03:05:00Z" },
  { id: "i1", file_name: null, rows_total: 4, created_count: 0, updated_count: 4, failed_count: 0, created_at: "2026-10-16T10:00:00Z" },
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

  it("no import yet → a short empty note", () => {
    const html = renderToStaticMarkup(createElement(ImportHistory, { imports: [], timeZone: "Asia/Jakarta" }));
    expect(html).toContain("Belum ada impor");
  });
});
