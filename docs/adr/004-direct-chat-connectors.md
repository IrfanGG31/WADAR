# ADR-004 — Konektor chat langsung: bot Telegram dan WhatsApp Cloud API

- Status: diterima (19 Okt 2026)
- Konteks: tahap 2 Pusat Koneksi (ADR-003). Pengguna minta "semua otomatis, tanpa langkah manual": tempel kunci,
  WADAR yang menyambungkan. Sebelumnya kanal luar hanya lewat bot perantara yang memanggil `/api/v1/messages`.

## Keputusan

1. **Satu bentuk adapter (ADR-002) untuk dua kanal.** `src/core/channels/telegram.ts` dan `whatsapp.ts`
   mengimplementasikan `ChannelAdapter` (`verifyWebhook`, `parseInbound`, `sendText`), fetch bisa disuntik untuk tes.
   Pesan masuk diproses `handleWidgetMessage` yang sama dengan widget: guardrail, retrieval, eskalasi, inbox tidak
   tahu kanal asalnya.
2. **Penyambungan otomatis.**
   - Telegram: pemilik menempel token @BotFather → `getMe` → simpan terenkripsi → `setWebhook` ke
     `/api/channels/telegram/<id>` dengan `secret_token` acak (dicek di header `X-Telegram-Bot-Api-Secret-Token`).
     Hanya chat pribadi; grup diabaikan.
   - WhatsApp: pemilik mengisi Phone number ID, WABA ID, App ID, App secret, access token permanen → cek nomor →
     simpan terenkripsi → WADAR mendaftarkan webhook-nya sendiri (`POST /{app-id}/subscriptions`, Meta memanggil GET
     handshake saat itu juga) → `POST /{waba-id}/subscribed_apps`. Setiap POST dari Meta dicek
     `X-Hub-Signature-256` (HMAC app secret). Pesan untuk nomor lain di app yang sama diabaikan. Kalau otomatis gagal,
     halaman menampilkan Callback URL + verify token untuk diisi manual.
3. **Rahasia.** Satu kolom `channel_connections.secret_cipher` (JSON tersegel AES-256-GCM, `src/lib/secret-box.ts`),
   tidak di-grant ke `authenticated`; hanya service role yang membaca. Satu bot/nomor hanya untuk satu toko (indeks
   unik `kind + settings.account_id`).
4. **Webhook menjawab 200 seketika**, lalu pipeline berjalan di `after()`. Retry dari penyedia aman karena pesan
   disimpan sekali (`provider_message_id`). Rate limit kanal relay memakai bucket per pembeli + per toko, bukan per IP
   (semua pesan datang dari IP penyedia).
5. **Balasan keluar dicatat.** Jawaban AI dan balasan pemilik dari inbox dikirim oleh WADAR ke kanal asal
   (`conversations.connection_id`), dicoba ulang sekali bila penyedia minta, dan hasilnya disimpan di
   `message_deliveries`. Inbox menampilkan "Belum terkirim" + tombol **Kirim ulang**. Chat konektor tidak lagi muncul
   di `GET /api/v1/messages` (bot API tidak ikut mengirim).
6. **CRM.** Nama pembeli dari Telegram/WhatsApp disimpan di `conversations.display_name`. Chat WhatsApp otomatis
   ditautkan ke pelanggan yang nomornya sudah ada (tidak membuat pelanggan baru: chat bukan pembelian).

## Konsekuensi

- Migrasi `channel_connectors` (setelah `conversation_channels`): tabel `channel_connections`,
  `message_deliveries`, kolom `conversations.connection_id`/`display_name`, view `inbox_conversations` bertambah dua
  kolom. Diuji `supabase/tests/24_channel_connectors.sql`. Sebelum diterapkan: inbox dan API jalan seperti biasa,
  Pusat Koneksi menampilkan pemberitahuan.
- Webhook butuh domain https publik: menyambungkan dari localhost ditolak dengan pesan jelas.
- WhatsApp: balasan bebas hanya dalam 24 jam sejak pesan terakhir pembeli (kode 131047, ditampilkan apa adanya).
  Pesan template dan biaya percakapan Meta belum ditangani; kuota paket WADAR belum menghitung kanal ini.
- Belum: media (foto/suara dijawab "baru bisa membaca teks"), grup Telegram, beberapa nomor WhatsApp per toko.
