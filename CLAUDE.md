# CLAUDE.md — WADAR AI (mode SPRINT sampai 24 Okt 2026)

Tujuan: demo final BPC ter-deploy. Rencana: `docs/SPRINT-8D.md`; tugas hari ini: `docs/sprint/DX.md`.
Acuan rumus/arah (BACA PER BAGIAN SAJA, jangan utuh): `docs/TECH-SPEC.md` §4 skema, §7.1 stok, §7.2 keuangan, §7.3 chat, §7.4 konsultasi. `docs/PRD.md` §7.2 layar.
@AGENTS.md

## Stack sprint
Next.js 16 App Router + TS + Tailwind v4 + komponen shadcn (radix-ui, `src/components/ui`) — satu app, tanpa monorepo/worker · Supabase cloud `kuerbreijqcdvmxvvkxh` Singapura (Postgres, RLS, pgvector, Auth) · Vercel AI SDK + Gemini · Vitest · deploy Vercel. `cacheComponents` aktif (ADR-001): data yang membaca sesi/cookie di balik `<Suspense>`; halaman app di `/<slug>/…`.

## Perintah
pnpm dev · pnpm test · pnpm lint · pnpm typecheck · pnpm build · `PGHOST=/tmp PGUSER=wadar pnpm test:db` (migrasi + tes SQL di Postgres lokal + stub Supabase) · pnpm seed:demo --reset
Migrasi: tulis di `supabase/migrations/`, uji `pnpm test:db`, terapkan ke hosted (Supabase MCP `apply_migration` / `supabase db push`), lalu samakan nama file dengan versi di hosted. Registry shadcn diblokir di sesi cloud: salin pola komponen yang ada.

## Aturan wajib
1. Uang = integer rupiah (bigint). Tidak ada float. Alokasi = largest remainder (`src/core/money.ts`, `app.alloc_lr` di SQL).
2. Semua tabel tenant pakai RLS `app.is_member(tenant_id)`; tabel append-only (sales, sale_items, stock_movements, expenses) tanpa UPDATE/DELETE untuk app. Service role hanya di server.
3. Angka dihitung di `src/core` (fungsi murni + test) atau SQL. LLM hanya menarasikan / menjawab dari hasil tools. LLM tidak menghitung uang.
4. Customer Chat hanya membaca view `chat_product_cards`, kebijakan, dan FAQ. Tidak pernah HPP/margin. Guardrail tidak boleh dimatikan.
5. Semua panggilan LLM lewat `src/ai/` (model, prompt, meter).
6. Teks UI Bahasa Indonesia sehari-hari; kode Bahasa Inggris. Nama brand dari `src/brand.ts`.
7. Rahasia tidak di-commit.

## Cara kerja (hemat token)
- Baca hanya file yang disebut. Jangan menjelajah repo tanpa diminta.
- Plan ≤ 10 poin → tunggu OK → kerjakan → laporan akhir ≤ 5 baris.
- Output perintah dipotong (`| tail -40`). Jangan tempel log panjang.
- Prioritas: berfungsi untuk skenario demo (SPRINT §4) > lengkap. Fitur di luar scope sprint: tolak dan catat di `docs/BACKLOG.md`.
- Selesai = DoD DX.md + test & build hijau → commit `feat(scope): ... [ID]`.
- Sebelum push: `git fetch` + `git merge-base --is-ancestor <commit-kita> origin/<branch>` (branch pernah di-force-push dari Antigravity); kalau hilang, merge — jangan force-push.

