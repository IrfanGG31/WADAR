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
Hari: D3 selesai (D1 + D2 katalog/stok masuk, toko demo 90 hari `pnpm seed:demo --reset` / "Coba demo" + D3 kasir `record_sale` idempoten, riwayat) · URL: Vercel (Root Directory harus `/`, lihat catatan) · Kode v1 (monorepo NestJS) di commit `59e2c54`.
Catatan infra: Railway v1 dimatikan 13 Okt (api/worker 0 replika, Redis sleep). Supabase hosted masih berisi schema v1 (`identity`, `catalog`, …) — tidak dipakai, boleh dihapus. Login produksi: OTP email hanya sampai ke email pemilik akun Resend (mode uji); Google belum aktif; ada login kata sandi.
