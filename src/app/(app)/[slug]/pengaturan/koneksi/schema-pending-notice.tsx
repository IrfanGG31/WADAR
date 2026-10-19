/** Code deployed before the `connect_hub` migration: say so instead of failing the page. */
export function SchemaPendingNotice() {
  return (
    <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      Pusat Koneksi sedang disiapkan: pembaruan database belum diterapkan, jadi pengaturan di halaman ini belum bisa disimpan. Kasir, stok, keuangan,
      dan chat pembeli tetap berjalan seperti biasa.
    </p>
  );
}
