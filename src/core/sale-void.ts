import { z } from "zod";
import { brand } from "@/brand";

/**
 * Void penjualan (POS-5). The sale row stays (append-only); `public.void_sale` flips its
 * status to 'void', returns the stock and drops it from every report
 * (migration 20261017170000_sale_void). Pure helpers for the action and Riwayat.
 */

export type SaleStatus = "completed" | "void" | "canceled" | "returned";

export const VOID_REASON_MAX = 200;

export const VoidSaleInput = z.object({
  sale_id: z.string().uuid("Transaksi tidak ditemukan."),
  reason: z.string().trim().max(VOID_REASON_MAX, `Alasan maksimal ${VOID_REASON_MAX} karakter.`).optional().default(""),
});
export type VoidSaleInput = z.infer<typeof VoidSaleInput>;

/** Only a completed sale can be voided (a void is final; there is no "un-void"). */
export function isVoidable(status: string | null | undefined): boolean {
  return status === "completed";
}

/** Riwayat badge; null for a normal completed sale. */
export function saleStatusLabel(status: string | null | undefined): string | null {
  switch (status) {
    case "void":
      return "Dibatalkan";
    case "canceled":
      return "Batal";
    case "returned":
      return "Diretur";
    default:
      return null;
  }
}

/** Sum of totals that still count (completed only) — what Riwayat shows per day. */
export function countedTotal(sales: readonly { status?: string | null; total: number | string }[]): number {
  return sales.reduce((sum, s) => (s.status == null || s.status === "completed" ? sum + Number(s.total) : sum), 0);
}

export function voidResultNote(result: { already_void?: boolean; restocked?: number }): string {
  if (result.already_void) return "Transaksi ini sudah dibatalkan sebelumnya.";
  const qty = Number(result.restocked ?? 0);
  return qty > 0
    ? `Transaksi dibatalkan. ${qty} barang kembali ke stok dan tidak dihitung di laporan.`
    : "Transaksi dibatalkan dan tidak dihitung di laporan.";
}

/** Message for an RPC error from `void_sale`. */
export function voidSaleError(error: { code?: string; message?: string } | null): string | undefined {
  if (!error) return undefined;
  switch (error.code) {
    case "42501":
      return "Hanya pemilik toko yang bisa membatalkan transaksi.";
    case "P0002":
      return "Transaksi tidak ditemukan.";
    case "55000":
      return "Transaksi ini tidak bisa dibatalkan.";
    case "22023":
      return error.message || "Alasan pembatalan belum benar.";
    case "42883":
    case "PGRST202":
      return `Fitur batalkan transaksi belum aktif di server. Hubungi admin ${brand.shortName}.`;
    default:
      return "Pembatalan belum berhasil. Transaksi tidak berubah, coba lagi sebentar.";
  }
}
