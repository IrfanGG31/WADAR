/**
 * Staff roles (CON-6 / TEAM-1): what each `public.member_role` may do in the app.
 * Pure — src/db/access.ts reads the signed-in user's role and the server actions /
 * API routes ask {@link can} before writing. RLS still only checks membership.
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
