Audit selesai: hanya membaca, tidak ada file yang diubah, tidak ada commit, dan tes tidak dijalankan. Jumlah tes di bawah dihitung dari baris `it(`/`test(`, jadi hanya perkiraan (±).

# A. Empat mesin AI

**1. Stock Intelligence: ADA & LENGKAP (inti); tidak sinkron dengan marketplace**
- **Kode:** rumus di `src/core/stock.ts:84-115` (`forecastStock`): laju jual per hari, sisa hari stok, titik pesan ulang, jumlah pesan ulang (baris 101), lambat laku (baris 104-108). Pembungkus untuk layar di `src/core/stock-insight.ts`.
- **Dari DB?** Ya. `src/db/stock.ts:37-95` membaca `variants` dan RPC `stock_daily_series` (`supabase/migrations/20261017025122_fin_stock_views.sql:38`). Narasinya template, bukan buatan model (`stock.ts:118`).
- **UI:** `stok/prediksi/page.tsx:63-91` dan kartu Beranda `beranda/page.tsx:213`.
- **Tes:** `stock.test.ts` ±11, `stock-insight.test.ts` ±15, `stock-level.test.ts` ±3, plus SQL `supabase/tests/02_stock_sales.sql`.
- **Kurang:** stok hanya satu angka per varian. Tidak ada sinkronisasi dengan marketplace (Tabel 3 "stok tidak sinkron antar-kanal"), jadi stok "sinkron" hanya kalau semua penjualan dicatat manual di Kasir.

**2. Finance Insight: ADA TAPI DANGKAL (peringatan margin tergerus belum ada)**
- **Kode:** `src/core/finance.ts:211` (penjelasan sebab perubahan untung, jumlahnya pas sampai rupiah), peringatan di `finance.ts:303-388` (`SELL_BELOW_COST`, `FEE_HEAVY`, `DISCOUNT_HEAVY`). Margin per kanal di `finance-insight.ts:386`, per produk di `:417`, narasi di `:290`.
- **Dari DB?** Ya. View `fin_daily`, `variants`, `channels`, `expenses` (`src/db/finance.ts:44-71`). Narasi template.
- **UI:** `keuangan/page.tsx:78`, `keuangan/margin/page.tsx:50-52`, `beranda/page.tsx:222`.
- **Tes:** `finance.test.ts` ±15, `finance-insight.test.ts` ±22, `money.test.ts` ±13.
- **Kurang:** "peringatan margin tergerus" berarti margin turun dibanding periode sebelumnya. Aturan itu (`MARGIN_DROP`) ditunda di `docs/BACKLOG.md:15`. Tiga aturan yang ada hanya melihat periode berjalan. Periode juga tetap 7 hari vs 7 hari (`BACKLOG.md:16`).

**3. Customer Chat (RAG): ADA TAPI DANGKAL**
- **Kode:** alur per giliran di `src/core/chat/pipeline.ts:83` (`runTurn`), pengaman jawaban di `guardrails.ts`, pencarian data di `retrieval.ts` (5 produk + 3 potongan KB), rute `src/app/api/widget/[slug]/stream/route.ts`.
- **Dari DB?** Ya, dari view `chat_product_cards` + `store_profile` + `kb_chunks`, dan jawaban dicek ulang terhadap harga/stok/sumber. Celah yang sudah diketahui (grounding angka, regex guardrail, embedding widget `null` di `src/db/widget-store.ts:99`) masih dalam perbaikan agen lain.
- **UI:** widget publik `src/app/w/[slug]/page.tsx`; kotak masuk pemilik `chat/page.tsx` dan `chat/[id]/page.tsx`.
- **Tes:** ±128 di `src/core/chat/*.test.ts` (guardrails ±30, retrieval ±17, text ±18, context ±13, widget ±12, dll.), ditambah `chat-offline` 2, `route.test` 1, `chat/actions.test` 2, SQL `05_chat.sql`.
- **Kurang:**
  - Tidak terhubung WhatsApp; hanya widget web.
  - Basis pengetahuan hanya FAQ yang diketik manual (`pengaturan/actions.ts:36`); tidak ada unggah dokumen kebijakan.
  - Eskalasi hanya mengubah status di kotak masuk (`inbox.ts:61`); pemilik tidak dikirimi notifikasi.

