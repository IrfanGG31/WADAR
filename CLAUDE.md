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
pnpm dev:up         # pintasan satu-perintah: .env + docker compose up --wait + db push + db grant + pnpm dev
pnpm dev            # web + api + worker (asumsi infra sudah nyala — dipanggil dev:up di atas)
pnpm dev:health     # monitoring cepat: /health/live & /health/ready api+worker, status docker compose, web
pnpm dev:logs       # tail log Postgres + Redis
pnpm dev:down       # matikan Postgres + Redis
pnpm test           # unit + integration
pnpm test:unit      # tanpa Docker
pnpm test:integration  # Testcontainers Postgres+Redis, butuh Docker
pnpm lint && pnpm typecheck && pnpm depcruise
pnpm db:generate    # drizzle migration dari schema, semua modul (role migrate: wadar)
pnpm db:migrate
pnpm db:push        # drizzle-kit push tiap modul, dev only (role migrate: wadar)
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

## Cara Bekerja
- Mulai tugas besar dengan rencana (plan mode) yang menyebut file yang akan diubah dan tes yang akan ditulis; tunggu persetujuan.
- Periksa versi stabil terbaru pustaka sebelum memasang dependensi baru.
- Sebelum menyatakan selesai: jalankan lint, typecheck, test, depcruise; sebutkan hasilnya.
- Keputusan arsitektur baru → tulis ADR pendek di `docs/adr/`.
- Jika instruksi pengguna bertentangan dengan aturan wajib di atas, jelaskan konfliknya dan tawarkan alternatif — jangan diam-diam melanggar.

