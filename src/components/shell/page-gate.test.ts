import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { can, type MemberRole, type Permission } from "@/core/roles";

/** CON-6: a restricted page body runs only after the guard; refused members go to Beranda. */
let role: MemberRole | null = "cashier";
vi.mock("@/db/access", () => ({
  requirePermission: async (slug: string, permission: Permission) => {
    if (!can(role, permission)) throw new Error(`NEXT_REDIRECT:/${slug}/beranda?ditolak=${permission}`);
    return { shop: { id: "t1" }, role };
  },
}));
const { PageGate } = await import("./page-gate");
const params = Promise.resolve({ slug: "toko" });

describe("PageGate", () => {
  it("renders the body for an allowed member", async () => {
    role = "owner";
    expect(await PageGate({ params, permission: "finance", children: "angka" })).toBe("angka");
  });

  it("redirects a cashier away from Keuangan without rendering the body", async () => {
    role = "cashier";
    await expect(PageGate({ params, permission: "finance", children: "angka" })).rejects.toThrow(
      "NEXT_REDIRECT:/toko/beranda?ditolak=finance",
    );
  });
});

describe("restricted pages are gated", () => {
  const pages: [string, Permission][] = [
    ["keuangan/page.tsx", "finance"],
    ["keuangan/detail/page.tsx", "finance"],
    ["keuangan/margin/page.tsx", "finance"],
    ["konsultasi/page.tsx", "consult"],
    ["pengaturan/page.tsx", "settings"],
    ["chat/page.tsx", "chat"],
    ["chat/[id]/page.tsx", "chat"],
    ["kasir/page.tsx", "sell"],
    ["kasir/riwayat/page.tsx", "sell"],
    ["stok/impor/page.tsx", "catalog"],
    ["stok/produk/baru/page.tsx", "catalog"],
    ["stok/produk/[id]/page.tsx", "catalog"],
  ];
  it.each(pages)("%s needs %s", (file, permission) => {
    const src = readFileSync(join(process.cwd(), "src/app/(app)/[slug]", file), "utf8");
    expect(src).toContain(`<PageGate params={params} permission="${permission}">`);
  });
});
