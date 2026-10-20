# ADR-007 — Event outbox dan webhook keluar

- Status: diterima (20 Okt 2026)
- Konteks: tahap 2 ADR-003. Aplikasi luar (n8n, Make, Zapier, server sendiri) perlu tahu saat sesuatu terjadi
  di WADAR tanpa terus menanyai API.

## Keputusan
1. **Outbox di transaksi yang sama.** Trigger menulis `outbox_events` saat penjualan dibuat/dibatalkan, barang
   dari pemasok datang, dan chat dioper ke pemilik. Penjualan yang gagal (rollback) tidak meninggalkan event.
   Event hanya ditulis kalau ada webhook yang berlangganan; isinya id dan total, tidak pernah HPP.
2. **Pengiriman.** `dispatchWebhooks` (service role): event dibagi ke endpoint (`webhook_deliveries`), dikirim
   POST JSON, timeout 5 detik, tanpa mengikuti redirect. Gagal → coba lagi 1 m, 5 m, 30 m, 2 j, 12 j, lalu
   berhenti. Dipanggil lewat `after()` saat penjualan/batal/terima barang/pesanan API/eskalasi chat, dan cron
   harian sebagai susulan.
3. **Tanda tangan** gaya Stripe: `X-Wadar-Signature: t=<unix>,v1=<HMAC-SHA256(rahasia, "t.body")>`; juga
   `X-Wadar-Event` dan `X-Wadar-Delivery`. Rahasia `whsec_…` ditampilkan sekali dan disimpan terenkripsi.
4. **Keamanan.** Hanya https dan bukan host internal/IP; maksimal 5 endpoint per toko; hanya pemilik.

## Konsekuensi
- Migrasi `webhooks` (setelah `journal`), diuji `supabase/tests/27_webhooks.sql`. Sebelum diterapkan: bagian
  Webhook keluar tidak tampil, penjualan berjalan biasa.
- Vercel Hobby hanya punya cron harian: retry yang jatuh tempo menunggu kejadian berikutnya di toko itu atau
  cron pagi. Kalau butuh lebih cepat: cron per jam (paket Pro) memanggil `dispatchWebhooks`.
- Cek host berbasis nama (DNS rebinding belum ditutup), sama seperti ADR-003.
