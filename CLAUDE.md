# CLAUDE.md — WADAR AI (versi sprint BPC, s/d 24 Okt 2026)

Baca di awal sesi. Selama sprint, `docs/SPRINT-8D.md` mengalahkan TECH-SPEC §16. Tugas hari ini: `docs/sprint/DX.md`.
@AGENTS.md

## Apa ini
WADAR AI = PWA + WhatsApp untuk UMKM lintas kanal. POS/CRM ringan mengumpulkan data; empat mesin AI (Stock Intelligence, Finance Insight, Customer Chat RAG, Business Consultation) memakai satu knowledge base per toko. Target sprint: demo final BPC 24 Okt 2026 (skenario SPRINT-8D §4).

## Dokumen — rujuk bagiannya saja, jangan baca utuh
- `docs/BRD.md`: aturan bisnis BRL-xx, harga & kuota, anggaran biaya. Kalau bertentangan, BRD menang.
- `docs/PRD.md`: fitur ber-ID (ONB, CAT, STK, POS, FIN, CHT, CON, …) + acceptance criteria.
- `docs/TECH-SPEC.md`: skema §4, rumus §7, pipeline RAG, keputusan terbuka §15. **Belum ada di repo — minta ke pengguna.**
- `docs/SPRINT-8D.md`, `docs/sprint/DX.md`: scope & DoD sprint. `docs/COMPETITORS.md`: pola UX.
- `docs/archive/v1/`: dokumen + CLAUDE.md lama (tidak berlaku). Kode v1 (monorepo NestJS, M0–M6) ada di commit `59e2c54`.

## Stack (sprint)
Satu app Next.js 16 (App Router, `src/`, `cacheComponents` — ADR-001) + Tailwind v4 + komponen shadcn (radix-ui, `src/components/ui`) · Supabase cloud Singapura `kuerbreijqcdvmxvvkxh` (Postgres + RLS + pgvector + Auth) · Vercel AI SDK + Gemini · Zod · Vitest · pnpm. Tanpa monorepo, worker, atau pgmq.
Struktur: `src/app/{(auth),(app)/[slug]/…}`, `src/core` (rumus murni + test), `src/ai`, `src/db`, `src/lib`, `supabase/migrations`, `scripts/seed-demo.ts`.

## Perintah
```bash
pnpm dev | pnpm build | pnpm start
pnpm test        # vitest (src/**/*.test.ts)
pnpm lint && pnpm typecheck   # typecheck = next typegen + tsc
```
Registry shadcn (`ui.shadcn.com`) diblokir proxy sesi cloud: tambah komponen dengan menyalin pola di `src/components/ui`.

## Aturan wajib
1. Uang = `bigint` rupiah; alokasi largest remainder (`src/core/money.ts`); format hanya di UI.
2. Multi-tenant: RLS (`app.is_member`) di semua tabel tenant; service role hanya di server dan selalu difilter tenant; tes isolasi untuk tabel/route baru.
3. Append-only: penjualan, pergerakan stok, pengeluaran tidak diubah nominalnya; koreksi = void/entri balik.
4. Idempoten: POST pembuat transaksi pakai `idempotency_key`.
5. Angka dulu, narasi kemudian: semua angka dihitung di `src/core`/SQL; LLM hanya menarasikan hasil fungsi baca, tidak pernah menghitung uang.
6. AI read-only (kecuali `remember` dan membalas pembeli).
7. Customer Chat tidak pernah melihat HPP/margin/saldo/nomor HP; guardrail tidak boleh dimatikan.
8. Semua LLM lewat `src/ai` (router, meter biaya, prompt berversi).
9. Brand hanya dari `src/brand.ts` (warna juga di `globals.css`, dijaga `brand.test.ts`); jangan hardcode "WADAR".
10. Rahasia tidak di-commit; `.env.example` bernilai kosong; service role key tidak pernah ke klien.
11. Fitur inti tidak pernah diblokir kuota atau kegagalan LLM.

## Konvensi
- Kode & komentar Bahasa Inggris; teks UI Bahasa Indonesia sehari-hari ("Untung bersih", "Stok menipis").
- Waktu `timestamptz`, tampil di zona waktu toko. Commit: `feat(stock): reorder suggestion [STK-3]`.
- Tes: rumus → unit (fixture referensi); RLS → tes SQL; alur inti → Playwright bila sempat.
- Data yang membaca sesi/cookie harus di balik `<Suspense>` (cacheComponents); halaman app di bawah `/<slug>/…`.

## Cara kerja (hemat token, SPRINT-8D §7)
- 1 tugas = 1 sesi. Plan singkat ≤ 10 poin + file yang disentuh, tunggu OK, lalu kerjakan.
- Sebelum selesai: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`; laporan ≤ 5 baris; perbarui Status.
- Cek versi stabil & nama model Gemini aktif sebelum memasang.
- Sebelum push: `git fetch`, cek `git merge-base --is-ancestor <commit-kita> origin/<branch>` (riwayat pernah di-force-push dari Antigravity); kalau hilang, merge — jangan force-push.

## Status
- **D1 (14 Okt) sedang berjalan.** Selesai: app Next.js 16.4 di root, auth (OTP email + Google tersembunyi bila belum aktif + kata sandi + lupa sandi), `proxy.ts`, shell (bottom tab ≤768px / sidebar), placeholder 9 halaman, `money.ts` (format + largest remainder), 20 tes unit, lint/typecheck/build hijau. **Menunggu TECH-SPEC §4.1–4.3** untuk `0001_core.sql` + RLS + `/mulai` + `/onboarding` (buat toko + 5 kanal default).
- Infra: Vercel harus diubah **Root Directory → `/`** (dulu `apps/web`) + env `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`. Railway (api/worker/Redis v1) tidak dipakai lagi → matikan supaya tidak bayar. Supabase hosted masih berisi schema v1 (`identity`, `catalog`, …) — biarkan sampai stack lama dimatikan, lalu hapus.
- Login produksi: SMTP Resend mode uji → OTP email hanya sampai ke email pemilik akun Resend; Google belum aktif; login kata sandi tersedia (`/masuk/admin`).
