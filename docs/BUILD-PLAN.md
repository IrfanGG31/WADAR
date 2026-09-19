# BUILD PLAN — WADAR (untuk dikerjakan bersama Claude Code)

Urutan milestone dari nol sampai pilot 30 UMKM (MVP web PWA), lalu v1 dan aplikasi mobile. Setiap milestone punya **tujuan**, **cakupan**, **Definition of Done (DoD)**, dan **prompt siap tempel** untuk Claude Code.

> Cara pakai: taruh `PRD.md`, `ARCHITECTURE.md`, `BUILD-PLAN.md` di folder `docs/` dan `CLAUDE.md` di root repo. Kerjakan satu milestone per sesi (atau per beberapa sesi). Mulai setiap sesi dengan prompt milestone, minta Claude Code **membuat rencana dulu** (plan mode), setujui, baru eksekusi. Commit setelah DoD terpenuhi.

---

## Peta Milestone

| # | Milestone | Estimasi* | Pilar | Output yang bisa dicoba |
|---|---|---|---|---|
| M0 | Fondasi repo & platform | 1 minggu | — | Repo jalan lokal, CI hijau, health check |
| M1 | Identitas, tenant, shell aplikasi | 1 minggu | Semua | Daftar, buat toko, undang kasir, navigasi |
| M2 | Katalog & stok inti | 1 minggu | 2 | Tambah/impor produk, lihat stok |
| M3 | Kasir (POS online) & event order | 1 minggu | 2 | Jualan di kasir, stok berkurang |
| M4 | Ledger & keuangan dasar | 1 minggu | 1 | Pengeluaran, dompet, posting otomatis |
| M5 | Payment Listener + realtime + suara | 1 minggu | 1 | QRIS dibayar → notifikasi + suara |
| M6 | Insights & dasbor keuangan | 1 minggu | 1 | Beranda: uang masuk, untung, prediksi stok |
| M7 | Order Hub, impor marketplace, CRM | 1 minggu | 2 | Pesanan semua kanal + profil pelanggan |
| M8 | Business Brain I — Owner Assistant | 1,5 minggu | 3 | Tanya data, konsultasi, catat via chat, memori |
| M9 | Messaging + Customer Chat WA | 1,5 minggu | 3 | Pembeli dijawab AI di WA, inbox, eskalasi |
| M10 | Insight proaktif, laporan WA, onboarding | 1 minggu | Semua | Pengguna baru aha ≤ 15 menit |
| M11 | Billing, admin, hardening → PILOT | 1 minggu | — | Siap 30 UMKM pilot |
| M12+ | v1 (P1) lalu v2 aplikasi mobile | — | — | Lihat bagian akhir |

\* Estimasi kasar untuk 1 builder + Claude Code, fokus penuh. Kalau sambil kuliah, kalikan ±2.

---

## M0 — Fondasi repo & platform

**Tujuan:** kerangka monorepo yang benar sejak awal sehingga semua modul berikutnya tinggal mengikuti pola.

**Cakupan**
- pnpm workspaces + Turborepo; `apps/web`, `apps/api`, `apps/worker`; `packages/contracts`, `core`, `brand`, `config`, `ai` (kosong dulu).
- `infra/docker-compose.yml`: Postgres 16 + pgvector, Redis. Supabase CLI untuk auth lokal.
- NestJS (Fastify) di api & worker, Drizzle ORM, konfigurasi env tervalidasi Zod.
- Modul `platform`: outbox (tabel + relay ke BullMQ), `processed_events`, `idempotency_keys`, `audit_log`, event bus in-process dengan envelope (§4.2 ARCHITECTURE).
- Middleware correlation ID + pino logger + OpenTelemetry dasar + Sentry.
- `/health/live`, `/health/ready`.
- dependency-cruiser dengan aturan batas modul (§13 ARCHITECTURE).
- GitHub Actions: lint, typecheck, test, depcruise, build.
- `packages/brand`: nama "WADAR", tagline, warna, font — satu sumber.

**DoD**
- `pnpm dev` menjalankan web, api, worker; `pnpm test` hijau; CI hijau.
- Tes integrasi: event yang ditulis ke outbox terkirim tepat sekali ke handler dummy walau handler dipanggil 2× (idempotensi).
- Pelanggaran impor lintas modul membuat CI gagal.

