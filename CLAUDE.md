# CLAUDE.md — WADAR

Instruksi proyek untuk Claude Code. Baca file ini di awal setiap sesi.

## Apa ini
WADAR (nama kerja) = asisten bisnis AI untuk UMKM Indonesia dengan 3 pilar:
1. **Keuangan Otomatis** — payment listener, ledger, dasbor untung riil untuk orang awam.
2. **Operasional Terpadu** — POS, stok, pesanan lintas kanal, CRM, pembelian.
3. **Asisten Chat Cerdas** — Business Brain dengan memori + kondisi bisnis realtime, untuk pemilik dan pembeli (WhatsApp).

Dokumen acuan (baca bagian relevan sebelum mengerjakan tugas):
- `docs/PRD.md` — apa & kenapa (ID fitur seperti F1.2, O2.1, A2.4 dipakai di commit/PR).
- `docs/ARCHITECTURE.md` — bagaimana (bounded context, event, data, AI, keamanan).
- `docs/BUILD-PLAN.md` — urutan milestone + Definition of Done.
- `docs/COMPETITORS.md` — acuan fitur/UX kompetitor: pola yang ditiru (U1–U12), anti-pola, dan usulan perubahan PRD (R1–R7).

## Stack
pnpm + Turborepo · Next.js 16 (web PWA) · Expo (mobile, v2) · NestJS 11 + Fastify (api, worker) · Drizzle ORM · Supabase (Postgres + pgvector, Auth, Realtime, Storage) · Redis + BullMQ · Vercel AI SDK · Zod · Vitest · Playwright · Testcontainers.

## Perintah
```bash
pnpm dev:up         # pintasan satu-perintah: .env + docker compose up --wait + db migrate + db grant + pnpm dev
pnpm dev            # web + api + worker (asumsi infra sudah nyala — dipanggil dev:up di atas)
pnpm dev:health     # monitoring cepat: /health/live & /health/ready api+worker, status docker compose, web
pnpm dev:logs       # tail log Postgres + Redis
pnpm dev:down       # matikan Postgres + Redis
pnpm test           # unit + integration
pnpm test:unit      # tanpa Docker
pnpm test:integration  # Testcontainers Postgres+Redis (butuh Docker), ATAU set WADAR_TEST_PG_ADMIN_URL + WADAR_TEST_REDIS_URL ke Postgres 16/Redis yang sudah jalan — pakai DB Redis terpisah (mis. redis://localhost:6379/5) kalau worker dev sedang jalan, kalau tidak worker dev ikut mengambil job tes
pnpm lint && pnpm typecheck && pnpm depcruise
pnpm db:generate    # drizzle migration dari schema, semua modul (role migrate: wadar)
pnpm db:migrate
pnpm db:push        # JANGAN dipakai: drizzle-kit push 0.31 bikin policy RLS dengan USING/WITH CHECK kosong (semua write ditolak) — pakai db:generate + db:migrate
pnpm db:grant       # grant akses role runtime wadar_app + FORCE RLS (idempoten, jalan lagi tiap migrasi)
pnpm --filter @wadar/web test:e2e     # Playwright — butuh stack lokal penuh + `supabase start`
pnpm --filter @wadar/web lighthouse   # Lighthouse CI mobile terhadap /masuk — butuh `pnpm dev` jalan
pnpm evals          # evaluasi AI (golden set) — placeholder no-op sampai M8
docker compose -f infra/docker-compose.yml up -d
npx supabase start  # Supabase Auth lokal (OTP email via Inbucket :54324, Google OAuth)
```
(Perbarui bagian ini jika perintah berubah.)

