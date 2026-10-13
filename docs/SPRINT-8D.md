# SPRINT 8 HARI — WADAR AI Demo Final BPC (24 Okt 2026)

**Tujuan tunggal:** pada 22 Okt sudah ada **WADAR yang ter-deploy di URL publik** dan bisa didemokan 5 menit tanpa error. Isinya: Beranda, POS, Stock Intelligence, Finance Insight, Customer Chat (widget), dan Konsultasi AI, berjalan di atas toko demo dengan data 90 hari.

Dokumen ini **mengalahkan** TECH-SPEC §16 selama sprint. BRD/PRD/TECH-SPEC tetap jadi acuan rumus dan arah jangka panjang.

---

## 1. Potongan Scope (sprint vs Fase 1)

| Masuk sprint | Ditunda (sebutkan sebagai "roadmap" ke juri) |
|---|---|
| Auth email + Google, 1 toko per akun, peran owner saja | Undang staf, peran kasir/admin |
| Katalog + varian + stok masuk + HPP | Impor produk CSV, foto produk upload (pakai URL/emoji) |
| POS (tunai/transfer/QRIS dicatat) + pelanggan by HP | Struk publik, void, POS offline |
| Generator **toko demo 90 hari** (skincare "Glow by Sari" + kopi "Kopi Dimas") termasuk penjualan Shopee/TikTok/GoFood | Impor file marketplace asli |
| Stock Intelligence: laju jual, tanggal habis, status, saran pesan ulang, lambat laku (TECH-SPEC §7.1) | Penyesuaian tanggal kembar, kedaluwarsa |
| Finance Insight: untung kotor/bersih, margin per produk & kanal, **dekomposisi penurunan untung**, 3 aturan peringatan (§7.2) | Ekspor laporan |
| Customer Chat via **widget web** dengan RAG + guardrail harga + eskalasi | WhatsApp produksi (pakai nomor test Meta **hanya jika** D7 longgar) |
| Konsultasi AI dengan 5 tools read-only + grounding angka | Insight mingguan terjadwal (tampilkan versi "generate sekarang") |
| Deploy Vercel + Supabase cloud, PWA bisa di-install | Billing, kuota, APK TWA, panel admin, evals lengkap |

## 2. Stack Sprint (lebih sederhana dari TECH-SPEC)
- **Satu app Next.js** (App Router, TS, Tailwind, shadcn/ui). **Tanpa** monorepo, Turborepo, worker, maupun pgmq.
- **Supabase cloud** (1 project, region Singapura): Postgres + RLS + pgvector + Auth. Migrasi lewat Supabase CLI (`supabase db push`).
- **AI:** Vercel AI SDK + Gemini (Flash-Lite untuk chat/narasi, Flash untuk konsultasi), embedding 768 dim.
- **Logika bisnis** di `src/core/` (fungsi murni + Vitest). Inilah satu-satunya bagian yang wajib dites.
- **Deploy:** Vercel, terhubung GitHub, auto deploy di `main` **sejak hari 1**.

Struktur:
```
src/app/(auth) (app)/[slug]/{beranda,kasir,stok,keuangan,pelanggan,chat,konsultasi,pengaturan}
src/app/w/[slug]        # widget chat publik
src/app/api/{chat,consult}/route.ts
src/core/{money,stock,finance,guardrails}.ts   + *.test.ts
src/ai/{models,prompts,tools,meter}.ts
src/db/{client,queries}.ts
supabase/migrations/*.sql   scripts/seed-demo.ts
```

## 3. Rencana Harian (target 6–8 jam/hari)

| Hari | Tanggal | Target | Selesai bila (DoD) |
|---|---|---|---|
| D1 | Rab 14 Okt | Setup repo, Supabase, Vercel; skema DB inti + RLS; auth; layout shell (bottom tab mobile + sidebar desktop) | URL Vercel bisa login dan masuk Beranda kosong |
| D2 | Kam 15 Okt | Katalog + varian + stok masuk; **seed demo 90 hari** (2 toko) | Login demo → produk & stok terlihat; `on_hand = Σ movements` (test) |
| D3 | Jum 16 Okt | POS + pelanggan; penjualan tersimpan atomik (sales, items dengan alokasi, movements) | Jual 3 item < 20 dtk, stok berkurang |
| D4 | Sab 17 Okt | `core/stock.ts` + `core/finance.ts` (rumus §7.1, §7.2, dekomposisi) + unit test; Beranda (4 kartu, tren 7 hari, stok menipis) | Semua test hijau; invarian Σ efek = ΔUntung lulus |
| D5 | Min 18 Okt | Layar Stock Intelligence & Financial Insight sesuai wireframe; narasi template + kartu "Insight untukmu" | Angka demo masuk akal; layar rapi di 390 px |
| D6 | Sen 19 Okt | Kebijakan toko + KB (FAQ teks); **Customer Chat widget** RAG + guardrail + eskalasi + inbox sederhana | 15 pertanyaan demo dijawab benar; minta diskon → eskalasi |
| D7 | Sel 20 Okt | **Konsultasi AI** (5 tools, grounding angka, streaming); "Insight minggu ini" (tombol generate) | 10 pertanyaan demo angka tepat |
| D8 | Rab 21 Okt | Polish UI, PWA manifest + ikon, loading/error state, **mode demo aman** (§5), deploy final, **feature freeze 21.00** | Skenario §4 lancar 3× berturut-turut di HP |
| Buffer | Kam 22 Okt | Perbaikan bug saja; rekam **video demo cadangan** | Video 3–5 menit tersimpan offline |
| Deck | Jum 23 Okt | Deck & latihan presentasi; perbaiki catatan proposal (BisniQu, halaman 4, nomor bagian) | Gladi 2× |
| Final | Sab 24 Okt | Presentasi | — |

