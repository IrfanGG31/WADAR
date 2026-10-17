import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/proxy";
import PrivacyPage, { metadata } from "./page";

/** GAP #6 / PDF Tabel 7 "Kebijakan privasi & DPA (UU 27/2022)", §E.2 mitigasi kebocoran data. */
describe("/privasi", () => {
  const html = renderToStaticMarkup(createElement(PrivacyPage));

  it("renders the policy under UU PDP", () => {
    expect(metadata.title).toBe("Kebijakan Privasi");
    expect(html).toContain("<h1");
    expect(html).toContain("Kebijakan Privasi");
    expect(html).toContain("UU No. 27 Tahun 2022");
  });

  it("covers what is collected, isolation, no selling, export, deletion and contact", () => {
    for (const section of ["Data yang kami kumpulkan", "Pemisahan data antar-toko", "Data tidak dijual", "Ekspor data", "Hapus toko", "Hubungi kami"]) {
      expect(html).toContain(section);
    }
    expect(html).toContain("7 hari");
    expect(html).toContain("WADAR AI");
  });

  it("is public: signed-out visitors may read it", () => {
    expect(isPublicPath("/privasi")).toBe(true);
    expect(isPublicPath("/glow/beranda")).toBe(false);
  });
});