## Aturan Wajib (jangan dilanggar)
1. **Batas modul.** Kode di `modules/A` hanya boleh mengimpor `modules/B/public.ts`, `modules/platform/public.ts`, dan `packages/*`. Tidak ada query/JOIN ke tabel modul lain. Butuh data modul lain → port sinkron; butuh efek samping → event.
2. **Tenant di mana-mana.** Setiap tabel domain punya `tenant_id`; setiap query dijalankan dalam konteks tenant (`set_config('app.tenant_id')`). Setiap route baru harus tercakup tes isolasi tenant.
3. **Uang = BIGINT rupiah.** Tidak ada float untuk nominal. Format hanya di layer UI (`@wadar/core/money`).
4. **Transaksi append-only.** Order, pembayaran, jurnal, pergerakan stok tidak di-update/hapus; koreksi = entri pembalik/void dengan audit log.
5. **Event lewat outbox.** Tulis perubahan + baris outbox dalam satu transaksi. Semua handler idempoten (`processed_events`).
6. **Idempotency-Key** wajib untuk POST yang membuat transaksi.
7. **AI tidak akses DB langsung.** Kemampuan AI = tool bertipe (Zod) di `modules/brain/tools` yang memanggil port modul dengan cek izin. Aksi tulis = action proposal yang butuh persetujuan (kecuali aturan auto-approve eksplisit).
8. **Angka AI harus ter-grounding.** Jangan menonaktifkan guardrail numeric grounding atau filter data internal mode customer.
9. **Validasi semua input** dengan skema dari `packages/contracts`; kontrak API & event hanya didefinisikan di sana.
10. **Brand terpusat.** Nama produk, tagline, warna, copy brand hanya dari `packages/brand` — jangan hardcode "WADAR" di fitur.
11. **Rahasia** tidak pernah di-commit; tambahkan ke `.env.example` dengan nilai kosong.

## Konvensi
- Kode, nama variabel, komentar: **Bahasa Inggris**. Teks UI & pesan pengguna: **Bahasa Indonesia sehari-hari** (lihat PRD §4 — "Uang masuk", "Untung bersih", bukan istilah akuntansi).
- Struktur modul: `public.ts`, `domain/`, `application/`, `infra/`, `http/`, `db/schema.ts`.
- Nama event: `<module>.<aggregate>.<pastTenseVerb>` (mis. `sales.order.completed`), payload berversi.
- ID: UUIDv7. Waktu: `timestamptz`, zona waktu tenant untuk tampilan.
- Error API: RFC 7807 dengan `code` dan `correlationId`.
- Commit: `feat(sales): complete order with idempotency [O2.1]`.
- Tes: domain logic → unit; handler/port/DB → integration (Testcontainers); alur pengguna inti → Playwright.
- NestJS DI: **selalu `@Inject(Token)` eksplisit** untuk setiap parameter constructor (termasuk class seperti `Reflector`). `tsx` (dev) dan `tsup` (prod) pakai esbuild yang TIDAK meng-emit decorator metadata, jadi parameter tanpa `@Inject` jadi `undefined` di runtime — padahal di Vitest lolos.

## Cara Bekerja
- Mulai tugas besar dengan rencana (plan mode) yang menyebut file yang akan diubah dan tes yang akan ditulis; tunggu persetujuan.
- Periksa versi stabil terbaru pustaka sebelum memasang dependensi baru.
- Sebelum menyatakan selesai: jalankan lint, typecheck, test, depcruise; sebutkan hasilnya.
- Keputusan arsitektur baru → tulis ADR pendek di `docs/adr/`.
- Jika instruksi pengguna bertentangan dengan aturan wajib di atas, jelaskan konfliknya dan tawarkan alternatif — jangan diam-diam melanggar.