**Prompt Claude Code**
```
Baca docs/PRD.md, docs/ARCHITECTURE.md (terutama §1, §3, §4, §11–§14), dan CLAUDE.md.
Kerjakan Milestone M0 di docs/BUILD-PLAN.md.
Buat rencana langkah demi langkah dulu dan tunggu persetujuanku. Periksa versi stabil terbaru
pustaka sebelum memasang. Sertakan tes integrasi outbox (idempotensi) dan aturan
dependency-cruiser untuk batas modul. Akhiri dengan ringkasan cara menjalankan lokal.
```

---

## M1 — Identitas, tenant, shell aplikasi

**Cakupan**
- Supabase Auth (OTP nomor HP, email, Google) di web; API memverifikasi JWT.
- Modul `identity`: tenants, outlets, memberships, roles & permissions, invitations.
- Guard tenant (`x-tenant-id`) + `set_config('app.tenant_id')` per transaksi + RLS policy template.
- Generator tes isolasi tenant (setiap route: tenant B tidak bisa baca/ubah data tenant A).
- Web shell: layout mobile-first (bottom tab: Beranda, Kasir, Pesanan, Asisten, Lainnya; sidebar di desktop), tombol "+" mengambang, halaman pengaturan toko & tim, pemilih outlet.
- `packages/ui-web` dari shadcn/ui dengan token brand; format Rupiah & tanggal Indonesia di `packages/core`.

**DoD**
- Pengguna bisa daftar, membuat toko + outlet, mengundang kasir; kasir hanya melihat menu sesuai peran.
- Tes isolasi tenant berjalan di CI.
- Lighthouse mobile ≥ 90 untuk halaman shell.

**Prompt**
```
Kerjakan M1 di docs/BUILD-PLAN.md mengikuti ARCHITECTURE §3 (identity), §5.1 (RLS), §9 (auth & RBAC).
Semua teks UI dalam Bahasa Indonesia sehari-hari (lihat PRD §4). Buat generator tes isolasi tenant
yang otomatis mencakup setiap route baru. Rencana dulu, lalu eksekusi.
```

---

## M2 — Katalog & stok inti

**Cakupan**
- `catalog`: produk, varian, kategori, SKU/barcode, foto (Supabase Storage), harga per kanal, HPP awal.
- Impor produk CSV/Excel dengan pratinjau & validasi per baris.
- `inventory`: stock_movements (append-only), stock_levels (proyeksi), penyesuaian manual, HPP rata-rata bergerak.
- Event `catalog.product.*`, `inventory.stock.changed`.
- UI: daftar produk dengan status stok (aman/menipis/kritis) **dan status kelengkapan data (HPP/foto/harga belum lengkap — dasar untuk insight kualitas katalog PRD F3.9, R4)**, detail + riwayat pergerakan, form tambah produk ≤ 30 detik.

**DoD**
- Impor 500 produk < 30 detik, baris invalid dilaporkan jelas.
- Setiap perubahan stok punya movement; saldo = Σ movement (tes properti).

**Prompt**
```
Kerjakan M2 (catalog & inventory) sesuai PRD O1, O4.1 dan ARCHITECTURE §3, §5.3.
Stok append-only via stock_movements, HPP moving average, stok boleh negatif dengan penanda.
Tulis tes properti bahwa stock_levels selalu = jumlah movement. Rencana dulu.
```

---

## M3 — Kasir (POS online) & event order

**Cakupan**
- `sales`: orders, order_lines, order_payments, channels (POS, WA, Shopee, TikTok Shop, Tokopedia, Lainnya).
- Layar Kasir: grid/pencarian produk, scan barcode (kamera web), keranjang, diskon, bayar tunai (kembalian) & transfer manual; QRIS menyusul di M5.
- Command `completeOrder` → tulis order + outbox `sales.order.completed` dalam satu transaksi; `Idempotency-Key` wajib.
- Handler inventory: kurangi stok (termasuk jika nanti ada resep).
- Struk digital (link publik bertanda tangan + tombol kirim WA via `wa.me`).
- Void/retur dengan audit log.

