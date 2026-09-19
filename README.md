# WADAR

Asisten bisnis AI untuk UMKM Indonesia — Keuangan Otomatis, Operasional
Terpadu, dan Asisten Chat Cerdas dalam satu langganan. Lihat `CLAUDE.md` untuk
aturan wajib proyek, dan `docs/` untuk PRD, arsitektur, dan urutan milestone.

## Status

Milestone M1 (identitas, tenant, shell aplikasi) — lihat bagian "Status" di
`CLAUDE.md` untuk posisi terkini.

## Struktur repo

```
apps/       web (Next.js), api (NestJS+Fastify), worker (NestJS standalone)
modules/    domain modules — platform (outbox, idempotency, audit, health),
            identity (tenants, outlets, memberships, roles, invitations, RLS)
packages/   contracts, core, brand, config, ai, ui-web — dipakai lintas apps/modules
infra/      docker-compose (Postgres+pgvector, Redis), postgres-init (role wadar_app + RLS)
supabase/   config lokal untuk Supabase CLI (Auth — OTP email/HP + Google)
docs/       PRD, ARCHITECTURE, BUILD-PLAN, COMPETITORS, ADR
```

Aturan batas modul ditegakkan `dependency-cruiser` (`.dependency-cruiser.cjs`)
— lihat `modules/platform/README.md` untuk apa yang bisa & tidak bisa
ditangkap tool ini.

## Menjalankan lokal

Prasyarat: Node.js ≥22.22 (lihat `.nvmrc`), pnpm dikelola lewat `corepack`
(versi dipin di `package.json` `packageManager`), Docker (untuk Postgres +
Redis lokal dan untuk tes integrasi via Testcontainers).

### Pintasan tercepat (satu perintah)

```bash
corepack enable && corepack prepare pnpm@12.4.2 --activate
pnpm install
pnpm dev:up   # scripts/dev-up.sh: salin .env kalau belum ada → nyalakan Postgres+Redis
              # (tunggu sampai healthy) → push schema tiap modul → grant role wadar_app
              # + FORCE RLS → pnpm dev (web+api+worker)
```

Buka tab terminal lain untuk mantau statusnya:

```bash
pnpm dev:health   # snapshot cepat: /health/live & /health/ready api+worker,
                   # status container docker compose, dan web menyala atau tidak
pnpm dev:logs     # tail log Postgres + Redis (docker compose logs -f)
pnpm dev:down     # matikan Postgres + Redis
```

### Langkah manual (kalau mau kontrol tiap tahap)

```bash
corepack enable
corepack prepare pnpm@12.4.2 --activate

cp .env.example .env   # lalu isi kalau perlu — default sudah cocok dengan docker-compose di bawah
                        # (termasuk role migrate `wadar` vs role runtime `wadar_app` — lihat
                        # docs/adr/002-postgres-role-separation-for-rls.md)

pnpm install
docker compose -f infra/docker-compose.yml up -d   # Postgres 16 + pgvector, Redis — juga bikin role wadar_app di volume baru
pnpm db:push    # buat tabel schema `platform` + `identity` (role migrate: wadar)
pnpm db:grant   # grant akses role runtime wadar_app + FORCE RLS (idempoten)

pnpm dev   # web (Next.js), api (NestJS), worker (NestJS) jalan sekaligus lewat Turborepo
```

> Volume Postgres yang sudah ada dari sebelum M1 tidak otomatis dapat role
> `wadar_app` (script init cuma jalan sekali di volume baru) — lihat
> `infra/postgres-init/README.md` untuk cara migrasi manual.

**Catatan `tsx` + monorepo:** `apps/api` dan `apps/worker` pakai `tsx watch --tsconfig ../../tsconfig.json` (bukan `tsx watch` polos). `tsx`/esbuild resolve tsconfig per-file untuk import relatif, tapi TIDAK jalan-jalan cari tsconfig terdekat untuk file yang diimpor lewat package specifier (`@wadar/platform`) yang resolve lewat symlink `node_modules` — ditemukan langsung dengan menjalankan `pnpm dev` dan melihat error "Parameter decorators only work when experimental decorators are enabled" dari file di `modules/platform`. Memaksa satu `tsconfig.json` root (yang sudah set `experimentalDecorators`/`emitDecoratorMetadata`) lewat `--tsconfig` menyelesaikannya untuk seluruh graph impor lintas-paket.

Supabase Auth lokal (dipakai penuh mulai M1 — OTP email lewat Inbucket
`:54324`, OTP nomor HP dengan UI lengkap tapi provider SMS belum
dikonfigurasi, Google OAuth):

```bash
npx supabase start
# salin API_URL/ANON_KEY hasilnya ke .env sebagai
# NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY (+ SUPABASE_URL/ANON_KEY),
# dan cek mode JWT-nya (lihat komentar SUPABASE_JWT_MODE di .env.example)
```

### Verifikasi & monitoring

```bash
pnpm dev:health   # cara tercepat — lihat "Pintasan tercepat" di atas

# atau manual per endpoint:
curl http://localhost:3001/health/live
curl http://localhost:3001/health/ready    # 503 dalam ~3 detik kalau DB/Redis mati (bukan nge-hang)

pnpm lint
pnpm typecheck
pnpm test:unit          # tidak butuh Docker
pnpm test:integration   # butuh Docker (Testcontainers Postgres+Redis)
pnpm depcruise

pnpm --filter @wadar/web test:e2e     # Playwright — butuh stack lokal penuh + supabase start
pnpm --filter @wadar/web lighthouse   # Lighthouse CI mobile terhadap /masuk — butuh `pnpm dev` jalan
```

## Env vars

Lihat `.env.example`. Jangan pernah commit `.env` asli (CLAUDE.md aturan #11).

## Kerja dengan Claude Code

Baca `CLAUDE.md` di awal setiap sesi. Urutan milestone lengkap ada di
`docs/BUILD-PLAN.md`.
