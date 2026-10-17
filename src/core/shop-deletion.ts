/**
 * Hapus toko bertahap (PDF §C.3 Tabel 10, UU PDP): stage 1 schedules the
 * deletion (shop closed for buyers, owner can still export or cancel), stage 2
 * deletes every row of the shop. The rules live in SQL
 * (`request_shop_deletion`, `purge_shop`); this module only reads their answers.
 */
export const DELETION_GRACE_DAYS = 7;

export interface ShopDeletionRow {
  deletion_requested_at: string | null;
  purge_after: string | null;
}

export type DeletionStage = { stage: "active" } | { stage: "scheduled"; requestedAt: string; purgeAfter: string };

export function confirmsSlug(slug: string, typed: string | null | undefined): boolean {
  return typeof typed === "string" && typed.trim().toLowerCase() === slug;
}

export function deletionStage(row: ShopDeletionRow | null): DeletionStage {
  if (!row?.deletion_requested_at || !row.purge_after) return { stage: "active" };
  return { stage: "scheduled", requestedAt: row.deletion_requested_at, purgeAfter: row.purge_after };
}

/** Postgres codes raised by the deletion RPCs → owner-facing text. */
export function deletionError(error: { code?: string; message?: string } | null): string | undefined {
  if (!error) return undefined;
  switch (error.code) {
    case "42501":
      return "Hanya pemilik toko yang bisa menghapus toko.";
    case "22023":
      return "Ketik nama tautan toko dengan benar untuk konfirmasi.";
    case "55000":
      return "Jadwalkan penghapusan dulu sebelum menghapus permanen.";
    default:
      return "Belum berhasil. Datamu tidak berubah, coba lagi sebentar.";
  }
}