**DoD**
- Transaksi 3 item ≤ 20 detik; stok berkurang ≤ 1 detik setelah selesai.
- Mengirim request yang sama 2× (idempotency key sama) hanya membuat 1 order.

**Prompt**
```
Kerjakan M3 sesuai PRD O2.1–O2.3 dan ARCHITECTURE §4 (event order.completed) & §11 (Idempotency-Key).
UI kasir harus bisa dipakai satu tangan di layar 360px. Konsumsi event di modul inventory secara
idempoten. Tambah E2E Playwright untuk alur jual tunai. Rencana dulu.
```

---

## M4 — Ledger & keuangan dasar

**Cakupan**
- `finance`: akun template per tenant (saat `tenant.created`), journal_entries/lines dengan trigger keseimbangan, wallets.
- Handler posting: `order.completed` (pendapatan, HPP/persediaan, diskon), `order.cancelled/returned` (reversal).
- Pengeluaran cepat (nominal, kategori, dompet, catatan, foto struk) + aturan kategori sederhana.
- Transfer antar dompet (P1 boleh ditunda), laporan laba-rugi sederhana (query).

**DoD**
- Setiap entry seimbang (constraint DB + tes).
- Skenario uji: 10 penjualan + 3 pengeluaran → laba-rugi sesuai hitungan manual di fixture.

**Prompt**
```
Kerjakan M4 sesuai PRD F2 dan ARCHITECTURE §5.2. Uang BIGINT rupiah, double-entry dengan trigger
deferred Σdebit=Σkredit, append-only (koreksi = entri pembalik). Pengguna hanya melihat istilah
"uang masuk/keluar/untung", istilah akuntansi di Mode Lanjutan. Rencana dulu.
```

---

## M5 — Payment Listener + realtime + suara

**Cakupan**
- `payments`: integrasi Xendit (mode test) — QRIS dinamis di kasir, payment link; webhook dengan verifikasi token, `provider_events` unik, `incoming_payments`.
- Event `payments.payment.received` → finance (posting ke dompet), sales (matching → `order.paid`), notification.
- Realtime broadcast channel privat per tenant (Supabase Realtime) + hook klien `useTenantEvents`.
- Notifikasi uang masuk + **TTS Bahasa Indonesia** (`packages/core/terbilang` + Web Speech API), toggle per perangkat.
- Mode "Layar Kasir" (tampilan besar uang masuk terakhir) — **P0/wajib MVP sejak PRD v1.1 (R1)**, bukan boleh ditunda.
- Job rekonsiliasi intent pending tiap 15 menit.
- `packages/payment-parser` (port parser regex lama) + endpoint tempel teks notifikasi (fitur P1, boleh di balik flag).

**DoD**
- Pembayaran QRIS test → kasir melihat LUNAS + suara ≤ 3 detik (p95) tanpa refresh.
- Webhook duplikat tidak membuat posting ganda.
- Terbilang benar untuk 0 s/d 999.999.999.999 (tes tabel).
- Mode Layar Kasir menampilkan uang masuk terakhir dengan update realtime (P0, R1).

**Prompt**
```
Kerjakan M5 sesuai PRD F1 dan ARCHITECTURE §6. Gunakan Xendit mode test; catat di README bahwa
menerima dana atas nama merchant perlu skema sub-akun (xenPlatform). Realtime pakai broadcast
channel privat per tenant. Buat paket terbilang + TTS dengan tes tabel. Rencana dulu.
```

---

## M6 — Insights & dasbor keuangan

**Cakupan**
- `insights`: konsumen event → daily_sales_agg, daily_product_agg, daily_channel_agg, cashflow_agg; job rekonsiliasi malam vs ledger.
- Untung per produk & kanal (setelah HPP, diskon, komisi kanal yang dikonfigurasi per kanal).
- Forecast stok (EWMA) → `inventory.forecasts`, event `stock.low`.
- Beranda: **feed aksi ("Hari ini perlu perhatian") di posisi teratas** (PRD F3.8, R3) berisi peringatan prioritas — termasuk peringatan kualitas katalog (produk tanpa HPP/foto/harga, PRD F3.9, R4) — lalu 3 kartu keuangan (uang masuk, untung, saldo) dengan perbandingan + kalimat konteks (template deterministik dulu), grafik 7 hari.
- Halaman Keuangan (Ringkasan, Masuk/Keluar, Dompet, Untung per Produk/Kanal).

