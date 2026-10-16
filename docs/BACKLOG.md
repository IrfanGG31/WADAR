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
- ~~Aturan FIN-6 sisanya: `MARGIN_DROP` dan `MISSING_COST`~~ — **selesai di core (17 Okt, GAP #8)**: `marginDrop`/`missingCost` di `src/core/finance.ts`, narasi sebab-akibat di `finance-insight.ts`, ikut insight mingguan Konsultasi. Pembanding = periode sama panjang tepat sebelumnya (7 vs 7 / 30 vs 30), bukan rata-rata 4 minggu.
- Pilihan periode Keuangan (FIN-3): core siap (`periodComparison`, `parseFinancePeriodDays` `?periode=7|30`, `periodLabels`, `warningRows(lines, { previous, days })`). **Belum di UI**: halaman `keuangan/margin/page.tsx` (+ `margin-parts.tsx`, `keuangan/page.tsx`) sedang diubah agen lain — sambungkan di sana: baca `searchParams.periode`, ganti `lastDays(today, 7)` dengan `periodComparison(today, days)`, oper `previous` ke `warningRows`, ganti `CURRENT_LABEL` dengan `periodLabels(days)`. Default tetap 7 hari. Harian/bulanan kalender belum.
- Konsultasi (D7): hapus/ubah memori "Yang WADAR tahu" (CON-4), kuota pertanyaan per paket (CON-7), izin Kasir/Admin Chat (CON-6), cache insight Beranda 1×/hari (CON-5), kandidat "pertanyaan pembeli belum terjawab" untuk insight mingguan, golden set 150 pertanyaan (CON-1).
- D8: cache Konsultasi bersama lintas instance Vercel (tabel/KV; sekarang memori per instance), service worker Serwist (cache shell/offline, TECH-SPEC §14), Lighthouse mobile di URL produksi + halaman berlogin.
- Widget: kirim embedding pertanyaan ke `chat_kb_candidates` (sekarang `p_embedding: null`, KB widget hanya kata kunci). Teks Pengaturan FAQ sudah tidak menjanjikan pencarian makna. (review P6)
