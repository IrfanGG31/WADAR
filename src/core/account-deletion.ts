import { brand } from "@/brand";

/**
 * Hapus akun (GAP #6, sisa): a user deletes their own account's app data through
 * `public.delete_my_account` (migration 20261017170100_account_deletion). Pure helpers
 * shared by the action, the page and the tests.
 */

/** What an account without an email (anonymous demo session) types to confirm. */
export const ACCOUNT_CONFIRM_WORD = "HAPUS";

/** The text the user must type: their email, or HAPUS when the account has none. */
export function accountConfirmTarget(email: string | null | undefined): string {
  const e = email?.trim().toLowerCase();
  return e ? e : ACCOUNT_CONFIRM_WORD;
}

/** Case and surrounding spaces don't matter (the SQL compares the same way). */
export function confirmsAccountDeletion(email: string | null | undefined, typed: string | null | undefined): boolean {
  const t = typed?.trim().toLowerCase();
  return !!t && t === accountConfirmTarget(email).toLowerCase();
}

export interface BlockedShop {
  slug: string;
  name: string;
}

export interface AccountDeletionResult {
  deleted: boolean;
  blockedShops: BlockedShop[];
  leftShops: number;
  deletedDemoShops: number;
}

/** The RPC's jsonb, defensively (a missing field reads as nothing deleted). */
export function parseAccountDeletion(data: unknown): AccountDeletionResult {
  const d = (data ?? {}) as Record<string, unknown>;
  const blocked = Array.isArray(d.blocked_shops) ? d.blocked_shops : [];
  return {
    deleted: d.deleted === true,
    blockedShops: blocked
      .filter((s): s is BlockedShop => typeof s === "object" && s !== null && typeof (s as BlockedShop).slug === "string")
      .map((s) => ({ slug: s.slug, name: typeof s.name === "string" ? s.name : s.slug })),
    leftShops: Number(d.left_shops ?? 0) || 0,
    deletedDemoShops: Number(d.deleted_demo_shops ?? 0) || 0,
  };
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} dan ${names.at(-1)}`;
}

/** Why the account was not deleted: the user is the last owner of these shops. */
export function blockedMessage(shops: readonly BlockedShop[]): string {
  const names = shops.map((s) => s.name);
  return (
    `Akun belum dihapus: kamu pemilik terakhir toko ${joinNames(names)}. ` +
    "Hapus toko itu dulu (Pengaturan → Data & privasi) atau jadikan anggota lain pemilik (Pengaturan → Anggota tim), lalu coba lagi."
  );
}

/** Message for an RPC error from `delete_my_account`. */
export function accountDeletionError(error: { code?: string; message?: string } | null): string | undefined {
  if (!error) return undefined;
  switch (error.code) {
    case "22023":
      return "Konfirmasi tidak cocok. Ketik persis seperti yang diminta.";
    case "28000":
      return "Sesi masuk sudah habis. Masuk lagi, lalu ulangi.";
    case "42883":
    case "PGRST202":
      return `Fitur hapus akun belum aktif di server. Hubungi admin ${brand.shortName}.`;
    default:
      return "Akun belum terhapus. Datamu tidak berubah, coba lagi sebentar.";
  }
}
