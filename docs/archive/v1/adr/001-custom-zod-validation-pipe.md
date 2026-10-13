# ADR-001 — Custom Zod validation pipe instead of `nestjs-zod`

| Meta | Isi |
|---|---|
| Status | Diterima |
| Tanggal | 19 September 2026 |
| Konteks milestone | M0 |

## Konteks

`docs/ARCHITECTURE.md` §14 (Tech Stack Ringkas) awalnya menyebut "Zod
(nestjs-zod)" sebagai cara memvalidasi input NestJS. Saat implementasi M0,
riset dependency menemukan `nestjs-zod@5.5.0` — versi stabil terbaru saat
ini — mendeklarasikan peer dependency `@nestjs/common: "^10.0.0 || ^11.0.0"`,
**belum** mencakup NestJS 12 (rilis terbaru per riset). PR yang menambah
dukungan Nest 12 masih terbuka, belum di-merge.

## Keputusan

M0 memakai NestJS 11.x (lihat plan M0, tabel versi dependency — alasan
utamanya bukan cuma `nestjs-zod`, tapi NestJS 12 adalah rewrite ESM penuh
lintas semua paket resmi, dan `@sentry/nestjs` pun belum stabil di Nest 12).
Jadi pertanyaan sebenarnya bukan "tunggu `nestjs-zod` update peer range",
tapi "apakah `nestjs-zod` layak dipakai sama sekali".

`nestjs-zod` menggabungkan dua hal:
1. Validation pipe (parse request body/query/params dengan skema Zod).
2. Generate OpenAPI dari `createZodDto`.

Keduanya bisa dipisah. Kami memilih **tidak memakai `nestjs-zod`** dan
menggantinya dengan:

- `ZodValidationPipe` custom (`modules/platform/src/http/zod-validation.pipe.ts`,
  ~30 baris) — memanggil `schema.safeParse()` langsung, memetakan kegagalan
  ke RFC 7807 (`docs/ARCHITECTURE.md` §11). Nol risiko peer-dependency karena
  ini kode sendiri, bukan paket pihak ketiga yang terikat ke major version
  NestJS tertentu.
- Generate OpenAPI dari skema Zod di `packages/contracts` ditunda ke M1+
  (belum ada endpoint bisnis nyata untuk didokumentasikan di M0), akan
  dikerjakan pakai paket standalone (`zod-openapi` atau
  `@asteasolutions/zod-to-openapi`) yang independen dari major version
  NestJS — sejalan dengan ADR-008 (`@wadar/contracts` sumber tunggal skema).

## Konsekuensi

- Setiap modul yang menambah endpoint tulis (`POST`/`PUT`/`PATCH`) memakai
  `ZodValidationPipe` dari `@wadar/platform`, bukan `nestjs-zod`'s
  `ZodValidationPipe`/`createZodDto`.
- Kalau nanti pindah ke NestJS 12, pipe custom ini hampir drop-in cocok
  dengan `StandardSchemaValidationPipe` native NestJS 12 (Zod sudah
  mendukung interface Standard Schema `~standard.validate`) — migrasi lebih
  mudah dibanding kalau kami sudah terlanjur bergantung ke API `nestjs-zod`.
- `docs/ARCHITECTURE.md` §14 baris "API & worker" diperbarui dari
  "Zod (nestjs-zod)" menjadi "Zod (custom validation pipe + zod-openapi/
  zod-to-openapi, ADR-001)".

## Dipertimbangkan tapi ditolak

- **Override peer dependency `nestjs-zod` secara paksa** (`pnpm.overrides`)
  supaya tetap bisa pakai NestJS 12 — ditolak karena menutupi risiko nyata
  (NestJS 12 belum siap ekosistemnya secara luas, bukan cuma satu paket) di
  balik satu override yang mudah dilupakan.
- **Tetap pakai `nestjs-zod` di NestJS 11** — secara teknis jalan, tapi tetap
  menggabungkan concern validasi & OpenAPI yang sebaiknya independen, dan
  tetap menambah satu dependency pihak ketiga yang harus diawasi versi
  peer-nya tiap kali NestJS naik major version.