## Status
- Milestone saat ini: **M6 selesai — M2 s/d M6 dibangun dan diverifikasi sungguhan terhadap Postgres 16 + Redis nyata (bukan cuma mock); schema M2–M6 sudah ada di Supabase hosted. Berikutnya: M7 (lihat `docs/BUILD-PLAN.md`).** Web di Vercel, API di Railway; login email produksi masih terhambat SMTP (lihat Catatan terbuka) — sementara pakai mode demo.
- **Yang sekarang bisa dipakai end-to-end** (web + api + worker): daftar/masuk → buat toko → tambah produk (satu per satu dengan varian & foto, atau impor CSV/Excel 500 produk <30 dtk) → jual di **Kasir** (tunai/transfer/QRIS, scan barcode, struk publik bertanda tangan) → stok turun realtime → **QRIS** terbayar diumumkan di **Layar Kasir** (suara, terbilang) → pembukuan otomatis (double-entry) → **Keuangan** (ringkasan, untung per produk/kanal, uang masuk/keluar, dompet, catat pengeluaran) → **Beranda** (feed tindakan duluan: stok hampir habis + estimasi hari, HPP/foto belum lengkap; lalu 3 kartu uang + grafik 7 hari). Pesanan bisa dibatalkan (void, teraudit, pembalik stok + jurnal).
- **Modul per milestone**: M2 `catalog` + `inventory` (pergerakan stok append-only, HPP moving-average BigInt) · M3 `sales` (Idempotency-Key → 1 order, nomor harian, void, komisi kanal, struk HMAC ringkas ≤100 karakter) · M4 `finance` (bagan akun per tenant, 3 dompet default, trigger DB: entry wajib seimbang + jurnal append-only, P&L, pindah dana, koreksi saldo, kategori pengeluaran belajar dari catatan) · M5 `payments` (provider `simulator`/Xendit, webhook token timing-safe, rekonsiliasi 15 menit) + `notification` (SSE `GET /v1/events/stream` via Redis pub/sub — ADR-004) · M6 `insights` (agregat harian CQRS dari event `finance.entry.posted`/`sales.order.*`, rekonsiliasi agregat vs ledger tiap 6 jam → item feed kritis kalau beda) + forecast EWMA di `inventory`.
- **Verifikasi (dijalankan sungguhan)**: `pnpm lint` 18/18, `pnpm typecheck` 18/18, `pnpm depcruise` 0 pelanggaran (735 modul), `pnpm test:unit` hijau semua, **`pnpm test:integration` 12/12 paket** terhadap Postgres 16 + Redis lokal (platform 8, identity 7, apps/api M2–M6 40 tes — termasuk DoD: 500 produk impor, kunci ganda → 1 order, P&L = fixture hitung tangan, DB menolak entry tak seimbang/edit jurnal bahkan untuk role app, kartu Beranda = ledger, isolasi tenant tiap route tulis), `pnpm build` 3/3 (`next build` 22 route). Alur browser (Playwright + Chromium) per milestone di-screenshot: impor, kasir 3 item, QRIS LUNAS ±340 ms sampai Layar Kasir, Beranda mobile/desktop.
- **Bug nyata yang ketemu & diperbaiki selama M2–M6** (detail di pesan commit): `drizzle-kit push` 0.31 bikin policy RLS dengan USING/WITH CHECK kosong → pindah ke generate+migrate; tabel migrasi drizzle per modul (satu tabel bersama bikin migrasi modul lain terlewat); `PermissionGuard` `Reflector` undefined di tsx/tsup (esbuild tanpa decorator metadata) → `@Inject` eksplisit wajib; consumer crash saat redelivery → `processed_events` ON CONFLICT DO NOTHING; relay outbox macet selamanya kalau Redis mati → timeout publish 2 dtk; snapshot Idempotency-Key tenant non-uuid = unhandled rejection (bisa crash onboarding produksi); undangan selalu 400 (content-type JSON tanpa body); nomor struk >100 karakter kena 414 Fastify; SQLSTATE 42702 kolom ambigu di upsert agregat; Tailwind tidak men-scan `packages/ui-web` (kelas yang cuma dipakai di sana, mis. warna grafik, tidak pernah ter-generate) → `@source` di `theme.css`; `pnpm test:integration` lewat turbo diam-diam tidak menjalankan tes apa pun (env `WADAR_TEST_*` disaring strict env mode turbo + filter glob tidak cocok file di `apps/api/src/`) — sekarang benar-benar jalan; fungsi trigger ledger `search_path` mutable (advisor Supabase) → dipin.
- **Supabase hosted** (`kuerbreijqcdvmxvvkxh`): schema `catalog`, `inventory`, `sales`, `finance` (+trigger ledger, +search_path), `payments`, `insights` diterapkan lewat `apply_migration` (isi file migrasi drizzle apa adanya), grant `wadar_app` + `FORCE ROW LEVEL SECURITY`. Diverifikasi: tanda tangan struktur (tabel, kolom, flag RLS/FORCE, grant `wadar_app`, policy, index, trigger) **identik md5** dengan DB lokal yang lulus semua tes integrasi. Tabel tracking drizzle (`drizzle.__drizzle_migrations_<modul>`) di-seed dengan hash file yang sama, jadi `DATABASE_MIGRATE_URL=<hosted> pnpm db:migrate` nanti cuma menerapkan migrasi baru. Di hosted, role migrate = `postgres` (tidak ada role `wadar`) — `pnpm db:grant` (yang memakai `FOR ROLE wadar`) belum cocok dipakai langsung ke hosted; pakai versi `FOR ROLE postgres` (lihat migrasi hosted `grant_wadar_app_and_force_rls_m2_m6`). Advisor keamanan tinggal "leaked password protection" (toggle dashboard Auth; app pakai OTP/Google, bukan password).
- **Diketahui, belum diperbaiki**: tabel `platform` (`outbox`, `audit_log`, `idempotency_keys`, `processed_events`, dll.) belum RLS (`identity.tenants` sengaja tanpa policy: ia akar tenant itu sendiri) — relay outbox & job terjadwal memang membaca lintas tenant, jadi perlu desain (mis. role/policy khusus relay) sebelum ditambal. Tenant yang sudah punya transaksi SEBELUM modul `insights` ada tidak punya agregat historis (rekonsiliasi akan melapor beda) — belum ada perintah backfill; hosted belum punya data jadi tidak terdampak. Saat deploy bergulir, worker lama tidak mengenal consumer baru — deploy worker baru bersamaan/sebelum api supaya event tidak diproses tanpa consumer baru.
- **Awas force-push dari Antigravity (Gemini)**: branch `claude/happy-tesla-5r0zs0` sudah 3× di-force-push dari Antigravity (27 Sep: `73e3b1a`, `eaa00c2`, `4a59173`) di atas commit lama, sehingga seluruh riwayat M2–M6 hilang dari GitHub (dan Vercel men-deploy versi tanpa M2–M6) sampai di-merge ulang. Sebelum push: `git fetch` lalu cek `git merge-base --is-ancestor <commit-terakhir-kita> origin/<branch>`; kalau hilang, **merge** (jangan force-push balik). Solusi permanen: Antigravity wajib `git pull` sebelum push & tanpa `--force`, atau kerja di branch sendiri lalu di-merge.
- Catatan terbuka:
  - **Login di produksi (dicek dari log Auth Supabase hosted, 27 Sep)**: OTP email gagal 500 karena SMTP kustom = Resend mode uji ("You can only send testing emails to your own email address") → verifikasi domain di resend.com/domains + ganti alamat pengirim ke domain itu (Supabase › Authentication › Emails › SMTP). Google gagal "provider is not enabled" → isi Client ID/Secret Google di Supabase › Authentication › Sign In / Providers. Halaman masuk/daftar sekarang membaca `/auth/v1/settings` dan menyembunyikan Google/No. HP kalau belum aktif, dan error email tampil dalam bahasa awam.
  - **Masuk Admin** (`/masuk/admin`, link dari `/masuk`): email + kata sandi (`signInWithPassword`), tidak butuh kirim email; "Lupa kata sandi?" → email reset → `/auth/callback` → `/masuk/sandi-baru` (juga dari menu akun "Ganti kata sandi"). Setelah masuk lewat cara apa pun, `/onboarding` memanggil `GET /v1/tenants/mine` dan langsung membuka toko yang sudah ada (1 toko) atau menampilkan "Pilih toko" (>1) — sebelumnya pemilik di perangkat baru cuma bisa bikin toko baru. `tenants/mine` lewat policy RLS sempit `own_membership_lookup` (SELECT saja, hanya baris milik user dari JWT; migrasi identity `0001`, sudah diterapkan di hosted). `/auth/callback` sekarang menolak `next` lintas situs (open redirect).
  - **Mode demo** ("Coba demo tanpa daftar" di `/masuk`, `/daftar`, landing): user anonim Supabase (`signInAnonymously`) → toko contoh dibuat lewat API publik biasa (`apps/web/src/lib/demo.ts`: 5 produk, 5 penjualan termasuk kanal WhatsApp, 1 pengeluaran) → Beranda, dengan banner "Mode demo" + "Keluar demo". **Butuh "Allow anonymous sign-ins" dinyalakan** di Supabase hosted (Authentication › Sign In / Providers); `supabase/config.toml` lokal sudah `enable_anonymous_sign_ins = true`. Batas bawaan 30 sign-in anonim/jam/IP; sebelum publik luas pertimbangkan CAPTCHA/Turnstile + pembersihan berkala (`delete from auth.users where is_anonymous and created_at < now() - interval '30 days'` — toko demo-nya ikut tertinggal, perlu pembersihan tenant juga).
  - **Latensi pindah menu (diukur 27 Sep)**: penyebab utamanya lokasi, bukan penyedia hosting — Vercel functions di `iad1` (AS), Supabase di Singapura, API Railway juga bukan di Singapura (lag publish outbox p50 2,7 dtk & event end-to-end 2–6 dtk di produksi vs <0,4 dtk lokal ⇒ ±100–200 ms per round trip DB). Satu klik menu = ±22 round trip DB berurutan (gelombang `getAppContext` lalu data halaman; mis. `/v1/insights/home` 14 round trip) ⇒ ±4–5 dtk. Perbaikan: `apps/web/vercel.json` `regions: ["sin1"]` + **pindahkan service Railway api, worker, dan Redis ke region Southeast Asia (Singapore)** (harus dari dashboard Railway). `(app)/loading.tsx` menampilkan kerangka halaman ±65 ms setelah klik (build produksi, diuji dengan latensi simulasi 1,5 dtk). Tidak perlu pindah penuh ke Railway.
  - **Railway (project `outstanding-commitment`)**: sampai 30 Sep `@wadar/api`, `@wadar/worker`, Redis semuanya di `sfo` (AS) — itulah sumber ±2 dtk per request (p50 API 2.087 ms). **30 Sep ±15:10 UTC api + worker dipindah ke Singapura (`asia-southeast1-eqsg3a`)** atas persetujuan pengguna; diukur dari log network-flow Railway: worker↔Postgres (pooler Supabase Singapura) **1–2 ms** (sebelumnya ±160 ms). **Redis belum benar-benar pindah**: config region-nya sudah Singapura tapi volume-nya masih `sfo`, jadi api/worker↔Redis masih ±180–215 ms — tidak memperlambat buka halaman (request halaman cuma ke DB), tapi memperlambat event (stok/pembukuan/Beranda ter-update setelah jual, pengumuman QRIS di Layar Kasir) → selesaikan migrasi volume Redis dari dashboard. Watch pattern api/worker hanya `/apps/api/**` & `/apps/worker/**`, jadi perubahan di `modules/**`/`packages/**` TIDAK memicu redeploy (deploy yang jalan masih commit `833382b` 27 Sep — belum berisi `tenants/mine`, cache membership, `getHome` paralel, perbaikan kategori katalog) → tambahkan `/modules/**` & `/packages/**` ke watch patterns lalu redeploy. Project `generous-cooperation` (impor 12 service tak sengaja) sudah dihapus pengguna.
  - **Optimasi latensi di kode (30 Sep)**, diukur dengan proxy yang menambah ±160 ms RTT ke DB (setara sfo↔Singapura): satu tap Beranda 4.072 → 979 ms; `/v1/insights/home` 2.773 → 984 ms; `/v1/memberships/me` 653 → 2 ms. Caranya: cache membership 15 dtk (positif saja, dihapus saat ubah peran) di `TenantGuard`; `getHome` dipecah jadi 4 transaksi paralel; halaman Beranda/Kasir/Stok memulai request datanya paralel dengan `getAppContext` (`getAppContextWith`, pakai cookie outlet). Tanpa jarak (API satu region dengan DB) tap yang sama 11 ms.
  - **API sudah di Railway** (`https://wadarapi-production.up.railway.app`, `NEXT_PUBLIC_API_URL` di Vercel sudah diisi). Pastikan `apps/worker` juga jalan di Railway (tanpa worker: stok, pembukuan, Beranda tidak ter-update). Env API/worker: `DATABASE_URL` (role `wadar_app` ke Supabase hosted), `REDIS_URL`, `CORS_ALLOWED_ORIGINS` (domain Vercel), `SUPABASE_URL`, `SUPABASE_JWT_MODE`/`SUPABASE_JWKS_URL`; opsional tapi disarankan: `SUPABASE_SERVICE_ROLE_KEY` (foto produk — bucket privat dibuat otomatis), `RECEIPT_SIGNING_SECRET` (fallback: turunan `DATABASE_URL`), `PAYMENTS_PROVIDER` (`simulator` default; `xendit` + `XENDIT_SECRET_KEY`/`XENDIT_CALLBACK_TOKEN` untuk QRIS sungguhan).
  - Volume Postgres lama (dibuat sebelum M1) tidak otomatis dapat role `wadar_app` — lihat `infra/postgres-init/README.md` untuk cara migrasi manual.
  - OTP nomor HP: UI/alur lengkap dibangun, provider SMS Supabase sengaja dikosongkan (keputusan disetujui pengguna) — verifikasi manual menyusul begitu ada akun provider SMS.
  - Tidak ada pengiriman undangan otomatis (email/WA) — pemilik menyalin link secara manual untuk sekarang.
  - Nama brand "WADAR" dipakai penuh untuk build; keputusan final sebelum peluncuran v1 (PRD §14.1).
  - Validasi skema sub-akun Xendit (xenPlatform) sebelum menerima uang pengguna sungguhan — M5 jalan dengan provider `simulator`/Xendit test mode (lihat `modules/payments/README.md`).
  - **Validasi unit economics** sebelum M8/M9: hitung biaya nyata (harga token LLM per model, biaya percakapan WhatsApp Cloud API) vs kuota paket di PRD §9 (Growth: 150 pertanyaan asisten + 1.000 percakapan chat = Rp199rb; target biaya AI+WA ≤15% ARPU di PRD §10). Kalau kuota kebesaran, turunkan sebelum janji ke pengguna pilot.
  - Model harga B2B2B (PRD §14.2 no.4) masih terbuka, tidak menghambat MVP/pilot.
  - Trigger upgrade TypeScript 7: cek rilis `typescript-eslint` yang menutup issue #12518 (bukan sekadar TS 7.1 tersedia).
  - Trigger upgrade NestJS 12: tunggu ekosistem (terutama `@sentry/nestjs`) rilis dukungan resmi, bukan cuma `nestjs-zod` (yang sudah tidak dipakai — lihat ADR-001).
  - Kalau `@base-ui-components/react` rilis stabil (bukan lagi `-rc`), evaluasi ulang migrasi dari `radix-ui` di `packages/ui-web` (lihat ADR-003).

