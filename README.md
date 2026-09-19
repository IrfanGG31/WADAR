# WADAR

Asisten bisnis AI untuk UMKM Indonesia — Keuangan Otomatis, Operasional
Terpadu, dan Asisten Chat Cerdas dalam satu langganan. Lihat `CLAUDE.md` untuk
aturan wajib proyek, dan `docs/` untuk PRD, arsitektur, dan urutan milestone.

## Status

Milestone M0 (fondasi repo & platform) — lihat bagian "Status" di `CLAUDE.md`
untuk posisi terkini.

## Struktur repo

```
apps/       web (Next.js), api (NestJS+Fastify), worker (NestJS standalone)
modules/    domain modules — platform (outbox, idempotency, audit, health)
packages/   contracts, core, brand, config, ai — dipakai lintas apps/modules
infra/      docker-compose (Postgres+pgvector, Redis)
supabase/   config lokal untuk Supabase CLI (Auth, dipakai penuh mulai M1)
docs/       PRD, ARCHITECTURE, BUILD-PLAN, COMPETITORS, ADR
```

Aturan batas modul ditegakkan `dependency-cruiser` (`.dependency-cruiser.cjs`)
— lihat `modules/platform/README.md` untuk apa yang bisa & tidak bisa
ditangkap tool ini.

## Menjalankan lokal

Prasyarat: Node.js ≥22.22 (lihat `.nvmrc`), pnpm dikelola lewat `corepack`
(versi dipin di `package.json` `packageManager`), Docker (untuk Postgres +
Redis lokal dan untuk tes integrasi via Testcontainers).

```bash
corepack enable
corepack prepare pnpm@12.4.2 --activate

cp .env.example .env   # lalu isi kalau perlu — default sudah cocok dengan docker-compose di bawah

pnpm install
docker compose -f infra/docker-compose.yml up -d   # Postgres 16 + pgvector, Redis
pnpm --filter @wadar/platform exec drizzle-kit push --force   # buat tabel schema `platform`

pnpm dev   # web (Next.js), api (NestJS), worker (NestJS) jalan sekaligus lewat Turborepo
```

**Catatan `tsx` + monorepo:** `apps/api` dan `apps/worker` pakai `tsx watch --tsconfig ../../tsconfig.json` (bukan `tsx watch` polos). `tsx`/esbuild resolve tsconfig per-file untuk import relatif, tapi TIDAK jalan-jalan cari tsconfig terdekat untuk file yang diimpor lewat package specifier (`@wadar/platform`) yang resolve lewat symlink `node_modules` — ditemukan langsung dengan menjalankan `pnpm dev` dan melihat error "Parameter decorators only work when experimental decorators are enabled" dari file di `modules/platform`. Memaksa satu `tsconfig.json` root (yang sudah set `experimentalDecorators`/`emitDecoratorMetadata`) lewat `--tsconfig` menyelesaikannya untuk seluruh graph impor lintas-paket.

Supabase Auth lokal (dipakai penuh mulai M1, tapi CLI-nya sudah di-init di
M0 — lihat `supabase/config.toml`):

```bash
npx supabase start
```

### Verifikasi

```bash
curl http://localhost:3001/health/live
curl http://localhost:3001/health/ready

pnpm lint
pnpm typecheck
pnpm test:unit          # tidak butuh Docker
pnpm test:integration   # butuh Docker (Testcontainers Postgres+Redis)
pnpm depcruise
```

## Env vars

Lihat `.env.example`. Jangan pernah commit `.env` asli (CLAUDE.md aturan #11).

## Kerja dengan Claude Code

Baca `CLAUDE.md` di awal setiap sesi. Urutan milestone lengkap ada di
`docs/BUILD-PLAN.md`.
