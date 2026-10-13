# ADR-004 — Realtime lewat SSE di apps/api + Redis pub/sub (bukan Supabase Realtime)

- Status: diterima (M5)
- Konteks: ARCHITECTURE §6.3 merencanakan Supabase Realtime *broadcast* channel privat `tenant:{id}` dengan otorisasi via RLS di `realtime.messages`.

## Masalah
1. Otorisasi channel privat Supabase butuh policy di `realtime.messages` yang mengecek membership. Tabel `identity.memberships` kita memakai RLS ketat (`current_setting('app.tenant_id')` tanpa `missing_ok`, FORCE RLS) — policy Realtime (jalan sebagai role `authenticated` tanpa `app.tenant_id`) harus lewat fungsi SECURITY DEFINER yang melonggarkan RLS itu. Menambah jalur baca kedua ke data membership di luar API = permukaan serangan baru.
2. Tidak bisa diuji otomatis tanpa Supabase lengkap (lokal maupun CI), padahal DoD M5 menuntut "LUNAS + suara ≤ 3 detik tanpa refresh" terbukti.
3. Worker tetap perlu kredensial service role Supabase untuk broadcast — satu rahasia lagi di Railway.

## Keputusan
- Worker memublikasikan pesan ke Redis pub/sub `realtime:tenant:{tenantId}` (`RealtimeBroker` di `modules/platform`) — dari consumer `notification` yang mendengarkan event domain.
- `apps/api` menyediakan `GET /v1/events/stream` (Server-Sent Events). Otentikasi & tenant pakai guard yang sama dengan semua route (`SupabaseJwtGuard` → `TenantGuard`), jadi isolasi tenant = aturan yang sama dengan REST.
- Web membuka stream dengan `fetch` + `ReadableStream` (bukan `EventSource`) supaya token tetap di header `Authorization`, tidak di URL/log. Reconnect dengan backoff; saat terputus, layar yang kritis (QRIS di Kasir) juga polling status intent tiap 3 detik (ARCHITECTURE §8).

## Konsekuensi
- (+) Diuji end-to-end di tes integrasi (stream HTTP sungguhan, isolasi tenant, header CORS).
- (+) Tidak ada rahasia/policy tambahan di Supabase; Redis sudah ada (BullMQ).
- (−) Setiap klien memegang 1 koneksi HTTP panjang ke api. Untuk skala MVP (≤1.000 toko) aman; heartbeat 20 dtk menjaga koneksi melewati proxy. Jika jumlah koneksi jadi masalah, pindahkan endpoint stream ke service terpisah (pola ekstraksi §12.1) atau kembali ke Supabase Realtime dengan fungsi otorisasi khusus.
- (−) Pesan bersifat *at-least-once* (consumer bisa di-retry) — klien men-dedupe berdasarkan id (`paymentId`, `orderId`).
