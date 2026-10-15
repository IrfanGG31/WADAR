# Backlog (di luar scope sprint BPC)

Dicatat saat menolak/menunda fitur selama sprint (CLAUDE.md "Cara kerja"). Sumber: SPRINT-8D §1 kolom "Ditunda".

- Undang staf, peran kasir / admin chat (TEAM-1).
- Impor produk CSV/XLSX (CAT-2), upload foto produk (sprint: emoji/URL).
- Struk publik bertanda tangan (POS-3), void penjualan (POS-5), POS offline (POS-6).
- Impor file marketplace asli (IMP-1..4).
- Penyesuaian tanggal kembar (STK-6), risiko kedaluwarsa (STK-5).
- Ekspor laporan (FIN-7).
- WhatsApp produksi (CHT-1) — sprint: widget web saja.
- Insight mingguan terjadwal (CON-3) — sprint: tombol "generate sekarang".
- Billing, kuota, APK TWA, panel admin, evals lengkap.
- Rollup `stock_daily` / `fin_daily` + pg_cron (sprint: dihitung langsung dari transaksi).
- Aturan FIN-6 sisanya: `MARGIN_DROP` (margin turun ≥ 5 poin vs 4 minggu) dan `MISSING_COST` (sprint: 3 aturan).
- Pilihan periode Keuangan harian/bulanan + pembanding (FIN-3) — sprint: 7 hari vs 7 hari sebelumnya + detail 28 hari.
- Konsultasi (D7): hapus/ubah memori "Yang WADAR tahu" (CON-4), kuota pertanyaan per paket (CON-7), izin Kasir/Admin Chat (CON-6), cache insight Beranda 1×/hari (CON-5), kandidat "pertanyaan pembeli belum terjawab" untuk insight mingguan, golden set 150 pertanyaan (CON-1).
