# ADR-001 — Sprint BPC: satu app Next.js 16 dengan Cache Components

- Status: diterima (13 Okt 2026)
- Konteks: SPRINT-8D §2

## Konteks
Sprint 8 hari menuju demo final BPC (24 Okt) memakai satu app Next.js di atas Supabase, tanpa monorepo, worker, atau pgmq. Kode v1 (monorepo NestJS api/worker + web, M0–M6) diganti di branch ini; riwayatnya tetap di commit `59e2c54`.

`create-next-app` 16.4 menyalakan `cacheComponents` dan `partialPrefetching` secara default. Dengan Cache Components, membaca `cookies()` (sesi Supabase) di luar `<Suspense>` adalah error build.

## Keputusan
- Pertahankan `cacheComponents: true` + `partialPrefetching: true` (default resmi; keduanya jadi default di major berikutnya). Kerangka app (sidebar/bottom tab, header) dirender statis sehingga pindah menu langsung menampilkan shell; bagian yang membaca sesi, slug, atau data toko di-stream di balik `<Suspense>`.
- `src/proxy.ts` hanya menyegarkan sesi dan menolak pengguna belum masuk; keanggotaan toko ditegakkan RLS saat data dibaca.
- Halaman app berada di `/<slug>/…` (SPRINT-8D §2), sehingga toko aktif terbaca dari URL, bukan cookie.
- Registry shadcn tidak bisa diakses dari sesi cloud; komponen shadcn (radix-ui) disalin dari kode v1 dan `components.json` disiapkan agar `shadcn add` tetap bisa dipakai dari mesin lain.

## Konsekuensi
- Komponen server yang membaca sesi/data harus dibungkus `<Suspense>` dengan fallback seukuran (lihat `NavSkeleton`). Jika satu rute sulit disesuaikan, `export const instant = false` menjadi jalan keluar sementara.
- Vercel harus memakai Root Directory `/`. Railway (api/worker/Redis v1) tidak lagi dipakai.