## Status
- Milestone saat ini: **M1 — selesai secara lokal (semua yang bisa diverifikasi tanpa Docker sudah hijau, plus Lighthouse dijalankan sungguhan dan lolos); tes integrasi Testcontainers + E2E Playwright + CI end-to-end tinggal dikonfirmasi di CI/mesin dev**
- **Ringkasan M1**: modul `identity` (tenants+timezone, outlets, memberships, roles, invitations) dengan RLS Postgres nyata (bukan cuma filter aplikasi) via pemisahan role `wadar`/`wadar_app` (ADR-002); `SupabaseJwtGuard`→`TenantGuard`→`PermissionGuard` (RBAC 5 peran tetap); generator tes isolasi tenant otomatis di `modules/platform/testing` (scan `@TenantScoped()` + registry write-case) dipakai modul `identity` sendiri; `apps/api` dapat `Rfc7807Filter` global; `packages/ui-web` (Tailwind v4 + `radix-ui`, bukan CLI `shadcn` — lihat ADR-003) dan `packages/core/date.ts`; `apps/web` shell penuh (masuk OTP email/HP+Google, onboarding, bottom-tab/sidebar nav terfilter permission, pengaturan toko & tim, terima undangan) — lihat `docs/adr/002-postgres-role-separation-for-rls.md` dan `docs/adr/003-ui-web-radix-not-shadcn-cli.md`.
- **Hasil verifikasi lokal** (dijalankan sungguhan): `pnpm install`, `pnpm lint` (10/10), `pnpm typecheck` (10/10), `pnpm test:unit` (13 file tes, 56 tes total di seluruh repo, semua hijau — termasuk drift-guard yang bikin `packages/contracts`'s wire enum tetap sinkron dengan domain enum `modules/identity`, dan drift-guard warna `packages/ui-web/theme.css` vs `@wadar/brand`), `pnpm depcruise` (361 modul/674 dependency, 0 pelanggaran — termasuk 2 rule M0 yang ternyata rusak, lihat di bawah), `pnpm build` (3/3 — cuma `apps/api`/`apps/worker`/`apps/web` yang punya build step, sama seperti M0; **`next build` (Turbopack) sungguhan untuk `apps/web` sampai selesai**, 13 route + proxy/middleware ke-build — termasuk ketemu & diperbaiki bug "`pnpm build` gagal tanpa `NEXT_PUBLIC_*` di environment" lewat percobaan ini, lihat catatan CI di bawah). **Lighthouse CI dijalankan sungguhan** (bukan cuma dikonfigurasi) via Chromium yang sudah terpasang di sandbox ini (`next build && next start` lalu `lhci autorun` dengan `--no-sandbox`): performance 91, accessibility 95, best-practices 96, seo 91 — `lhci assert` exit 0 terhadap `/masuk` (bukan `/beranda` — lihat alasan di `apps/web/lighthouserc.js`, butuh sesi Supabase asli yang sandbox ini tidak punya).
- **2 bug dependency-cruiser M0 ketemu & diperbaiki** (baru kelihatan begitu ada modul kedua — `identity` — untuk dites, M0 cuma punya `platform`): (1) rule `no-cross-module-internals`'s pengecualian "boleh impor `public.ts`" regex-nya salah — nyari literal `modules/X/public.ts`, padahal file sungguhannya di `modules/X/src/public.ts`, jadi setiap impor `public.ts` modul lain malah kena tolak; (2) rule `domain-allowlist-direct` belum mengizinkan `vitest` sebagai dependency `domain/*.test.ts` (M0 gak punya folder `domain/` sama sekali). Keduanya diverifikasi dengan pola yang sama seperti M0: sengaja bikin pelanggaran sungguhan dulu (bukan cuma "lolos karena vacuous"), baru diperbaiki, baru dites lagi.
- **1 bug arsitektur Turbopack ketemu & diperbaiki** (baru kelihatan lewat `next build` sungguhan, `tsc --noEmit` gak nangkep ini sama sekali): `packages/contracts`/`packages/core` pakai import relatif ber-akhiran `.js` (wajib untuk konsumen NodeNext — `apps/api`/`apps/worker`/`modules/*` via `tsx`/`tsup`, keduanya berbasis esbuild yang memang resolve `.js`→`.ts`), tapi Turbopack (bundler `apps/web`) TIDAK melakukan resolusi yang sama — dicoba `transpilePackages` dan `experimental.extensionAlias` (setara `resolve.extensionAlias` webpack), keduanya belum cukup. Solusi akhir: `apps/web` impor paket itu lewat **subpath export eksplisit** (`@wadar/core/date`, `@wadar/contracts/identity`) yang langsung ke file leaf tanpa rantai `export * from "./x.js"` di baris barrel `index.ts` — jadi Turbopack gak pernah perlu resolusi itu sama sekali, dan `packages/contracts`/`packages/core` tetap NodeNext-benar buat backend.
- **1 celah UX ketemu & diperbaiki sambil nulis tes E2E**: form undang anggota gak pernah menampilkan link undangannya — sekarang link disalin manual dari halaman `Pengaturan Tim` (belum ada pengiriman email/WA otomatis, menyusul M8+). Juga ditambah penanganan 403 yang rapi (bukan crash) di `/pengaturan/tim` & `/pengaturan/toko` kalau diakses langsung oleh peran yang gak berwenang, plus form "Tambah outlet" disembunyikan kalau peran gak punya `settings:manage`.
- **Belum terverifikasi (butuh Docker/Supabase penuh, diblokir kebijakan proxy sandbox ini — sama seperti M0)**: `pnpm test:integration` (termasuk tes RLS 3-lapis + generator isolasi tenant modul `identity` yang baru — kodenya lengkap, `tsc`/`eslint` hijau, tinggal dijalankan), `pnpm --filter @wadar/web test:e2e` (alur daftar→buat toko→undang→terima→nav sesuai peran, butuh `supabase start` buat Inbucket OTP email), CI workflow versi baru (step Playwright+Lighthouse ditambahkan tapi belum pernah jalan sungguhan di GitHub Actions). **Jalankan ketiganya di CI/mesin dev sebelum menganggap M1 100% tuntas.**
- **CI GitHub Actions diperluas untuk M1**: step Playwright (`test:e2e`) + Lighthouse CI ditambah setelah `supabase start` + `pnpm dev` di background (lihat `.github/workflows/ci.yml`) — urutan step diubah supaya `pnpm build` (yang lewat `next build` meng-inline `NEXT_PUBLIC_*` saat build time, bukan runtime) jalan SETELAH nilai Supabase lokal yang asli di-resolve ke `$GITHUB_ENV`, bukan sebelumnya — ketemu sungguhan lewat percobaan `pnpm build` tanpa env vars di sandbox ini (gagal keras di `/lainnya`), bukan diasumsikan aman.
- **Deploy Vercel (project "wadar") gagal build pasca-push M1** — sama persis gejala CI di atas tapi di pipeline terpisah (Vercel punya Environment Variables sendiri, tidak kebaca dari `.github/workflows/ci.yml`). Ditemukan & diperbaiki sungguhan (bukan cuma diagnosis): dicek langsung lewat Vercel API — project Vercel-nya memang 0 env var — lalu dibuatkan project Supabase **hosted** baru (`wadar`, ref `kuerbreijqcdvmxvvkxh`, region `ap-southeast-1`, via Supabase MCP) dan schema `platform`+`identity` di-push ke sana (generate → `apply_migration`, bukan `db:push` langsung karena sandbox ini tidak punya akses jaringan ke Postgres hosted), termasuk role `wadar_app` + grant + `FORCE ROW LEVEL SECURITY` — diverifikasi lewat query langsung (`relrowsecurity`/`relforcerowsecurity` true di ke-4 tabel `identity` yang RLS). `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` di project Vercel diisi dari project ini. `NEXT_PUBLIC_API_URL` **masih placeholder** (`https://api.wadar.example.com`) — `apps/api`/`apps/worker` belum di-hosting di mana pun yang bisa diakses publik (Vercel cuma build+serve `apps/web`); login/fetch data sungguhan di deployment ini belum akan jalan sampai itu diisi nilai asli.
  - **2 bug baru ketemu & diperbaiki dalam proses ini** (baru kelihatan begitu benar-benar coba `pnpm db:generate`/push schema `identity` — belum pernah tereksekusi sungguhan sebelumnya di sesi manapun karena butuh Docker/DB): (1) `pnpm db:generate` untuk `identity` gagal ("Parameter decorators only work when experimental decorators are enabled") karena `identity/db/schema.ts` impor `tenantRlsPolicy` dari `@wadar/platform` (barrel `public.ts`), yang transitif membundel `health.controller.ts` (NestJS, ada parameter decorator) — drizzle-kit (via `get-tsconfig`) cuma menerapkan `experimentalDecorators` ke file yang masuk `include` tsconfig yang DITEMUKAN dari `process.cwd()`, dan `include: ["src"]` milik `modules/identity/tsconfig.json` tidak mencakup file `modules/platform/src/**`. Diperbaiki dengan pola yang sama seperti bug `tsx` M1 (lihat README "Catatan `tsx` + monorepo"): paksa SATU tsconfig root (yang `include`-nya mencakup semua `modules/**/src`) dengan menjalankan `drizzle-kit` dari root repo (bukan per-modul) — `db:generate`/`db:push`/`db:migrate` di root `package.json` sekarang loop `modules/*/drizzle.config.ts` dari cwd root, dan tiap `drizzle.config.ts` pakai path absolut (`import.meta.url`) supaya tetap benar walau cwd bukan folder modulnya. (2) `infra/postgres-init/02-grant-and-force-rls.sql`'s loop `FORCE ROW LEVEL SECURITY` gagal di Supabase hosted ("must be owner of table saml_relay_states") karena loopnya tanpa filter schema, jadi ikut kena tabel RLS milik Supabase sendiri (`auth.*`) yang dimiliki role lain — diperbaiki dengan filter schema yang sama persis seperti loop grant di atasnya (cuma jalan di sandbox Docker sebelumnya, yang memang cuma punya schema kita sendiri, jadi gap ini gak pernah ketahuan sampai dites ke Supabase hosted asli).
  - **Diketahui, belum diperbaiki** (di luar cakupan "benerin build Vercel" — dicatat, bukan diabaikan): tabel `platform` sendiri (`audit_log`, `outbox`, dll — semua M0, sebelum konsep RLS ada) TIDAK punya RLS sama sekali (`relrowsecurity=false` di semua, dicek langsung di project hosted) — beda dengan `identity`'s 4 tabel yang sudah RLS+FORCE. Menambahkan RLS ke tabel `platform` butuh dicek dulu apakah `outbox-relay`'s polling loop (butuh baca outbox LINTAS tenant) masih benar di bawah RLS — bukan perubahan yang aman digas tanpa cek itu dulu, jadi didokumentasikan sebagai gap milestone berikutnya, bukan langsung ditambal.
- Catatan terbuka:
  - **`apps/api`/`apps/worker` belum di-hosting di mana pun yang bisa diakses publik** — `NEXT_PUBLIC_API_URL` di project Vercel masih placeholder (`https://api.wadar.example.com`, lihat catatan di atas). Perlu VPS/Railway/Fly/dll sebelum deployment Vercel ini benar-benar bisa dipakai (login/fetch data), lalu update env var itu ke URL asli + redeploy.
  - Volume Postgres lama (dibuat sebelum M1) tidak otomatis dapat role `wadar_app` — lihat `infra/postgres-init/README.md` untuk cara migrasi manual.
  - OTP nomor HP: UI/alur lengkap dibangun, provider SMS Supabase sengaja dikosongkan (keputusan disetujui pengguna) — verifikasi manual menyusul begitu ada akun provider SMS.
  - Tidak ada pengiriman undangan otomatis (email/WA) — pemilik menyalin link secara manual untuk sekarang.
  - Nama brand "WADAR" dipakai penuh untuk build; keputusan final sebelum peluncuran v1 (PRD §14.1).
  - Validasi skema sub-akun Xendit (xenPlatform) sebelum M5.
  - **Validasi unit economics** sebelum M8/M9: hitung biaya nyata (harga token LLM per model, biaya percakapan WhatsApp Cloud API) vs kuota paket di PRD §9 (Growth: 150 pertanyaan asisten + 1.000 percakapan chat = Rp199rb; target biaya AI+WA ≤15% ARPU di PRD §10). Kalau kuota kebesaran, turunkan sebelum janji ke pengguna pilot.
  - Model harga B2B2B (PRD §14.2 no.4) masih terbuka, tidak menghambat MVP/pilot.
  - Trigger upgrade TypeScript 7: cek rilis `typescript-eslint` yang menutup issue #12518 (bukan sekadar TS 7.1 tersedia).
  - Trigger upgrade NestJS 12: tunggu ekosistem (terutama `@sentry/nestjs`) rilis dukungan resmi, bukan cuma `nestjs-zod` (yang sudah tidak dipakai — lihat ADR-001).
  - Kalau `@base-ui-components/react` rilis stabil (bukan lagi `-rc`), evaluasi ulang migrasi dari `radix-ui` di `packages/ui-web` (lihat ADR-003).

### Riwayat milestone
- **M0** (selesai) — fondasi monorepo, modul `platform` (outbox+relay, idempotent consumer, health checks), `dependency-cruiser`, CI, ADR-001. Diverifikasi sungguhan: lint/typecheck 8/8, 22 tes unit, depcruise 164 modul/0 pelanggaran, build 3/3, `pnpm dev` benar-benar menyalakan web+api+worker. 4 bug nyata ketemu & diperbaiki (queue name BullMQ, crash outbox-relay saat DB down, resolusi tsconfig tsx lintas-paket, `/health/ready` nge-hang 30+ detik) — detail lengkap ada di riwayat git (commit `81bd8ce`..`3267a54`).
