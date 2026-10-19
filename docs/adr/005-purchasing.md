# ADR-005 — Pembelian: pemasok, pesanan pembelian, terima barang, bayar

- Status: diterima (19 Okt 2026)
- Konteks: tahap 2 ADR-003. Autopilot sudah menyiapkan "pesan ulang" per produk, tapi tidak ada dokumen yang
  mengikat pesanan → barang datang → modal → utang ke pemasok. Pola Odoo Purchase, dipangkas untuk UMKM.

## Keputusan

1. **Dokumen dan pemiliknya.** `suppliers` (nama + WhatsApp), `purchase_orders` + `purchase_order_lines`
   (draf → dipesan → datang sebagian → diterima, atau batal), `purchase_receipts` (satu "Terima barang" = satu
   dokumen, idempoten), `purchase_payments` (append-only). Nomor `PO-YYMM-0001` per toko (`doc_counters`).
2. **Pesanan tidak menyentuh stok atau uang.** Yang menggerakkan stok hanya penerimaan: per baris satu
   `stock_movements` kind `purchase` dengan `ref_type='purchase_order'`, HPP rata-rata dihitung sama persis
   dengan "Stok masuk" (`app.weighted_avg_cost`). Harga di nota boleh beda dengan harga pesanan.
3. **Pemasok dipelajari, bukan disetel.** `supplier_products` diisi otomatis saat barang diterima (pemasok
   terakhir + harga terakhir per produk). Tidak ada langkah "atur pemasok per produk".
4. **Autopilot (aturan, tanpa LLM).** Produk yang perlu restock dan belum ada di pesanan terbuka dikelompokkan
   per pemasok terakhirnya menjadi draf PO (`src/core/purchasing.ts` `planPurchaseDrafts`); produk yang sudah
   dipesan tidak disarankan lagi. Draf boleh **disetujui sendiri** hanya jika ada pemasok dan total ≤ batas
   pemilik (`agent_settings.po_auto_limit`, 0 = tidak pernah). Batas dicek ulang di SQL (`order_purchase_order`
   tanpa user = server), jadi bug di aplikasi tidak bisa melewati batas. Tiap draf menjadi tugas "Setujui
   pesanan ke …" yang tertutup sendiri saat disetujui/dibatalkan.
5. **Peran.** Pemilik: pemasok, buat/ubah/setujui/batalkan, bayar (izin `purchase`). Kasir: melihat pesanan dan
   **menerima barang** (izin `stock_in`, sama seperti Stok masuk), tanpa angka uang di layar.
6. **Uang.** Integer rupiah; total di SQL (`sum(qty::bigint * unit_cost)`) dan `sumLines` (BigInt) di core.
   Tagihan = nilai barang yang datang (atau total pesanan bila bayar di muka); lebih bayar ditampilkan sebagai
   saldo di pemasok. Kirim pesanan = tautan WhatsApp berisi rincian (pemilik yang menekan kirim): WhatsApp Cloud
   API butuh pesan template untuk memulai chat dengan pemasok.

## Konsekuensi

- Migrasi `purchasing` (setelah `connect_hub`: menambah kolom `agent_settings.auto_po`, `po_auto_limit`). Diuji
  `supabase/tests/25_purchasing.sql`. Sebelum diterapkan: tab Pembelian menampilkan pemberitahuan, Autopilot
  tetap membuat tugas pesan ulang per produk seperti sebelumnya.
- Jurnal double-entry (ADR-006) membaca `purchase_receipts` (Persediaan / Utang usaha) dan `purchase_payments`
  (Utang usaha / Kas).
- Belum: retur ke pemasok, beberapa pembayaran dengan bukti foto, PO dalam satuan kemasan (pack) yang berbeda
  dengan satuan jual.