**Aturan potong:** kalau hari X meleset > 3 jam, potong dari bawah prioritas: WA nomor test → insight mingguan → inbox → animasi/polish. **Jangan** memotong Finance & Stock Intelligence, karena itu inti pembeda.

## 4. Skenario Demo 5 Menit (yang dibangun = yang didemokan)
1. Buka PWA di HP → Beranda "Glow by Sari": penjualan hari ini, tren 7 hari, stok menipis.
2. Kasir: jual 2 Serum Vit C → kartu Beranda & stok berubah.
3. Stock Intelligence: "Serum Vit C habis ±3 hari lagi → pesan 40 pcs"; ada daftar barang lambat laku + modal tertahan.
4. Financial Insight: margin per kanal (TikTok paling tipis) + "Untung minggu ini turun Rp…: komisi TikTok −…, diskon −…".
5. Widget chat (layar kedua/HP juri): "serum vit c ready? bisa COD?" → dijawab; "kasih diskon dong" → eskalasi muncul di inbox.
6. Konsultasi: "Kenapa untungku turun minggu ini, harus ngapain?" → jawaban berbasis data + 2 saran.

Data seed **disetel** supaya semua cerita di atas benar: ada produk yang hampir habis, kanal TikTok dengan komisi tinggi, minggu terakhir dengan diskon besar, dan 2 produk lambat laku.

## 5. Mode Demo Aman (wajib D8)
- Flag `DEMO_SAFE=1`: jawaban AI untuk 10 pertanyaan skenario disimpan setelah sekali berhasil (cache by hash pertanyaan + versi data). Kalau LLM error/lambat > 8 dtk, cache yang dipakai.
- Tombol tersembunyi `/[slug]/pengaturan?reset-demo=1` mengembalikan data demo ke kondisi awal.
- Siapkan hotspot HP sendiri, dan video cadangan dari hari Buffer.

## 6. Checklist Akun (kerjakan D1 pagi, 30 menit)
- [ ] GitHub repo `wadar`
- [ ] Supabase project (Singapore) → URL, anon key, service role key
- [ ] Vercel → import repo, set env
- [ ] Google AI Studio API key (Gemini) + batas pengeluaran
- [ ] (Opsional D7) Meta developer app + nomor test WhatsApp
- [ ] `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `DEMO_SAFE`

---

## 7. Cara Hemat Token di Claude Code

### 7.1 Struktur dokumen
- `CLAUDE.md` di root **pendek** (versi sprint, ±50 baris). File ini dimuat di setiap sesi, jadi setiap baris ikut terbayar.
- Dokumen besar (`docs/BRD.md`, `PRD.md`, `TECH-SPEC.md`) **jangan dibaca utuh**. Rujuk bagiannya saja: "baca TECH-SPEC §7.2 saja".
- Satu file tugas per hari: `docs/sprint/D4.md` berisi tujuan, file yang disentuh, DoD (≤ 30 baris). Claude cukup membaca file itu.

### 7.2 Kebiasaan sesi
| Lakukan | Hindari |
|---|---|
| **1 tugas = 1 sesi**; `/clear` setelah tugas selesai & di-commit | Satu sesi panjang seharian |
| `/compact` saat konteks mulai penuh di tengah tugas | Membiarkan auto-compact di saat acak |
| Plan mode sekali di awal hari, lalu eksekusi | Minta plan ulang setiap langkah kecil |
| Model kuat untuk plan & debug sulit; model lebih hemat untuk eksekusi rutin (ganti via `/model`) | Model terbesar untuk mengedit CSS |
| Sebut path file persis: "edit `src/core/stock.ts`" | "cari di mana logika stok" (memicu baca banyak file) |
| Pakai generator: `npx shadcn add`, `supabase migration new`, `create-next-app` | Menyuruh Claude menulis komponen UI standar dari nol |
| Data seed dibuat lewat **skrip** (`scripts/seed-demo.ts`) | Meminta Claude menulis JSON data besar di chat |
| Test ringkas: `vitest run --reporter=dot`, build `next build 2>&1 \| tail -40` | Menempel log panjang ke chat |
| Minta "kerjakan, lalu ringkas ≤ 5 baris" | Minta penjelasan panjang setiap perubahan |
| Matikan MCP server yang tidak dipakai hari itu (definisi tool memakan konteks) | Semua MCP aktif terus |
| Tempel error **10–20 baris paling relevan** | Tempel seluruh stack trace + log |

### 7.3 Pengaturan `.claude/settings.json`
```json
{
  "permissions": {
    "deny": ["Read(./node_modules/**)", "Read(./.next/**)", "Read(./.env*)", "Read(./supabase/.temp/**)", "Read(./**/*.lock)", "Read(./pnpm-lock.yaml)"]
  }
}
```

### 7.4 Template prompt harian (tempel, ganti X)
```
Baca CLAUDE.md dan docs/sprint/DX.md saja. Rumus: TECH-SPEC §<nomor> (hanya bagian itu).
Plan singkat (≤ 10 poin, file yang disentuh), tunggu OK, lalu kerjakan.
Selesai = DoD di DX.md + `pnpm test` & `pnpm build` hijau. Laporan akhir ≤ 5 baris. Lalu commit.
```
