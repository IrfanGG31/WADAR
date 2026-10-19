import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    for (const section of ["Data yang kami kumpulkan", "Pemisahan data antar-toko", "Pemroses data", "Data tidak dijual", "Ekspor data", "Hapus toko", "Hapus akun", "Hubungi kami"]) {
      expect(html).toContain(section);
    }
    expect(html).toContain("7 hari");
    expect(html).toContain("WADAR");
  });

  it("names the processors by service (database, hosting, AI model, login email)", () => {
    for (const name of ["Supabase", "Vercel", "Google Gemini", "Resend"]) expect(html).toContain(name);
  });

  describe("contact email from NEXT_PUBLIC_PRIVACY_EMAIL", () => {
    afterEach(() => vi.unstubAllEnvs());
    const render = () => renderToStaticMarkup(createElement(PrivacyPage));

    it("shows the configured address as a mailto link", () => {
      vi.stubEnv("NEXT_PUBLIC_PRIVACY_EMAIL", " Privasi@Contoh.id ");
      const page = render();
      expect(page).toContain('href="mailto:privasi@contoh.id?subject=Permintaan%20data%20pribadi"');
      expect(page).toContain(">privasi@contoh.id</a>");
      expect(page).not.toContain("belum ditetapkan");
    });

    it("falls back to a clear 'not set yet' text pointing at the in-app tools when unset or invalid", () => {
      for (const value of ["", "bukan-email"]) {
        vi.stubEnv("NEXT_PUBLIC_PRIVACY_EMAIL", value);
        const page = render();
        expect(page).toContain("Alamat email resmi untuk permintaan data pribadi belum ditetapkan.");
        expect(page).not.toContain("mailto:");
      }
    });
  });

  it("is public: signed-out visitors may read it", () => {
    expect(isPublicPath("/privasi")).toBe(true);
    expect(isPublicPath("/glow/beranda")).toBe(false);
  });
});