**DoD**
- Beranda p75 ≤ 1,5 detik di throttling "Fast 4G" Chrome.
- Angka kartu = hasil query ledger (tes rekonsiliasi).
- Produk dengan stok < 7 hari muncul di peringatan dengan estimasi hari.
- Feed aksi tampil di atas kartu keuangan dan mencakup peringatan kualitas katalog (produk tanpa HPP/foto/harga).

**Prompt**
```
Kerjakan M6 sesuai PRD F3.1, F3.3, F3.4, F3.8, F3.9, O4.2 dan ARCHITECTURE §5.4 (CQRS ringan) & §5.3
(forecast). Dasbor tidak boleh query tabel transaksi mentah — hanya agregat insights. Beranda = feed
aksi dulu (F3.8, R3 COMPETITORS.md), baru kartu keuangan. Kalimat konteks di kartu dibuat deterministik
(tanpa LLM) dulu. Rencana dulu.
```

---

## M7 — Order Hub, impor marketplace, CRM

**Cakupan**
- Daftar pesanan terpadu + filter kanal/status; status standar (PRD O3.2).
- Impor file ekspor Shopee, TikTok Shop, Tokopedia: parser berversi per format, pemetaan SKU (otomatis + koreksi manual tersimpan), pratinjau, komisi/ongkir dicatat.
- `crm`: upsert pelanggan dari order/WA (kunci nomor HP ternormalisasi +62), profil 360 (total belanja, terakhir beli, favorit), catatan & tag.

**DoD**
- Impor file contoh tiap marketplace (fixture di repo) menghasilkan order, stok, dan posting finance yang benar.
- Impor file sama 2× tidak menggandakan pesanan.

**Prompt**
```
Kerjakan M7 sesuai PRD O3.1–O3.3, O6.1, O6.5. Buat fixture file ekspor tiruan per marketplace
(struktur kolom realistis, data palsu) dan parser berversi. Dedupe berdasarkan nomor pesanan kanal.
Rencana dulu.
```

---

## M8 — Business Brain I: Owner Assistant

**Cakupan**
- `packages/ai`: abstraksi penyedia (Vercel AI SDK), router model per tugas, prompt templates berversi, pencatat biaya.
- `brain`: business_state projector (§7.2), threads/messages/summaries, memory_items (L2) + halaman "Yang WADAR tahu", tool registry (§7.4) versi owner: get_business_state, get_sales_summary, get_profit_breakdown, get_cashflow, get_stock, forecast_stockout, search_products, get_customer_360, list_orders, record_expense (approval), remember/forget.
- Pipeline §7.5 (assemble → route → orchestrate → guardrails numeric grounding → stream SSE → post-process).
- Action proposals + kartu konfirmasi di UI (§7.6).
- `evals/owner`: generator fixture toko + 200 pertanyaan dengan jawaban dihitung; runner + skor.
- Langfuse tracing.
- **Kanal WhatsApp read-only untuk pemilik (PRD A1.1, R2, v1.1 — minimal, bukan modul messaging penuh):** onboarding nomor WA dasar (WhatsApp Cloud API) khusus akun pemilik + webhook masuk → routing pesan ke pipeline Owner Assistant yang sama (§7.5) dalam **mode baca saja** (tool `sideEffect: write` diblokir di kanal ini). Infra WA lengkap (multi-percakapan, customer chat, inbox admin, ambil alih) tetap di M9 — modul `messaging` yang dibangun di sini hanya subset kecil yang dipakai ulang oleh M9, bukan duplikat.

**DoD**
- Eval owner ≥ 95% akurat; 0 angka tidak ter-grounding lolos guardrail.
- "Catat beli gula 5 kg 80 ribu tunai" → kartu konfirmasi → setelah setuju, pengeluaran & ledger tercatat.
- p50 jawaban ≤ 4 dtk, token pertama ≤ 1,5 dtk.
- Pemilik kirim pertanyaan data ke nomor WA WADAR → dapat jawaban read-only (mis. "untung minggu ini berapa?"); mencoba aksi tulis via WA ditolak dengan pesan yang mengarahkan ke aplikasi.