### Riwayat milestone
- **M1** (selesai) — modul `identity` (tenants+timezone, outlets, memberships, roles, invitations) dengan RLS Postgres nyata via pemisahan role `wadar`/`wadar_app` (ADR-002) + `FORCE RLS`; `SupabaseJwtGuard`→`TenantGuard`→`PermissionGuard` (RBAC 5 peran); generator tes isolasi tenant (`@TenantScoped()` + registry write-case); `Rfc7807Filter`; `packages/ui-web` (Tailwind v4 + `radix-ui`, ADR-003); shell web (masuk OTP/Google, onboarding, nav terfilter peran, pengaturan toko & tim, undangan). Lighthouse `/masuk` 91/95/96/91. Bug yang ketemu: regex 2 rule depcruise M0, resolusi `.js` Turbopack (→ subpath export eksplisit), `pnpm build` butuh `NEXT_PUBLIC_*` saat build (CI & Vercel), drizzle-kit decorator lintas modul (→ jalankan dari root), loop FORCE RLS kena tabel `auth.*` di hosted. Tes integrasi M1 kini sudah dijalankan sungguhan (lihat Status); E2E Playwright M1 (`test:e2e`, butuh `supabase start`) dan CI GitHub Actions versi baru masih perlu dikonfirmasi di CI.
- **M0** (selesai) — fondasi monorepo, modul `platform` (outbox+relay, idempotent consumer, health checks), `dependency-cruiser`, CI, ADR-001. Diverifikasi sungguhan: lint/typecheck 8/8, 22 tes unit, depcruise 164 modul/0 pelanggaran, build 3/3, `pnpm dev` benar-benar menyalakan web+api+worker. 4 bug nyata ketemu & diperbaiki (queue name BullMQ, crash outbox-relay saat DB down, resolusi tsconfig tsx lintas-paket, `/health/ready` nge-hang 30+ detik) — detail lengkap ada di riwayat git (commit `81bd8ce`..`3267a54`).
