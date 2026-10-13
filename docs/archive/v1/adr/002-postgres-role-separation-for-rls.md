# ADR-002 — Peran Postgres terpisah untuk migrasi vs. runtime (RLS)

| Meta | Isi |
|---|---|
| Status | Diterima |
| Tanggal | 19 September 2026 |
| Konteks milestone | M1 |

## Konteks

M1 mengimplementasikan isolasi data antar-tenant lewat Postgres Row-Level
Security (RLS) — CLAUDE.md aturan #2, `docs/ARCHITECTURE.md` §5.1: setiap
tabel domain punya `tenant_id`, kebijakan RLS `tenant_id =
current_setting('app.tenant_id')::uuid`.

Review desain M1 (sebelum kode ditulis) menemukan: `infra/docker-compose.yml`
M0 membuat user `wadar` lewat `POSTGRES_USER` image resmi Postgres —
user ini otomatis jadi **cluster superuser**, dan karena `drizzle-kit
push`/`migrate` juga jalan sebagai `wadar`, dia juga jadi **owner** setiap
tabel yang dibuat. Postgres punya aturan tegas: superuser dan owner tabel
**selalu bypass RLS**, apa pun kebijakan yang didefinisikan
(`ENABLE ROW LEVEL SECURITY` maupun `FORCE ROW LEVEL SECURITY` sekalipun,
untuk kasus superuser). Kalau `apps/api`/`apps/worker` connect sebagai
`wadar` di runtime (seperti M0 apa adanya), seluruh RLS yang dibangun M1
tidak akan punya efek sama sekali — bukan bug yang kelihatan lewat
lint/typecheck/test standar, karena query tetap "jalan benar" (kelihatan
mengembalikan data yang benar) selama tidak ada test yang secara eksplisit
mencoba membaca data tenant lain.

## Keputusan

Dua role Postgres terpisah, dua connection string terpisah:

- **`wadar`** (existing) — cuma untuk migrasi. `DATABASE_MIGRATE_URL`.
  Dipakai `drizzle-kit push`/`generate`/`migrate` (`pnpm db:generate`,
  `pnpm db:migrate`, `pnpm db:push`). Tidak pernah dibaca `apps/api`/`apps/worker`.
- **`wadar_app`** (baru) — non-superuser, `NOBYPASSRLS`, bukan owner tabel
  apa pun, cuma dikasih `GRANT SELECT, INSERT, UPDATE, DELETE` per skema
  lewat `infra/postgres-init/02-grant-and-force-rls.sql` (dijalankan
  `pnpm db:grant`, idempoten, agnostik nama skema — lihat komentar di file
  itu). Dipakai runtime `apps/api`/`apps/worker` lewat `DATABASE_URL`
  (di-inject ke `PlatformModule.forRoot()`, jadi satu-satunya connection
  pool untuk seluruh proses — semua modul, termasuk `identity`, memakai
  `PLATFORM_DB` yang sama, bukan pool terpisah per modul).
- Lapis kedua: **`FORCE ROW LEVEL SECURITY`** (bukan cuma `ENABLE`) di
  setiap tabel yang RLS-nya aktif — supaya kalaupun suatu saat ada bug yang
  bikin tabel dimiliki role lain, kebijakan tetap berlaku (kecuali dia
  superuser). Drizzle ORM (versi terpasang) belum punya API skema untuk
  `FORCE`, jadi diterapkan lewat SQL generik di
  `infra/postgres-init/02-grant-and-force-rls.sql` (loop semua tabel
  `relrowsecurity = true`), bukan di-hardcode per tabel.

Berlaku juga untuk migrasi ke Supabase hosted nanti — connection string
`postgres` bawaan Supabase juga biasanya superuser/owner; pemisahan role
yang sama tetap perlu diterapkan di sana, bukan cuma soal self-hosted.

## Konsekuensi

- `.env.example` sekarang punya `DATABASE_URL` (role `wadar_app`) DAN
  `DATABASE_MIGRATE_URL` (role `wadar`) — dua nilai berbeda, jangan disamakan.
- Volume Postgres lama (pra-M1) tidak otomatis dapat role `wadar_app` —
  script init cuma jalan sekali di volume baru. Lihat
  `infra/postgres-init/README.md`.
- `pnpm dev:up` sekarang menjalankan `pnpm db:push` lalu `pnpm db:grant`
  berurutan (bukan cuma push saja seperti M0).
- Modul manapun setelah `identity` yang menambah tabel ber-tenant otomatis
  ke-cover `02-grant-and-force-rls.sql` tanpa perlu mengedit file itu (loop
  generik per-skema/per-tabel, bukan daftar nama di-hardcode).
- Integration test M1 membuktikan pemisahan ini nyata: query pakai
  `wadar_app` tanpa `set_config` harus **throw** (bukan diam-diam 0 baris),
  query `wadar_app` dengan `set_config` ke tenant lain harus 0 baris, dan
  query pakai `wadar` (migrate) sengaja dites BISA lihat semua — supaya ada
  bukti eksplisit pemisahan role ini nyata, bukan asumsi.

## Dipertimbangkan tapi ditolak

- **Cuma andalkan filter `WHERE tenant_id = ...` di application layer**,
  tanpa RLS Postgres sama sekali — ditolak: satu query yang lupa filter
  (bug manusia, sangat mudah terjadi) langsung jadi kebocoran data
  antar-tenant tanpa lapis pertahanan kedua. RLS di level database adalah
  syarat CLAUDE.md aturan #2, bukan opsional.
- **`missing_ok: true` di kebijakan RLS** (current_setting kembalikan NULL
  kalau `app.tenant_id` belum di-set, alih-alih throw) — ditolak: NULL
  dibandingkan `tenant_id` manapun via `=` selalu falsy, jadi hasilnya 0
  baris yang terlihat identik dengan "memang tidak ada data buat tenant
  ini" — silent, bukan gagal keras. Kami pilih exception (SQLSTATE 42704)
  supaya lupa bungkus `withTenantContext` kelihatan jelas lewat 500 di
  observability, bukan bug data yang baru ketahuan belakangan.