**Prompt**
```
Kerjakan M8 sesuai PRD §5.3 (A1, A3) dan ARCHITECTURE §7 secara lengkap. Prinsip wajib: AI tidak
pernah mengakses DB langsung — semua lewat tool bertipe yang memanggil port modul dengan cek izin.
Implementasikan numeric grounding guardrail dan eval set owner. Tambahkan kanal WA read-only untuk
pemilik (PRD A1.1, R2 COMPETITORS.md): subset minimal WhatsApp Cloud API (onboarding nomor + webhook)
yang akan dipakai ulang oleh modul messaging penuh di M9 — jangan bangun infra WA dua kali. Mulai
dengan rencana yang memecah M8 menjadi 3–4 sub-langkah yang masing-masing bisa diuji.
```

---

## M9 — Messaging + Customer Chat WhatsApp

**Cakupan**
- `messaging`: onboarding nomor WA (WhatsApp Cloud API, Embedded Signup bila tersedia), webhook (verifikasi signature, balas 200 cepat, proses async), conversations/messages, template, jendela layanan 24 jam.
- Inbox di web: daftar percakapan, status AI/Manusia, ambil alih/lepas, saran balasan AI, balas manual, **tab "Belum bisa dijawab" (PRD A2.10, R5) — pertanyaan yang gagal dijawab AI (confidence rendah/eskalasi), satu tap jadi FAQ/knowledge base baru**.
- Customer mode di brain: tool customer (search_products publik, get_stock terbatas, search_knowledge, get_order_status miliknya, escalate_to_human), knowledge base (upload dokumen + sinkron katalog → chunks + embedding, pencarian hibrida).
- Guardrail customer: filter data internal & PII, larangan janji di luar kebijakan, ambang keyakinan → eskalasi.
- Persona toko (sapaan, gaya, emoji) di pengaturan.
- Cache stok untuk jawaban cepat; kuota percakapan per paket (meter).
- `evals/customer` (300 pertanyaan vertikal kecantikan) + red-team 100 upaya bocor data.

**DoD**
- Eval customer ≥ 90%, red-team 0 kebocoran.
- Balasan p95 ≤ 10 dtk; eskalasi terkirim ke pemilik ≤ 5 dtk.
- Saat admin ambil alih, AI berhenti membalas percakapan itu sampai dilepas.
- Tab "Belum bisa dijawab" berisi semua pertanyaan yang dieskalasi karena confidence rendah; satu tap menyimpannya ke knowledge base.

**Prompt**
```
Kerjakan M9 sesuai PRD A2 (termasuk A2.10) dan ARCHITECTURE §4.4, §7.3–§7.5, §8 (baris WhatsApp).
Gunakan nomor test WhatsApp Cloud API. Mode customer wajib memakai tool dengan skema output publik
(tanpa HPP/margin/data pelanggan lain) plus pemeriksaan teks akhir. Sertakan eval customer dan
red-team. Pakai ulang kanal WA read-only pemilik yang sudah dibangun di M8 sebagai basis onboarding
nomor WA — jangan duplikasi. Rencana dulu, pecah jadi sub-langkah.
```
*(Saga checkout WA §4.5 + payment link = v1, boleh mulai di sini bila waktu cukup.)*

---

## M10 — Insight proaktif, laporan WA, onboarding

**Cakupan**
- Scheduler per zona waktu tenant: ringkasan pagi 06.30 (app + WA pemilik via template utility), ringkasan mingguan.
- Deteksi aturan (stock.low top-20, anomali z-score, margin negatif) → narasi LLM dengan evidence → dedupe → maks 3/hari; tombol "Lihat datanya"; tracking `insight_acted`.
- Onboarding wizard (PRD §7.1) + wawancara asisten 10 pertanyaan → memory_items + knowledge base.
- Demo store dengan data contoh 90 hari (generator).
- Event analytics PRD §12 ke PostHog.

