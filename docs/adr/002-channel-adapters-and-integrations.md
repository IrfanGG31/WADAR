# ADR-002 — Kanal chat lewat adapter, integrasi disiapkan sebelum disambung

- Status: diterima (19 Okt 2026)
- Konteks: Tahap A (review PRD vs proposal), keputusan pengguna: integrasi WhatsApp/Telegram ditunda, fondasi fungsional dulu.

## Konteks
Asisten chat sekarang hanya lewat widget web (`/w/<slug>`). PRD menjanjikan WhatsApp (dan pengguna menambah Telegram). Menyambung API pihak ketiga (Meta WhatsApp Cloud API: verifikasi bisnis, template, biaya percakapan; Telegram Bot API) butuh akun, rahasia, dan keputusan biaya yang belum ada.

## Keputusan
- Semua kanal chat memakai satu bentuk: `ChannelAdapter` di `src/core/channels/adapter.ts` dengan tiga langkah — `verifyWebhook` (handshake/tanda tangan, timing-safe), `parseInbound` (payload penyedia → `InboundMessage` ternormalisasi), `sendText`. Pesan masuk lalu diproses alur yang sama dengan widget (simpan, rate limit, `runTurn`, guardrail, inbox, eskalasi). Guardrail dan retrieval tidak pernah tahu kanal asalnya.
- Sampai sambungan dibangun, `CHANNEL_ADAPTERS` berisi `NotConnectedAdapter` yang menolak semua webhook dan pengiriman.
- Halaman Pengaturan › Integrasi membaca daftar `INTEGRATIONS` (`src/core/channels/integrations.ts`): status (Aktif / Lewat file / Belum terhubung) dan isian yang nanti dibutuhkan. Isian ditampilkan non-aktif; **belum ada rahasia yang disimpan**.
- Marketplace jalan dulu lewat impor file Seller Center (IMP-1..3), dengan dedupe per nomor pesanan sehingga sinkron API nanti bisa memakai RPC yang sama (`import_marketplace_orders`).

## Konsekuensi
- Menyambung WhatsApp nanti = adapter `whatsapp` + route `POST/GET /api/channels/whatsapp/[slug]` + penyimpanan rahasia per toko (Supabase Vault atau kolom terenkripsi, dibaca service role saja) + idempotensi `externalMessageId`. Tidak ada perubahan di pipeline chat.
- Sebelum menyimpan rahasia apa pun: putuskan tempat simpan (Vault) dan rotasi; jangan pernah di tabel yang terbaca RLS anggota.
- Biaya percakapan WhatsApp harus divalidasi terhadap kuota paket (lihat catatan unit economics) sebelum kanal dibuka untuk pengguna.