## Status
Hari: D1–D8 selesai di kode + penyempurnaan 17 Okt (`docs/sprint/D8.md` §Penyempurnaan). Verifikasi 17 Okt (sesi cloud): `pnpm test` 896 ✓, lint ✓, typecheck ✓, `pnpm build` ✓, `pnpm test:db` (31 migrasi + 21 tes SQL, Postgres 16) ✓. Migrasi repo = hosted: nama file = versi di `schema_migrations` (16 migrasi v1 Sept di hosted sengaja tidak ada di repo). Perbandingan naik/turun (Keuangan, insight Beranda, Konsultasi 7d/30d) memakai hari yang sudah selesai (s.d. kemarin). Seed demo `20261017183500_demo_seed_weekly_story`: cerita §4 langkah 3–4 benar 38/38 tanggal×jam.
Pusat Koneksi (19 Okt, ADR-003, `docs/ARCHITECTURE-V2.md`): Otak AI per toko (OpenAI-compatible, key AES-GCM via `src/lib/secret-box.ts`), API WADAR `/api/v1/*` + API key (hash saja, bertindak atas nama pemilik pembuatnya), Autopilot (`/api/cron/agent` 06.00 WIB, aturan tanpa LLM). Tahap 2 (ADR-004): konektor langsung Telegram/WhatsApp Cloud API (`/api/channels/{telegram,whatsapp}/[id]`); Pembelian (ADR-005, Stok › Pembelian, izin `purchase`); Jurnal double-entry (ADR-006, Keuangan › Neraca & Jurnal); Webhook keluar (ADR-007). **Semua 6 migrasi Tahap 2 sudah diterapkan di hosted** (20 Okt 2026, via SQL Editor bundel): `connect_hub`, `conversation_channels`, `channel_connectors`, `purchasing`, `journal`, `webhooks`. Tabel terverifikasi: 15/15 ada. Security advisor bersih untuk tabel baru. Migrasi dijalankan via SQL Editor (bukan `apply_migration`), sehingga tidak tercatat di `schema_migrations` — nama file repo tetap sebagai acuan. Env opsional baru `WADAR_ENCRYPTION_KEY` (32 byte base64; tanpa ini diturunkan dari `SUPABASE_SERVICE_ROLE_KEY`).
Ruang Demo (20 Okt, staging `/<slug>/staging`, izin `settings`): Dampak 7 hari (`src/core/impact.ts`), Sehari di Toko, Pitch Card, tur fitur + "Mode Juri" (hanya toko demo), QRIS Dinamis simulasi (`src/core/qris.ts`, bukan pembayaran asli). 3 toko demo segmen kecil 30 hari (`app.seed_demo_lite`): warkop, penyetan, madura; `tenants.demo_profile`. Migrasi `fonnte_channel` + `demo_variants` sudah di hosted (apply_migration).
Panel admin (20 Okt, ADM-1 irisan pertama): `/admin` hanya untuk email di `app.platform_admins` (isi lewat SQL, bukan dari app; non-admin → 404). Template toko demo (`public.demo_templates`: nama, pemilik, jenis, deskripsi, ikon, tampil di `/juri`) + daftar semua toko dengan ganti nama (tercatat di `audit_log` toko + `app.admin_audit`). `/juri` = link publik untuk juri. Header toko menampilkan tombol "Admin WADAR" untuk admin; `/admin` = ringkasan semua usaha (`admin_overview`) + daftar usaha (filter asli/demo, omzet 30 hari). Migrasi `admin_panel` + `admin_overview` sudah di hosted.
Sebelum demo: reset toko demo (`/<slug>/pengaturan?reset-demo=1`) supaya memakai seed baru · uji skenario 3× di HP · deploy final + freeze.
Open (Vercel env, server-only kecuali `NEXT_PUBLIC_*`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (widget `/w/[slug]`, cron, batas "Coba demo"), `CRON_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY` (tanpa ini: jawaban templat offline), opsional `DEMO_SAFE`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`, `NEXT_PUBLIC_PRIVACY_EMAIL`. Lighthouse mobile build produksi: `/` 97–100, `/masuk` 94 (halaman login-only belum diukur). Belum terverifikasi: browser/PWA di HP, jalur LLM nyata, SSE di Vercel, `purge_shop`/cron. Pelajaran: cek objek DB yang dipakai loader, bukan cuma versi migrasi. · URL: Vercel (Root Directory harus `/`) · Kode v1 (monorepo NestJS) di commit `59e2c54`.
Catatan infra: Railway v1 dimatikan 13 Okt (api/worker 0 replika, Redis sleep). Supabase hosted masih berisi schema v1 (`identity`, `catalog`, …) — tidak dipakai, boleh dihapus. Login produksi: OTP email hanya sampai ke email pemilik akun Resend (mode uji); Google belum aktif; ada login kata sandi.
