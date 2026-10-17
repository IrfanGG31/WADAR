/**
 * Staff roles (CON-6 / TEAM-1): what each `public.member_role` may do in the app.
 * Pure — src/db/access.ts reads the signed-in user's role and the server actions /
 * API routes ask {@link can} before writing; RLS mirrors it with `app.has_shop_role`
 * (migration 20261017150000_role_rls).
 */

export type MemberRole = "owner" | "cashier" | "chat_admin";

export const PERMISSIONS = [
  "sell", // Kasir: catat penjualan
  "stock_in", // Stok masuk
  "catalog", // Tambah/ubah/arsipkan/impor produk
  "chat", // Ambil alih, balas, kembalikan ke AI, notifikasi eskalasi
  "consult", // Konsultasi Bisnis + "Yang WADAR tahu"
  "finance", // Laporan & ekspor keuangan
  "settings", // Profil toko, FAQ, notifikasi, reset demo
  "shop_data", // Ekspor semua data, hapus toko
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALLOWED: Record<MemberRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  cashier: ["sell", "stock_in"],
  chat_admin: ["chat"],
};

export function can(role: MemberRole | null | undefined, permission: Permission): boolean {
  if (!role || !Object.hasOwn(ALLOWED, role)) return false;
  return ALLOWED[role].includes(permission);
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "pemilik",
  cashier: "kasir",
  chat_admin: "admin chat",
};

const ACTION: Record<Permission, string> = {
  sell: "mencatat penjualan",
  stock_in: "mencatat stok masuk",
  catalog: "mengubah daftar produk",
  chat: "membalas chat pembeli",
  consult: "memakai Konsultasi Bisnis",
  finance: "melihat atau mengunduh laporan keuangan",
  settings: "mengubah pengaturan toko",
  shop_data: "mengekspor atau menghapus data toko",
};

/** The error shown when {@link can} says no. */
export function deniedMessage(role: MemberRole | null | undefined, permission: Permission): string {
  if (!role || !Object.hasOwn(ROLE_LABEL, role)) return `Kamu bukan anggota toko ini, jadi tidak bisa ${ACTION[permission]}.`;
  return `Akun ${ROLE_LABEL[role]} tidak bisa ${ACTION[permission]}. Minta pemilik toko melakukannya.`;
}

/**
 * App pages (/<slug>/<page>) that need a permission; every other page is open to all members.
 * The nav hides these and the page itself redirects to Beranda (src/db/access.ts `requirePermission`).
 */
export const PAGE_PERMISSION: Readonly<Record<string, Permission>> = {
  kasir: "sell",
  keuangan: "finance",
  chat: "chat",
  konsultasi: "consult",
  pengaturan: "settings",
};

export function canOpenPage(role: MemberRole | null | undefined, page: string): boolean {
  const permission = Object.hasOwn(PAGE_PERMISSION, page) ? PAGE_PERMISSION[page] : undefined;
  return permission === undefined ? role != null && Object.hasOwn(ALLOWED, role) : can(role, permission);
}

/** Query param on /<slug>/beranda after a refused page: `?ditolak=<permission>`. */
export const DENIED_PARAM = "ditolak";

const PAGE_NAME: Record<Permission, string> = {
  sell: "Penjualan",
  stock_in: "Stok masuk",
  catalog: "Ubah produk",
  chat: "Chat AI",
  consult: "Konsultasi Bisnis",
  finance: "Keuangan",
  settings: "Pengaturan",
  shop_data: "Data & privasi",
};

/** The Beranda banner for `?ditolak=…`; null for an unknown value (a hand-typed URL shows nothing). */
export function deniedPageNotice(role: MemberRole | null | undefined, value: string | string[] | undefined): string | null {
  const permission = typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value) ? (value as Permission) : null;
  if (!permission) return null;
  const who = role && Object.hasOwn(ROLE_LABEL, role) ? `akun ${ROLE_LABEL[role]}` : "akunmu";
  return `Halaman ${PAGE_NAME[permission]} tidak bisa dibuka dengan ${who}. Minta pemilik toko kalau kamu butuh aksesnya.`;
}
