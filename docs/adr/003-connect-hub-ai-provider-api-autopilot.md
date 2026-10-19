# ADR-003 — Pusat Koneksi: Otak AI sendiri, API WADAR, Autopilot

- Status: diterima (19 Okt 2026)
- Konteks: permintaan pengguna "semua otomatis, auto agent, auto integrated; beri endpoint + API key". Diputuskan
  dua tahap: tahap 1 sebelum demo 24 Okt, tahap 2 sesudahnya (`docs/ARCHITECTURE-V2.md`).

## Keputusan

1. **Otak AI per toko (OpenAI-compatible).** Pemilik mengisi base URL + nama model + API key. Kunci dienkripsi
   AES-256-GCM di server (`src/lib/secret-box.ts`; kunci dari `WADAR_ENCRYPTION_KEY`, atau diturunkan HKDF dari
   `SUPABASE_SERVICE_ROLE_KEY`). Kolom ciphertext tidak di-grant ke `authenticated`; hanya service role yang
   membacanya. Simpan hanya setelah **tes koneksi** berhasil. Rute: model toko → Gemini → templat offline.
   Base URL wajib https dan bukan host internal/IP (cegah SSRF). Embedding tetap Gemini (768 dimensi).
2. **API WADAR.** Kunci `wdr_<prefix>_<rahasia>`, hanya hash SHA-256 yang disimpan, ditampilkan sekali, bisa
   dicabut, dengan scope. Panggilan tulis berjalan **atas nama pemilik pembuat kunci** (`app.act_as_api_key` mengisi
   `request.jwt.claims` di dalam transaksi), jadi semua cek peran, RLS, dan audit berlaku tanpa jalur khusus. Kunci
   milik orang yang sudah bukan pemilik otomatis ditolak. Endpoint: `/api/v1/messages` (POST/GET),
   `/api/v1/orders`, `/api/v1/products`, `/api/v1/summary`.
3. **Kanal chat luar lewat API dulu.** Bot WhatsApp/Telegram meneruskan pesan ke `/api/v1/messages`, yang memakai
   pipeline yang sama dengan widget (`handleWidgetMessage`, kanal `whatsapp|telegram|api`). Konektor resmi
   (ADR-002 `ChannelAdapter`) di tahap 2.
4. **Autopilot berbasis aturan, bukan LLM.** `src/core/agent.ts` membuat draf (pesan ulang dari prakiraan stok,
   usulan FAQ dari chat yang dioper karena data tidak ada). Draf yang alasannya hilang ditutup sendiri. Pemilik
   menyelesaikan dengan satu ketuk; menutup tugas tercatat di audit. Sakelar "AI membalas chat" independen dari
   sakelar utama Autopilot. Batas nominal auto-kirim menunggu modul Pembelian.

## Konsekuensi

- Migrasi `connect_hub` (tabel `ai_providers`, `api_keys`, `agent_settings`, `agent_tasks`; aditif) dan
  `conversation_channels` (perluasan CHECK `conversations.channel`; dipisah karena DROP CONSTRAINT perlu konfirmasi
  manusia di hosted). Diuji `supabase/tests/23_connect_hub.sql`. Selama perluasan belum ada, kanal telegram/api di
  `/api/v1/messages` dijawab 503 `channel_pending`; kanal whatsapp tetap jalan.
- Cron baru `/api/cron/agent` (06.00 WIB). `/api/v1/` publik di `src/proxy.ts`; setiap route memeriksa kuncinya.
- Merotasi `SUPABASE_SERVICE_ROLE_KEY` tanpa `WADAR_ENCRYPTION_KEY` membuat kunci AI tersimpan tak terbaca: toko
  kembali ke AI bawaan dan pemilik mengisi ulang. Set `WADAR_ENCRYPTION_KEY` sebelum rotasi.
- Cek SSRF berbasis nama host; DNS rebinding belum ditutup (risiko rendah: hanya pemilik yang mengisi URL).
