# ADR-006 — Jurnal double-entry otomatis (Neraca & Jurnal)

- Status: diterima (20 Okt 2026)
- Konteks: tahap 2 ADR-003. Keuangan menghitung laba dari rollup, tapi tidak ada posisi (kas, nilai stok, utang
  ke pemasok) dan tidak ada buku besar yang menghubungkan semua lini. Pola Odoo `account.move`, ukuran UMKM.

## Keputusan

1. **Bagan akun tetap dan kecil** (`accounts`): Kas & bank, Persediaan, Utang ke pemasok, Modal pemilik,
   Penjualan, HPP, Komisi marketplace, Subsidi ongkir, Selisih & susut stok, Beban operasional. Tidak bisa
   diubah toko: pemilik UMKM tidak perlu mengatur akuntansi.
2. **Satu dokumen = satu jurnal**, diposting oleh `app.post_journal` (SQL, idempoten lewat unik
   `(tenant_id, source_type, source_id)`): penjualan (angka sama dengan Keuangan: `sale_items` + alokasi),
   batal jual (jurnal balik), pengeluaran (+ batal), barang datang (Persediaan / Utang), bayar pemasok
   (Utang / Kas), stok masuk di luar Pembelian (stok pertama sebuah produk atau "Stok awal" = modal; berikutnya
   = kas), penyesuaian/opname/retur pemasok pada HPP saat itu.
3. **Seimbang dan append-only di database.** Trigger per statement menolak jurnal yang debit ≠ kredit; trigger
   menolak UPDATE untuk semua peran; tidak ada grant DELETE (hapus toko tetap jalan lewat cascade).
4. **Kapan diposting:** cron harian (`/api/cron/daily-rollup`) dan setiap kali pemilik membuka Keuangan › Neraca
   (hanya menambah yang baru). Angka di layar dari `journal_balances` + `src/core/ledger.ts` (BigInt, dites).
5. **Kejujuran angka:** Kas = arus yang tercatat di WADAR (saldo awal belum ada, bisa minus — ditulis di layar).
   Nilai stok di jurnal dibandingkan dengan stok × HPP rata-rata; selisih ≤ Rp0,5/unit = pembulatan.

## Konsekuensi
- Migrasi `journal` (setelah `purchasing`), diuji `supabase/tests/26_journal.sql` (rekonsiliasi dengan
  `fin_daily`). Sebelum diterapkan: tab Neraca menampilkan pemberitahuan, cron melewatinya.
- Toko demo 90 hari: ±3.000 jurnal dibukukan ±4 detik saat pertama dibuka.
- Belum: saldo awal kas, piutang marketplace (pencairan), PPN, tutup buku periode.