**4. Business Consultation: ADA & LENGKAP (dengan catatan)**
- **Kode:** `src/ai/consult.ts:137` (`createConsult`), 11 alat data di `src/core/consult/tools.ts:396`, pengecekan angka di `grounding.ts`, insight mingguan di `insights.ts:54`, rute `src/app/api/consult/route.ts:76`.
- **Dari DB?** Ya. `loadConsultData` (`src/db/consult.ts:36-42`) memakai loader keuangan + stok yang sama dengan layar. Setiap angka yang ditulis model harus cocok dengan hasil alat; kalau gagal dua kali, jawaban diganti template.
- **UI:** `konsultasi/page.tsx` + `consult-client.tsx`; insight di Beranda `beranda/page.tsx:195`.
- **Tes:** `consult.test` ±25, `grounding` ±23, `tools` ±20, `insights` ±15, `cache` ±7, `question` ±7, `demo-questions` 2, `consult-stream` 3, SQL `06_consult.sql`.
- **Kurang:** "insight proaktif mingguan" belum terjadwal. Hanya ada tombol "generate sekarang" (`BACKLOG.md:12`, tidak ada cron di `vercel.json` maupun migrasi). Kuota per paket belum ada (`BACKLOG.md:17`).

# B. Janji lain di PDF

- **[ADA & LENGKAP] Routing model (§C.1).** `src/ai/models.ts:20-28`: chat/intent/narasi/konsultasi cepat memakai `gemini-3.1-flash-lite`; konsultasi mendalam memakai `gemini-3-flash`, hanya lewat tombol + kuota 20% (`src/core/consult/question.ts:46-59`).
- **[ADA TAPI DANGKAL] Abstraksi penyedia LLM / multi-penyedia (§C.1, §E.2).** Ada satu pintu masuk `run()` (`src/ai/run.ts:107`), tapi tipe `ModelRef` hanya mengenal `google:` atau offline (`models.ts:16`), `AiDeps.providers` hanya `{ google? }` (`run.ts:87`), dan Konsultasi punya jalur Google sendiri (`src/ai/providers/google-consult.ts`). Menambah penyedia kedua berarti mengubah tipe di ketiga tempat itu. Penyedia kedua: tidak ada.
- **[ADA TAPI DANGKAL] Konteks RAG ±1.800 token (§C.1).** Ukuran konteks dibatasi lewat jumlah item (`retrieval.ts:14-15`: 5 produk, 3 KB), bukan token. `estimateTokens` (`src/core/chat/context.ts:121`) tidak dipanggil di mana pun.
- **[ADA TAPI DANGKAL] Caching jawaban FAQ dan ringkasan harian (§C.1).**
  - Chat tidak punya cache jawaban sama sekali.
  - Cache Konsultasi (`consult.ts:238-246`) hanya dibaca saat model gagal, jadi tidak mengurangi panggilan model. Cache-nya di memori per instance serverless.
  - Cache insight Beranda 1×/hari ditunda (`BACKLOG.md:17`).
- **[TIDAK ADA] WhatsApp Business Platform (§A.2, §C.1).** Hanya tipe `"whatsapp"` di `src/db/chat.ts:6` dan nilai enum kanal. Tidak ada webhook atau klien Graph API. Ditunda di `BACKLOG.md:11`.
- **[TIDAK ADA] Impor file marketplace / CSV katalog (§A.2, §C.2).** Tidak ada input file, parser CSV/XLSX, atau dependensinya di `package.json`. Ditunda di `BACKLOG.md:6,8`.
- **[TIDAK ADA] Meteran kuota per paket (§F.2 Tabel 23: 350×3 / 1.050×3 percakapan; 15+8 / 60+30 / 200+60 konsultasi + job insight).**
  - Tidak ada tabel paket/langganan.
  - Yang ada: pencatatan biaya per panggilan ke `ai_runs` (`src/ai/meter.ts:39`, `src/db/consult.ts:118-137`, `src/db/widget-store.ts:133`).
  - Hanya ada satu kuota: porsi mode mendalam 20% (`question.ts:46`). Tidak ada hitungan percakapan chat per bulan, dan "job insight" tidak dihitung terpisah (hanya tercatat di `ai_runs` dengan `tierReason: "weekly"`, `api/consult/route.ts:82`).
  - Ditunda di `BACKLOG.md:13` ("Billing, kuota").