**DoD**
- Pengguna uji (orang awam) menyelesaikan onboarding hingga melihat dasbor berisi datanya ≤ 15 menit.
- Tidak ada insight yang menyebut angka di luar evidence.

**Prompt**
```
Kerjakan M10 sesuai PRD F3.5, F5.1, A1.5, A3.3, X1, X2, §7.1, §12 dan ARCHITECTURE §7.8.
Pola: aturan deterministik mendeteksi, LLM hanya menarasikan data evidence. Buat generator demo
store 90 hari yang realistis (pola harian/mingguan, tanggal kembar). Rencana dulu.
```

---

## M11 — Billing, admin, hardening → PILOT

**Cakupan**
- `billing`: plans (**Gratis**/Starter/Growth/Pro — Gratis tanpa fitur AI, PRD §9, R6), trial 14 hari (untuk Starter/Growth/Pro), entitlement check (PRD §9) di API & UI, meter kuota (asisten, customer chat), pembayaran langganan via Xendit, invoice.
- Panel admin internal: cari tenant, status, biaya AI per tenant, feature flags, impersonasi baca-saja dengan audit.
- Ekspor & hapus data (UU PDP), halaman kebijakan privasi.
- Hardening: rate limiting, CSP, audit dependency, uji beban ringan (k6: 200 toko simulasi), backup & uji restore, alert (§10), runbook insiden.
- PWA install prompt, ikon, splash; aksesibilitas pass.

**DoD**
- Checklist keamanan ARCHITECTURE §9 terpenuhi; tes isolasi tenant 100% route.
- Uji beban: p95 API baca ≤ 300 ms pada 200 toko aktif simulasi.
- 30 akun pilot bisa dibuat dengan paket Growth gratis 8 minggu (kupon).

**Prompt**
```
Kerjakan M11 sesuai PRD §9, X6, X8, X14 dan ARCHITECTURE §9, §10, §12.2. Buat juga docs/RUNBOOK.md
(insiden: webhook gagal, AI down, DLQ penuh, selisih rekonsiliasi). Rencana dulu.
```

---

## Setelah Pilot

### v1 — Launch berbayar (semua fitur P1)
Urutan disarankan: offline POS (Dexie + `/v1/sync`) → split/kasbon & hutang-piutang → saga checkout WA + payment link → PO & supplier → skor kesehatan + proyeksi kas → OCR struk & foto→produk → segmen & broadcast → multi-outlet → voice assistant → automasi template → resep F&B & produk berseri/IMEI → ekspor laporan PDF/Excel & pembantu pajak.

### v2 — Aplikasi mobile (Expo)
1. `apps/mobile` dengan Expo Router, login, tenant switcher; pakai `@wadar/sdk`, `@wadar/core`, `@wadar/contracts`.
2. POS offline-first (expo-sqlite + antrian sinkron yang sama).
3. Push notification + TTS uang masuk (expo-speech), widget layar utama "uang masuk hari ini".
4. **Android NotificationListener** (modul native via Expo config plugin) → parser pembayaran → `/v1/payments/notifications` — ini fitur pembeda untuk QRIS statis.
5. Printer thermal Bluetooth ESC/POS, scan barcode kamera.
6. Rilis internal testing → Play Store (Android dulu), lalu iOS.

**Prompt pembuka v2**
```
Baca docs/ARCHITECTURE.md §1 (ADR-009), §6, §11 (offline sync), §13. Buat apps/mobile dengan Expo
yang memakai ulang packages/sdk, core, contracts, brand. Mulai dari login + Beranda + Kasir offline.
Rencana dulu; jelaskan bagian mana yang butuh development build (bukan Expo Go).
```

---

## Kebiasaan Kerja dengan Claude Code

- **Satu milestone = satu branch**, PR kecil per sub-langkah; minta Claude Code menjalankan `pnpm lint typecheck test depcruise` sebelum menyatakan selesai.
- Setiap keputusan arsitektur baru → minta Claude Code menulis ADR pendek di `docs/adr/NNN-judul.md`.
- Bila Claude Code ingin melanggar batas modul "demi cepat", tolak — minta lewat port atau event.
- Setelah tiap milestone, perbarui bagian "Status" di CLAUDE.md agar sesi berikutnya tahu posisi terakhir.
