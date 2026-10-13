# ADR-003 — `packages/ui-web` hand-built on `radix-ui`, not via `shadcn` CLI

| Meta | Isi |
|---|---|
| Status | Diterima |
| Tanggal | 19 September 2026 |
| Konteks milestone | M1 |

## Konteks

Plan M1 eksplisit minta: "jalankan `shadcn init` dulu dan lihat apa yang
benar-benar di-scaffold" sebelum menetapkan API komponen — riset dependency
sebelum implementasi menemukan CLI `shadcn@4.21.0` kemungkinan sudah default
ke Base UI (`-b base`), bukan Radix, dan itu perlu dikonfirmasi langsung,
bukan diasumsikan.

Dikonfirmasi langsung: `shadcn init` dijalankan (`pnpm dlx shadcn@latest
init --monorepo -b base -p nova -y`), dan CLI-nya sendiri terbukti benar
menawarkan 3 pilihan primitive engine (`base`, `radix`, `aria`) — bukan lagi
cuma Radix, tepat seperti dugaan riset. Tapi command itu gagal di tahap
berikutnya: `init` perlu mengambil preset styling dari
`https://ui.shadcn.com/init?...`, dan domain itu **diblokir kebijakan
egress sandbox** ini (`gateway answered 403 to CONNECT`, dikonfirmasi lewat
`recentRelayFailures` proxy — kelas pembatasan yang sama dengan blokir
Docker Hub yang sudah didokumentasikan sejak M0, bukan masalah jaringan
biasa).

## Keputusan

Karena CLI-nya sendiri tidak bisa dijalankan sampai selesai di sandbox ini,
`packages/ui-web` dibangun manual: komponen (`Button`, `Input`, `Label`,
`Card`, `Badge`, `DropdownMenu`) ditulis langsung mengikuti konvensi API
shadcn/ui (struktur file, nama prop, pola `cva` + `cn()`) supaya tetap
kompatibel kalau nanti `shadcn add` dijalankan sungguhan di mesin dengan
akses jaringan — CLI-nya cuma menyalin kode komponen ke repo, bukan
dependency runtime, jadi hasil akhirnya setara.

Untuk primitive engine-nya sendiri: **`radix-ui`** (paket konsolidasi,
stabil di 1.6.7), **bukan** `@base-ui-components/react` (versi yang
terpasang di registry npm saat ini masih `1.0.0-rc.0`, belum stabil). Ini
kontradiksi dengan default CLI yang sempat dikonfirmasi (`-b base`), tapi
CLAUDE.md "Cara Bekerja" eksplisit minta "periksa versi stabil terbaru
pustaka sebelum memasang dependensi baru" — RC bukan stabil, dan primitive
layer dipakai oleh SEMUA komponen interaktif ke depannya, jadi bukan
tempat yang tepat untuk bertaruh pada rilis kandidat.

## Konsekuensi

- Tailwind v4 tetap dipasang persis sesuai rencana (CSS-first `@theme`,
  `@tailwindcss/postcss`), tidak terdampak oleh blokir CLI.
- `tailwind-merge` v3.7.0, `lucide-react` v1.47.0, `class-variance-authority`
  0.7.1 — semua sesuai tabel versi di plan M1, dicek langsung ke npm
  registry (yang TIDAK diblokir, beda dengan `ui.shadcn.com`).
- Token warna di `packages/ui-web/src/theme.css` disalin manual dari
  `@wadar/brand` (bukan digenerate build-time) — dijaga sinfaktual lewat
  `theme.test.ts` (gagal kalau nilai hex-nya divergen), bukan otomatis
  tersinkron. Cukup untuk M1 (5 warna, jarang berubah); kalau daftar token
  membesar, pertimbangkan codegen step.
- Kalau nanti sandbox/mesin dev punya akses ke `ui.shadcn.com`, `shadcn add
  <component>` tetap bisa dipakai untuk menambah komponen baru — hasilnya
  akan konsisten dengan yang sudah ditulis manual di sini (sengaja
  ditulis meniru konvensi CLI-nya).
- Kalau `@base-ui-components/react` rilis versi stabil (bukan lagi `-rc`)
  dan CLI shadcn upstream sudah default penuh ke situ, evaluasi ulang
  migrasi dari `radix-ui` — belum ada urgensi di M1.
