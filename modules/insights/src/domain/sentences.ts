import { formatRupiah } from "@wadar/core";

export type Trend = "up" | "down" | "flat";

export function trendOf(today: number, yesterday: number): Trend {
  if (today === yesterday) return "flat";
  return today > yesterday ? "up" : "down";
}

/** Whole-percent change, or null when yesterday was zero (a % from zero is meaningless). */
export function percentChange(today: number, yesterday: number): number | null {
  if (yesterday === 0) return null;
  return Math.round(((today - yesterday) / Math.abs(yesterday)) * 100);
}

/**
 * Deterministic context lines for the Beranda cards (BUILD-PLAN M6: "kalimat
 * konteks … template deterministik dulu", PRD §4.2). Today is usually still
 * in progress, so comparisons say "kemarin seharian" instead of implying a
 * like-for-like day.
 */
export function moneyInSentence(today: number, yesterday: number): string {
  if (today === 0 && yesterday === 0) return "Belum ada uang masuk hari ini maupun kemarin.";
  if (today === 0) return `Belum ada uang masuk hari ini. Kemarin seharian ${formatRupiah(yesterday)}.`;
  const pct = percentChange(today, yesterday);
  if (pct === null) return "Kemarin tidak ada uang masuk — hari ini sudah mulai.";
  if (today >= yesterday) return `Sudah ${pct === 0 ? "sama dengan" : `${pct}% di atas`} kemarin seharian (${formatRupiah(yesterday)}).`;
  return `Kemarin seharian ${formatRupiah(yesterday)} — hari ini masih berjalan.`;
}

export function profitSentence(profit: number, netSales: number, costOfGoods: number, expenses: number): string {
  if (netSales === 0 && expenses === 0) return "Belum ada penjualan hari ini.";
  if (netSales > 0 && costOfGoods === 0) return "Modal barang (HPP) belum diisi — untung sebenarnya lebih kecil dari ini.";
  if (profit < 0 && expenses > 0) return `Pengeluaran ${formatRupiah(expenses)} lebih besar dari untung penjualan hari ini.`;
  if (netSales === 0) return "Belum ada penjualan hari ini.";
  const margin = Math.round((profit / netSales) * 100);
  return `Dari setiap Rp100 penjualan, untungnya Rp${Math.max(margin, 0)}.`;
}

/** `walletCount` = wallets currently holding money (non-zero balance). */
export function balanceSentence(total: number, walletCount: number): string {
  if (walletCount === 0) return "Belum ada uang tercatat di dompet.";
  if (total < 0) return "Saldo minus — cek dompet yang dipakai untuk pengeluaran.";
  if (walletCount === 1) return "Semua uangmu ada di 1 dompet.";
  return `Gabungan ${walletCount} dompet (kas laci, bank, QRIS, dll.).`;
}

export function stockAlertTitle(name: string, onHand: number, daysLeft: number | null): string {
  if (onHand < 0) return `Stok ${name} minus di sistem`;
  if (onHand === 0) return `${name} habis`;
  if (daysLeft !== null) return `${name} habis ±${daysLeft} hari lagi`;
  return `Stok ${name} tinggal ${onHand}`;
}