- **[ADA TAPI DANGKAL] Tiga masalah Tabel 3 (§A).** Margin riil dan chat: ada (lihat A2, A3). Stok antar-kanal: kanal dan biayanya tercatat per penjualan (`supabase/migrations/20261014155912_core.sql:58-66`, pemilih kanal di `kasir/pos-screen.tsx:51`), tapi tanpa sinkronisasi dengan platform.
- **[ADA TAPI DANGKAL] Eskalasi chatbot (§C.3, §E.2).** Ambang keyakinan 0.6 ada (`src/core/chat/guardrails.ts:22,243`), tapi nilai keyakinannya dilaporkan sendiri oleh model (`src/ai/prompts/chat_reply.v1.ts:26`), bukan dari skor pencarian. Tidak ada notifikasi ke pemilik.
- **[ADA TAPI DANGKAL] Waktu balas chatbot < 10 detik (§C.3).** Batas waktu 8 detik per percobaan (`models.ts:43`), tapi bisa ada 2 percobaan (`pipeline.ts:81`), jadi kasus terburuk ±16 detik + waktu pencarian. Belum diukur di produksi.
- **[TIDAK ADA] Uji sampel mingguan oleh AI trainer (§E.2).** Tugas `judge` sudah ditulis (`src/ai/providers/google.ts:78`) tapi tidak dipanggil di mana pun. Golden set ditunda (`BACKLOG.md:17`).
- **[ADA & LENGKAP] Isolasi antar-tenant (§C.3).** RLS aktif di semua tabel tenant (`core.sql:242-245`, `chat.sql:171-181`, `consult.sql:34-35`); tes `supabase/tests/01_rls_isolation.sql`. Masalah penyisipan cross-tenant yang sudah diketahui sedang diperbaiki agen lain (migrasi `20261016193700`).
- **[TIDAK ADA] Data bisa diekspor/dihapus (§C.3).** Tidak ada aksi ekspor atau hapus toko/akun. Server action yang ada hanya profil, FAQ, reset demo, dan kendali chat. Ekspor laporan ditunda di `BACKLOG.md:10`.
- **[Tidak yakin] Enkripsi, uptime ≥99,5%, backup harian 30 hari (§C.3).** Ini urusan infrastruktur Supabase/Vercel, tidak terlihat dari kode. Perlu dicek paket Supabase dan dashboard oleh manusia.
- **[TIDAK ADA] Pentest tahunan, kebijakan privasi UU PDP (§E.2, Tabel 7).** Tidak ada halaman kebijakan privasi di `src/app`.
- **[ADA TAPI DANGKAL] POS/CRM ringan (§E.1 Tabel 19).** POS ada (`kasir/`). Halaman Pelanggan masih placeholder (`pelanggan/page.tsx`); data pelanggan hanya bisa ditanyakan lewat Konsultasi.
- **[TIDAK ADA] Free trial 14 hari, notifikasi, billing (§C.1 alur layanan).** Tidak ada kode trial atau pembayaran, dan tidak ada notifikasi push/email/WA untuk peringatan stok atau margin.
- **[ADA & LENGKAP] PWA (§A.2).** `src/app/manifest.ts` + tes. Service worker / mode offline ditunda (`BACKLOG.md:18`).

# C. Daftar pekerjaan agar "persis seperti PDF" (besar → kecil)

