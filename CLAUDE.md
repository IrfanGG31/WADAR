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
pnpm dev:up         # pintasan satu-perintah: .env + docker compose up --wait + db push + pnpm dev
pnpm dev            # web + api + worker (asumsi infra sudah nyala — dipanggil dev:up di atas)
pnpm dev:health     # monitoring cepat: /health/live & /health/ready api+worker, status docker compose, web
pnpm dev:logs       # tail log Postgres + Redis
pnpm dev:down       # matikan Postgres + Redis
pnpm test           # unit + integration
pnpm test:unit      # tanpa Docker
pnpm test:integration  # Testcontainers Postgres+Redis, butuh Docker
pnpm lint && pnpm typecheck && pnpm depcruise
pnpm db:generate    # drizzle migration dari schema
pnpm db:migrate
pnpm evals          # evaluasi AI (golden set) — placeholder no-op sampai M8
docker compose -f infra/docker-compose.yml up -d
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

## Cara Bekerja
- Mulai tugas besar dengan rencana (plan mode) yang menyebut file yang akan diubah dan tes yang akan ditulis; tunggu persetujuan.
- Periksa versi stabil terbaru pustaka sebelum memasang dependensi baru.
- Sebelum menyatakan selesai: jalankan lint, typecheck, test, depcruise; sebutkan hasilnya.
- Keputusan arsitektur baru → tulis ADR pendek di `docs/adr/`.
- Jika instruksi pengguna bertentangan dengan aturan wajib di atas, jelaskan konfliknya dan tawarkan alternatif — jangan diam-diam melanggar.

## Status
- Milestone saat ini: **M0 — selesai secara lokal (semua yang bisa diverifikasi tanpa Docker sudah hijau); tes integrasi Testcontainers tinggal dikonfirmasi di CI**
- Terakhir selesai: struktur monorepo (`apps/web|api|worker`, `packages/contracts|core|brand|config|ai`), modul `platform` (outbox+relay, idempotent consumer, `processed_events`, `idempotency_keys`, `audit_log`, health checks, `IdempotencyKeyInterceptor`, `ZodValidationPipe`), `dependency-cruiser` (allow-list + transitive domain purity, `apps/web`→`modules` ban — dites langsung dengan pelanggaran sungguhan, bukan cuma "lolos karena vacuous"), CI GitHub Actions, ADR-001 (custom Zod validation pipe, ganti `nestjs-zod`).
- **Hasil verifikasi lokal** (dijalankan sungguhan, bukan diasumsikan): `pnpm install`, `pnpm lint` (8/8), `pnpm typecheck` (8/8), `pnpm test:unit` (22 tes, semua hijau), `pnpm depcruise` (164 modul/256 dependency, 0 pelanggaran), `pnpm build` (3/3), dan **`pnpm dev` benar-benar menyalakan web+api+worker bareng** (dicek lewat curl `/health/live` → 200, `/health/ready` → 503 saat DB/Redis mati sesuai desain, `POST /ping` tanpa `Idempotency-Key` → 400).
- **4 bug nyata ketemu & diperbaiki lewat testing manual** (tidak akan ketangkep lint/typecheck/unit test saja): (1) BullMQ melarang `:` di nama queue — `consumerQueueName` diganti pakai `.`; (2) `outbox-relay.tick()` crash total kalau `db.transaction()` gagal connect (bukan cuma gagal publish) — ditambah try/catch pembungkus; (3) `tsx` tidak resolve `tsconfig.json` per-file untuk import lintas-paket lewat symlink `node_modules` (`@wadar/platform` dari `apps/worker`) — diperbaiki dengan `--tsconfig ../../tsconfig.json` eksplisit di skrip `dev`; (4) `/health/ready` bisa nge-hang **30+ detik** kalau Postgres mati (pool `pg` tanpa connect timeout) — ditambah `connectionTimeoutMillis: 3000` di `infra/db.ts` + `withTimeout()` 3 detik untuk `.ping()` Redis (gak bisa pakai `maxRetriesPerRequest` karena itu wajib `null` buat BullMQ) + jalankan cek DB & Redis paralel (`Promise.allSettled`), turun jadi ~3 detik. Juga ditambah `tsup` (bundling `noExternal: [/^@wadar\//]`) untuk `apps/api`/`apps/worker` karena `node dist/main.js` butuh workspace package ter-bundle, bukan sekadar ter-typecheck.
- **Pintasan dev lokal ditambahkan**: `pnpm dev:up` (satu perintah: `.env` + docker compose `--wait` + `drizzle-kit push` + `pnpm dev`), `pnpm dev:health` (snapshot `/health/live`+`/health/ready` api & worker, status docker compose, web) untuk monitoring dari terminal terpisah, `pnpm dev:logs`, `pnpm dev:down` — lihat `scripts/dev-up.sh` & `scripts/dev-health.sh`.
- **Belum terverifikasi (butuh Docker, diblokir kebijakan proxy di sandbox penulisan kode ini — dikonfirmasi lewat `recentRelayFailures`, bukan masalah jaringan biasa)**: `pnpm test:integration` (Testcontainers Postgres+Redis — kodenya sudah ditulis lengkap termasuk tes redelivery lewat BullMQ asli & resilience Redis-mati, tinggal dijalankan), `docker compose up` end-to-end, `supabase start` (`supabase init` sendiri sudah sukses dijalankan). **Jalankan `pnpm test:integration` di CI (GitHub Actions runner punya Docker sendiri, tidak lewat proxy sandbox ini) atau mesin dev sebelum menganggap M0 100% tuntas** — kode & desainnya sudah lewat 1 putaran review independen plus 3 bug nyata di atas sudah diperbaiki, tapi jalur Testcontainers itu sendiri belum pernah benar-benar dieksekusi.
- Catatan terbuka:
  - Nama brand "WADAR" dipakai penuh untuk build; keputusan final sebelum peluncuran v1 (PRD §14.1).
  - Validasi skema sub-akun Xendit (xenPlatform) sebelum M5.
  - **Validasi unit economics** sebelum M8/M9: hitung biaya nyata (harga token LLM per model, biaya percakapan WhatsApp Cloud API) vs kuota paket di PRD §9 (Growth: 150 pertanyaan asisten + 1.000 percakapan chat = Rp199rb; target biaya AI+WA ≤15% ARPU di PRD §10). Kalau kuota kebesaran, turunkan sebelum janji ke pengguna pilot.
  - Model harga B2B2B (PRD §14.2 no.4) masih terbuka, tidak menghambat MVP/pilot.
  - Trigger upgrade TypeScript 7: cek rilis `typescript-eslint` yang menutup issue #12518 (bukan sekadar TS 7.1 tersedia).
  - Trigger upgrade NestJS 12: tunggu ekosistem (terutama `@sentry/nestjs`) rilis dukungan resmi, bukan cuma `nestjs-zod` (yang sudah tidak dipakai — lihat ADR-001).
