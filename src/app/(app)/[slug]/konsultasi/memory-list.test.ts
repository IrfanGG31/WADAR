import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));
vi.mock("./memory-actions", () => ({ updateMemoryItem: async () => ({}), deleteMemoryItem: async () => ({}) }));
const { MemoryList } = await import("./memory-list");

describe("MemoryList (“Yang WADAR tahu”, CON-4)", () => {
  it("shows each saved note with its own edit and delete buttons", () => {
    const html = renderToStaticMarkup(
      createElement(MemoryList, {
        slug: "glow",
        items: [
          { id: "m1", kind: "preference", content: "Jangan diskon di atas 15%", pinned: true },
          { id: "m2", kind: "fact", content: "Libur tiap Minggu", pinned: true },
        ],
      }),
    );
    expect(html).toContain("Yang WADAR tahu");
    expect(html).toContain("Jangan diskon di atas 15%");
    expect(html).toContain("Libur tiap Minggu");
    expect(html).toContain('aria-label="Ubah: Jangan diskon di atas 15%"');
    expect(html).toContain('aria-label="Hapus: Libur tiap Minggu"');
  });

  it("no notes yet → explains how to add one", () => {
    const html = renderToStaticMarkup(createElement(MemoryList, { slug: "glow", items: [] }));
    expect(html).toContain("Yang WADAR tahu");
    expect(html).toContain("Belum ada catatan");
  });
});