| # | Pekerjaan | Rujukan PDF | Ukuran | Kredensial eksternal |
|---|---|---|---|---|
| 1 | **Integrasi WhatsApp Business Platform**: webhook masuk, kirim balasan di jendela layanan 24 jam, notifikasi utility, pemetaan nomor ke toko, verifikasi tanda tangan | §A.2, §C.1 Tabel 9, Tabel 23 | ±10–15 file; migrasi (nomor WA per tenant, id pesan, status kirim) | **Ya**: Meta Business, WABA, nomor terverifikasi, access token, template utility disetujui |
| 2 | **Paket + meteran kuota + billing/trial**: tabel paket (Starter/Growth/Pro), hitung percakapan AI & konsultasi + job insight per bulan, blokir/turunkan saat kuota habis, trial 14 hari, pembayaran | §F.2 Tabel 16 & 23, §C.1 | ±12–18 file; migrasi (plans, subscriptions, usage counters) | **Ya**: payment gateway (Xendit/OY) |
| 3 | **Impor file marketplace + CSV/XLSX katalog** | §A.2, §C.2, Tabel 3 | ±8–12 file + parser (dependensi baru); migrasi (batch impor, mapping SKU, idempotensi) | Impor file: tidak. Impor otomatis lewat API (Fase 2): **Ya**, Shopee/TikTok Open Platform |
| 4 | **Abstraksi multi-penyedia LLM**: buka `ModelRef`/providers ke penyedia kedua, satukan jalur `google-consult` dengan `run()`, fallback antar-penyedia, harga di `meter.ts` | §C.1, §E.2, Tabel 13 | ±6–8 file; tanpa migrasi | **Ya**: API key penyedia kedua (dan kunci Gemini, yang juga belum ada) |
| 5 | **Insight proaktif mingguan terjadwal + notifikasi** (cron, kirim ke pemilik via email/WA/app) | §A Tabel 3, Misi 1 | ±4–6 file; migrasi (pg_cron atau Vercel Cron + log kirim) | Email: Resend masih mode uji, perlu domain terverifikasi; WA: sama dengan item 1 |
| 6 | **Ekspor & hapus data tenant** (ekspor ZIP/CSV, hapus toko bertahap + penghapusan permanen) + halaman kebijakan privasi | §C.3 Tabel 10, §E.2, Tabel 7 | ±5–7 file; migrasi (RPC hapus tenant / soft-delete) | Tidak |
| 7 | **Eskalasi ke pemilik dengan notifikasi** (push/email/WA saat chat dieskalasi) | Tabel 3, §C.3 | ±3–5 file; migrasi kecil (preferensi notifikasi) | Web push: VAPID key (bisa dibuat sendiri); email/WA seperti di atas |
| 8 | **Peringatan margin tergerus** (`MARGIN_DROP` ≥5 poin vs 4 minggu, `MISSING_COST`) + pilihan periode | Tabel 3 Finance Insight | ±3–4 file (`finance.ts`, `finance-insight.ts`, halaman margin, tes); tanpa migrasi | Tidak |
| 9 | **Halaman Pelanggan (CRM ringan)**: daftar, riwayat, pelanggan lama tidak belanja | Tabel 19 Fase 1 | ±3–4 file; tanpa migrasi (tabel `customers` sudah ada) | Tidak |
| 10 | **Cache jawaban sungguhan**: cache FAQ chat + cache insight harian bersama lintas instance, dibaca sebelum memanggil model | §C.1 Tabel 9, §E.2 | ±4–5 file; migrasi (tabel cache) atau KV | Tidak (kecuali KV Vercel) |
| 11 | **Uji sampel mingguan**: panggil `judge` atas sampel chat, golden set, laporan akurasi | §E.2, KPI akurasi ≥90% | ±4–6 file; migrasi (tabel eval) | Butuh kunci Gemini |
| 12 | **Batas konteks RAG ±1.800 token**: pakai `estimateTokens` untuk memangkas konteks | §C.1 | 1–2 file; tanpa migrasi | Tidak |
| 13 | **Waktu balas < 10 detik terjamin**: batas waktu total per giliran, bukan per percobaan | §C.3 | 1–2 file; tanpa migrasi | Tidak |
| 14 | **Ambang keyakinan dari skor pencarian**: gabungkan `retrievalScore` dengan keyakinan dari model | §E.2 | 1–2 file; tanpa migrasi | Tidak |

Yang tidak bisa dipastikan dari kode dan perlu dicek manusia: enkripsi, backup harian 30 hari, dan uptime. Itu bergantung pada paket Supabase/Vercel (dashboard Supabase project `kuerbreijqcdvmxvvkxh`).