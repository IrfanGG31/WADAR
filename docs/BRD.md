# BRD — WADAR AI
### Business Requirements Document: Integrasi AI, POS, dan CRM sebagai Intelligent Business Ecosystem untuk UMKM

| Meta | Isi |
|---|---|
| Penulis | M. Irfan Rafi Gunawan, Mashayu Aulia Zahrina (Universitas Airlangga) |
| Tanggal | 14 Oktober 2026 |
| Status | Draft v2.0, diturunkan dari proposal finalis BPC |
| Sumber utama | Proposal *"WADAR: Integrasi Artificial Intelligence, POS, dan CRM sebagai Intelligent Business Ecosystem untuk Mendorong Data-Driven Decision Making pada UMKM"* (disebut **Proposal**; nomor tabel merujuk ke sana) |
| Dokumen turunan | `PRD.md` (kebutuhan produk) → `TECH-SPEC.md` (realisasi teknis) → `CLAUDE.md` (aturan build) |
| Menggantikan | `PRD.md` v1, `ARCHITECTURE.md` v1, `BUILD-PLAN.md` v1. `COMPETITORS.md` tetap berlaku sebagai acuan |

> **Aturan dokumen:** BRD menjawab *kenapa* dan *apa yang harus dicapai bisnis*. Setiap kebutuhan bisnis (BR-xx) dilacak ke fitur PRD. Kalau PRD/TECH-SPEC bertentangan dengan BRD, **BRD yang menang** sampai BRD direvisi.

---

## 1. Ringkasan Eksekutif

UMKM Indonesia sudah digital (±25,55 juta), tetapi data transaksi mereka jarang berubah menjadi keputusan. WADAR AI adalah PWA yang terhubung ke WhatsApp Business Platform. Isinya **POS/CRM ringan** sebagai pengumpul data, ditambah **empat mesin AI** yang memakai satu knowledge base per toko:

1. **AI Stock Intelligence**: laju jual, estimasi tanggal habis, saran jumlah pesan ulang, deteksi barang lambat laku.
2. **AI Finance Insight**: margin per produk dan per kanal, penjelasan sebab-akibat dalam bahasa sederhana, peringatan margin tergerus.
3. **AI Customer Chat (RAG)**: menjawab pembeli 24 jam berdasarkan katalog, stok, dan kebijakan toko. Pertanyaan di luar cakupan dieskalasi ke pemilik.
4. **AI Business Consultation**: tanya-jawab bebas ("kenapa untung turun?") dan insight proaktif mingguan.

Semuanya dalam satu langganan Rp79–399 ribu/bulan, sepertiga sampai seperlima harga paket POS besar.

**Target bisnis:** pilot 30 UMKM (Q1-2027), peluncuran berbayar April 2027, 299 pelanggan berbayar di akhir 2027, dan 8.404 di 2031. EBITDA positif mulai Mei 2029.

---

## 2. Latar Belakang & Masalah Bisnis (Proposal Tabel 3)

| # | Masalah | Bukti | Dampak bisnis bagi UMKM | Jawaban WADAR |
|---|---|---|---|---|
| P1 | Stok tidak sinkron antar-kanal; pencatatan manual/terpisah per platform | Stockout saat permintaan naik | Penjualan hilang, peringkat toko turun; overstock mengikat modal dan menambah risiko kedaluwarsa | Stock Intelligence |
| P2 | Pemilik hanya melihat omzet; margin riil tidak diketahui | Literasi keuangan 66,46% vs inklusi 80,51% (OJK & BPS, 2025) | Diskon dan harga ditetapkan tanpa data | Finance Insight |
| P3 | Chat pelanggan menumpuk dengan pertanyaan berulang (stok, harga, ongkir, status) | 75% UMKM e-commerce kesulitan di layanan purna jual (Kemenkop UKM–iDEA, 2022) | Respons lambat menurunkan konversi; butuh admin | Customer Chat (RAG) |
| P4 | Tidak ada analis bisnis; masalah baru terlihat setelah rugi | Mayoritas UMKM tidak mampu merekrut analis | Keputusan reaktif | Business Consultation |

**Akar masalah:** ada kesenjangan antara data yang dimiliki dan kemampuan mengubahnya menjadi tindakan. **Peluang teknologi:** LLM + RAG menghasilkan jawaban yang berpijak pada data toko sendiri, dan model kelas ringan sekarang murah (Gemini 3.1 Flash-Lite US$0,25 per 1 juta token input).

---

## 3. Tujuan Bisnis (SMART)

| ID | Tujuan | Target | Batas waktu | Cara ukur |
|---|---|---|---|---|
| BO-1 | Pelanggan berbayar | 299 (2027) → 1.316 (2028) → 3.099 (2029) → 5.524 (2030) → 8.404 (2031) | Akhir tiap tahun | Subscription aktif berbayar |
| BO-2 | Akurasi jawaban chatbot | ≥ 90% (pilot) → 92/93/94 → ≥ 95% (2031) | Pilot Q1-2027 | Uji sampel mingguan oleh AI trainer (definisi di PRD §7.4) |
| BO-3 | Dampak stok | ≥ 60% pengguna melaporkan penurunan kejadian stockout | 6 bulan setelah mulai berlangganan | Survei in-app + data stockout tercatat |
| BO-4 | Profitabilitas | EBITDA positif berkelanjutan | Mei 2029 | Laporan keuangan |
| BO-5 | Retensi | Churn bulanan 6,0% (2027) → 5,0 → 4,5 → 4,0 → 3,5% (2031) | Tahunan | Pelanggan berhenti ÷ pelanggan awal bulan |
| BO-6 | Konversi trial | ≥ 20% (2027–2028) → 22 → 24 → 25% | Tahunan | Trial → berbayar dalam 30 hari |
| BO-7 | Kualitas layanan | NPS ≥ 30 (2027) → ≥ 50 (2031); uptime 99,5% → 99,9% (2030+) | Tahunan | Survei NPS kuartalan; monitoring uptime |
| BO-8 | Validasi pilot | Akurasi chatbot ≥ 90% dan ≥ 40% pilot bersedia berlangganan | Akhir pilot 8 minggu | Eval + survei kesediaan bayar |

---

## 4. Ruang Lingkup Bisnis

### 4.1 Termasuk (Fase 1, MVP s/d peluncuran April 2027)
- PWA (web, bisa di-install di HP) + integrasi WhatsApp Business Platform + widget chat toko online.
- POS ringan, CRM ringan, manajemen katalog & stok, manajemen akun & langganan (Proposal Gambar 4, lapisan aplikasi).
- Impor file ekspor marketplace (manual upload).
- Empat mesin AI (§1).
- Notifikasi via WhatsApp/email/in-app.
- Free trial 14 hari, tiga paket, add-on kuota chat, paket tahunan, referral, harga early adopter.

### 4.2 Tidak termasuk di Fase 1 (sengaja ditunda)
| Fitur | Fase | Alasan |
|---|---|---|
| Deteksi churn pelanggan toko | Fase 2 (2027–2028) | Butuh riwayat transaksi ≥ 3 bulan |
| Impor marketplace otomatis (API resmi) | Fase 2 | Butuh kemitraan & izin API marketplace |
| AI Marketing Assistant (draf konten) | Fase 2 | Bukan masalah inti P1–P4 |
| Simulasi what-if harga/promo | Fase 3 (2029–2031) | Butuh data historis cukup |
| AI Agent dengan persetujuan (mis. draf PO ke pemasok) | Fase 3 | Fase 1 AI bersifat **read-only + eskalasi** |
| Paket & dasbor B2B2B | Fase 3 (kontrak mulai 2028) | Data model disiapkan sejak awal, UI belakangan |
| Akuntansi formal penuh, payroll, multi-outlet/gudang | Di luar cakupan | Bukan positioning WADAR (lihat Proposal Tabel 15) |
| Aplikasi native iOS/Android | Di luar Fase 1 | PWA + paket APK berbasis PWA (TWA) cukup; native dievaluasi di Fase 2 |

---

## 5. Pemangku Kepentingan

| Pemangku kepentingan | Peran / kepentingan | Kebutuhan utama |
|---|---|---|
| Pendiri: CEO, CTO, CMO, CFO/COO | Strategi & pendanaan; arsitektur AI; pemasaran & kemitraan; keuangan, legal & operasional | Produk siap pilot tepat waktu; biaya AI terkendali |
| Software/AI engineer (1 orang di 2027) | Fitur, pipeline RAG, keamanan | Spesifikasi jelas, stack sederhana |
| Customer success (1 per 500 pelanggan) | Onboarding, dukungan, retensi | Panel admin, data kesehatan akun |
| AI trainer & QA (mulai 2029; di 2027 dirangkap tim) | Kualitas jawaban, uji sampel mingguan | Antrean review jawaban + metrik akurasi |
| **Pemilik UMKM** (persona Sari & Dimas) | Pengguna utama, pembayar | Tahu stok, untung riil, chat terjawab |
| Staf/admin toko | Kasir, admin chat | Kasir cepat, inbox chat, hak akses terbatas |
| **Pembeli** (pelanggan UMKM) | Bertanya via WA/widget | Jawaban cepat dan benar |
| Mitra B2B2B (koperasi, bank, dinas, inkubator) | Kanal akuisisi (kontrak Rp60 juta/100 UMKM × 6 bulan) | Laporan agregat binaan (Fase 3) |
| Vendor | Meta (WhatsApp), Google (Gemini), penyedia cloud, payment gateway (Xendit/OY!) | Kepatuhan kebijakan & tarif |
| Regulator | Komdigi (PSE), DJP (NPWP, PPN), DJKI (merek), Kemenkum/BKPM (NIB) | Kepatuhan UU PDP 27/2022 dan perpajakan |
| Juri & investor (pre-seed Jan-2027, seed Feb-2028) | Penilaian kelayakan | Bukti traksi: MRR, churn, akurasi |

---

## 6. Persona & Segmen Target (Proposal Tabel 14)

- **Segmen utama:** UMKM berkembang lintas kanal, omzet ±Rp5–100 juta/bulan, sektor fesyen, F&B, dan kecantikan di Surabaya Raya dan Malang.
- **Segmen sekunder:** UMKM pemula satu kanal (paket Starter); UMKM menengah tanpa analis (paket Pro).
- **Sari, 27 (brand skincare, Surabaya):** Shopee, TikTok Shop, Instagram, WhatsApp; 2 admin. Masalahnya produk terlaris habis saat kampanye tanggal kembar dan ratusan chat berulang. Paket Growth.
- **Dimas, 34 (kedai kopi & camilan, Malang):** dine-in, ojek online, pre-order WA; 5 karyawan. Masalahnya omzet besar tetapi kas tidak bertambah dan bahan baku terbuang. Paket Growth → Pro.

**Positioning:** *"Asisten AI yang ngerti tokomu: bukan sekadar mencatat, tetapi memperingatkan dan menjawab."*

---

## 7. Kebutuhan Bisnis (Business Requirements)

Prioritas: **M** = Must (Fase 1), **S** = Should (sebelum peluncuran berbayar April 2027), **C** = Could (Fase 2+).

| ID | Kebutuhan bisnis | Prioritas | Sumber | Dilacak ke PRD |
|---|---|---|---|---|
| BR-01 | Pengguna bisa mendaftar dan mencoba gratis 14 hari tanpa kartu/metode bayar | M | Proposal C.1 | ONB-1, BIL-1 |
| BR-02 | Data toko bisa masuk lewat POS ringan **dan** impor file marketplace | M | Proposal A.2 | POS-*, IMP-* |
| BR-03 | Katalog dan kebijakan toko diunggah sekali, lalu menjadi knowledge base per toko yang dipakai bersama oleh keempat mesin AI | M | Proposal A.2 | KB-* |
| BR-04 | Sistem memberi peringatan dini stok: estimasi tanggal habis, saran jumlah pesan ulang, barang lambat laku | M | Tabel 3 | STK-* |
| BR-05 | Sistem menampilkan margin riil per produk dan per kanal setelah HPP, komisi, dan diskon, dalam bahasa sederhana dengan penjelasan sebab-akibat | M | Tabel 3 | FIN-* |
| BR-06 | Pembeli mendapat jawaban 24 jam via WhatsApp dan widget berdasarkan katalog, stok, dan kebijakan toko; pertanyaan di luar data toko dieskalasi ke pemilik | M | Tabel 3, Tabel 10 | CHT-* |
| BR-07 | Pemilik bisa bertanya bebas tentang bisnisnya dan menerima insight proaktif mingguan | M | Tabel 3 | CON-* |
| BR-08 | CRM ringan: data pelanggan terkumpul otomatis dari transaksi dan chat | M | Gambar 4 | CRM-* |
| BR-09 | Biaya variabel (AI + WA + cloud) per pelanggan tidak melebihi batas di §9 | M | Tabel 16, 23 | NFR-COST |
| BR-10 | Penyedia LLM bisa diganti tanpa mengubah fitur | M | Proposal C.1, SWOT | TECH-SPEC §6 |
| BR-11 | Data antar-toko terisolasi, terenkripsi, tidak dijual, dan bisa diekspor/dihapus (UU PDP) | M | Tabel 10 | SEC-* |
| BR-12 | Akurasi chatbot bisa diukur mingguan lewat uji sampel | M | Tabel 20, 21 | QA-* |
| BR-13 | Paket, kuota, dan pembayaran langganan berjalan otomatis (VA/QRIS) | S | Tabel 16, 22 | BIL-* |
| BR-14 | Laporan nilai bulanan (waktu dan kerugian yang dihemat) untuk menekan churn | S | Tabel 13 | VAL-1 |
| BR-15 | Program referral (1 bulan gratis bagi pengajak) dan harga early adopter untuk 100 pelanggan pertama | S | Proposal D.5 | BIL-5, BIL-6 |
| BR-16 | Widget chat mandiri sebagai kanal cadangan bila WhatsApp bermasalah | S | TOWS W–T | CHT-8 |
| BR-17 | Panel internal untuk customer success dan AI trainer | M | Tabel 8 | ADM-* |
| BR-18 | Analitik corong (trial → aktivasi → berbayar → churn) untuk memantau CAC, churn, dan margin kontribusi bulanan | M | Penutup, saran 3 | ANL-* |
| BR-19 | Data model siap untuk mitra B2B2B (satu mitra membina banyak toko) | C | TOWS S–O | TECH-SPEC §4 |
| BR-20 | Aplikasi bisa dipasang di HP Android sebagai APK | S | Permintaan pemilik produk | PWA-2 |

---

## 8. Aturan Bisnis (Business Rules)

### 8.1 Paket & harga (Proposal Tabel 16)
| Aturan | Starter | Growth | Pro |
|---|---|---|---|
| Harga/bulan (belum PPN) | Rp79.000 | Rp199.000 | Rp399.000 |
| Asumsi komposisi pelanggan | 40% | 45% | 15% |
| Customer Chat (percakapan/bulan) | — (tidak tersedia) | 1.000 | 3.000 |
| Konsultasi AI (pertanyaan/bulan) | 30 | 150 | Wajar tanpa batas (fair use, lihat BRL-04) |
| Pengguna/staf | 1 | 3 | 10 |
| Dukungan | Pusat bantuan, ≤ 24 jam | Chat jam kerja, ≤ 24 jam | Prioritas ≤ 4 jam |
| Stock Intelligence & Finance Insight | Tersedia | Tersedia | Tersedia |

### 8.2 Aturan
| ID | Aturan |
|---|---|
| BRL-01 | Paket tahunan = bayar 10 bulan (diskon 2 bulan). Asumsi 25% pelanggan memilih tahunan. |
| BRL-02 | Add-on: +500 percakapan Customer Chat seharga Rp50.000, berlaku sampai akhir periode tagihan. Asumsi 12% pelanggan membeli. |
| BRL-03 | **Satu "percakapan"** = rangkaian pesan dengan satu pembeli dalam jendela 24 jam sejak pesan pembeli pertama. Pesan berikutnya setelah jendela tutup dihitung percakapan baru. Ini selaras dengan pengertian jendela layanan WhatsApp. |
| BRL-04 | Fair use Pro: 1.500 pertanyaan konsultasi/bulan. Di atas itu jawaban tetap dilayani dengan model kelas ringan saja. |
| BRL-05 | Saat kuota hampir habis (80%), pemilik diberi notifikasi. Saat habis, Customer Chat membalas pesan sopan bahwa admin akan menjawab, lalu mengeskalasi. **Fitur inti (POS, stok, keuangan) tidak pernah diblokir karena kuota.** |
| BRL-06 | Harga ditampilkan **belum termasuk PPN**. PPN hanya ditagihkan jika WADAR sudah PKP (proyeksi 2029, omzet > Rp4,8 M). Selama belum PKP, invoice tidak boleh memuat PPN. |
| BRL-07 | Free trial 14 hari dengan hak akses setara Growth. Setelah trial berakhir tanpa pembayaran: akun **read-only 30 hari** (data tetap bisa dilihat dan diekspor), lalu dinonaktifkan. Data dihapus 90 hari setelah nonaktif, kecuali pengguna meminta lebih cepat. |
| BRL-08 | Early adopter: 100 pelanggan berbayar pertama mendapat harga khusus (besaran ditentukan tim, default diskon 30% selama 12 bulan). |
| BRL-09 | Referral: pengajak mendapat 1 bulan gratis untuk setiap toko yang ia ajak dan yang membayar tagihan pertamanya. |
| BRL-10 | Penagihan dimulai April 2027. Pilot Jan–Mar 2027 gratis (insentif pilot). |
| BRL-11 | Metode bayar langganan: Virtual Account (± Rp4.000/transaksi) dan QRIS (0,7%). Asumsi biaya gateway campuran 2,2% dari tagihan. |
| BRL-12 | Customer Chat **hanya** menjawab berdasarkan data toko (katalog, stok, kebijakan, dokumen). Di luar itu wajib eskalasi ke pemilik. AI tidak boleh menjanjikan diskon, garansi, atau pengecualian kebijakan. |
| BRL-13 | Di Fase 1, AI **tidak mengeksekusi aksi** yang mengubah data atau mengirim pesan atas nama pemilik ke pihak ketiga, kecuali membalas pertanyaan pembeli sesuai BRL-12. |
| BRL-14 | Balasan ke pembeli dikirim di dalam jendela layanan WhatsApp (gratis). Pesan berbayar (template utility) dibatasi untuk notifikasi ke pemilik sesuai anggaran §9. |
| BRL-15 | Backup harian dengan retensi 30 hari. |
| BRL-16 | Pengguna bisa mengekspor seluruh data tokonya (CSV/JSON) dan menghapus akun kapan saja. |

---

## 9. Batasan Ekonomi Unit (wajib dipatuhi produk)

Biaya variabel per pelanggan per bulan (Proposal Tabel 23) menjadi **anggaran teknis**. Alarm berbunyi saat rata-rata 7 hari melewati 120% anggaran.

| Komponen | Starter | Growth | Pro |
|---|---|---|---|
| Volume AI yang diasumsikan | 15 konsultasi + 8 job insight | 350 percakapan terjawab × 3 balasan; 60 konsultasi + 30 job | 1.050 × 3 balasan; 200 konsultasi + 60 job |
| Token input / output per bulan | 0,12 jt / 0,01 jt | 2,37 jt / 0,16 jt | 7,03 jt / 0,48 jt |
| **Anggaran biaya AI** | **Rp1.039** | **Rp19.924** | **Rp59.257** |
| Notifikasi WA utility (Rp357/pesan) | 4 pesan = Rp1.427 | 10 pesan = Rp3.567 | 20 pesan = Rp7.133 |
| Cloud per tenant | Rp2.500 | Rp5.000 | Rp9.000 |
| **Total biaya variabel** | **Rp4.966 (6,3%)** | **Rp28.491 (14,3%)** | **Rp75.390 (18,9%)** |
| Margin kontribusi sebelum CS & payment | 93,7% | 85,7% | 81,1% |

**Asumsi turunan yang mengikat desain:**
- Konteks RAG ±1.800 token per jawaban (Proposal Tabel 9).
- Model utama: kelas ringan (Gemini 3.1 Flash-Lite, US$0,25 input / US$1,50 output per 1 juta token). Model besar hanya untuk analisis.
- Kurs perencanaan Rp18.000/US$; PPN layanan digital luar negeri 11% efektif; buffer 20% untuk retry dan embedding.
- Caching jawaban FAQ dan ringkasan harian wajib.

---

## 10. KPI & Metrik Keberhasilan

### 10.1 KPI bisnis (Proposal Tabel 21)
| Indikator | 2027 | 2028 | 2029 | 2030 | 2031 |
|---|---|---|---|---|---|
| Pelanggan berbayar (akhir tahun) | 299 | 1.316 | 3.099 | 5.524 | 8.404 |
| Churn bulanan | 6,0% | 5,0% | 4,5% | 4,0% | 3,5% |
| Konversi trial → berbayar | ≥ 20% | ≥ 20% | ≥ 22% | ≥ 24% | ≥ 25% |
| Margin kotor | 57% | 73% | 74% | 74% | 73% |
| Akurasi chatbot (uji sampel) | ≥ 90% | ≥ 92% | ≥ 93% | ≥ 94% | ≥ 95% |
| NPS / uptime | ≥ 30 / 99,5% | ≥ 35 / 99,5% | ≥ 40 / 99,5% | ≥ 45 / 99,9% | ≥ 50 / 99,9% |

### 10.2 Unit economics (Proposal Tabel 30)
CAC Rp500 rb (2027) → Rp350 rb (2031); LTV Rp2,22 jt → Rp3,08 jt; LTV:CAC 4,4× → 8,8×; payback CAC 3,3 → 2,3 bulan. Margin kontribusi Rp149.395/pelanggan/bulan.

### 10.3 Metrik produk yang harus bisa dihitung sistem sejak hari pertama
- Aktivasi: % trial yang dalam 48 jam (a) mengisi ≥ 10 produk dan (b) mencatat/impor ≥ 1 transaksi.
- Customer Chat: akurasi sampel, tingkat eskalasi, waktu balas p95, percakapan terjawab AI.
- Stok: jumlah peringatan stok, peringatan yang ditindaklanjuti (restock sebelum tanggal habis), dan hari stockout per produk.
- Biaya: biaya AI dan WA per tenant per bulan dibanding anggaran §9.
- Corong: trial → aktivasi → berbayar → churn; MRR.

---

## 11. Kepatuhan & Legal (Proposal Tabel 7)

| Kewajiban | Instansi | Waktu | Dampak ke produk |
|---|---|---|---|
| PT Perorangan + NIB (OSS RBA) | Kemenkum / BKPM | Q4-2026 | Syarat verifikasi bisnis Meta (WhatsApp) dan akun payment gateway |
| NPWP badan | DJP | Q4-2026 | Invoice |
| Pendaftaran merek WADAR | DJKI | Q4-2026 | Nama brand dikunci di `packages/brand` |
| PSE lingkup privat | Komdigi | Q1-2027 | **Wajib sebelum peluncuran berbayar** |
| Kebijakan privasi & DPA (UU 27/2022) | Internal | Sebelum pilot | Halaman privasi, persetujuan, ekspor/hapus data |
| Konversi ke PT & PKP PPN | Kemenkum / DJP | 2028–2029 | Flag `is_pkp` mengaktifkan PPN di invoice (BRL-06) |

Ketentuan data: data toko tidak dijual dan tidak dipakai melatih model pihak ketiga. Gunakan API berbayar yang tidak memakai data untuk pelatihan. Backup harian dengan retensi 30 hari, enkripsi, dan isolasi tenant.

---

## 12. Rencana Validasi (Proposal Tabel 18) & Roadmap (Tabel 19)

| Tahap | Waktu | Metode & sampel | Kriteria lolos |
|---|---|---|---|
| Masalah | Q4-2026 | Survei 100 UMKM + 20 wawancara mendalam | ≥ 60% mengalami ≥ 2 dari 3 masalah inti |
| Harga | Q4-2026 | Van Westendorp, 100 responden | Rentang wajar mencakup Rp79–199 rb |
| Solusi | Q4-2026 | Uji kegunaan wireframe, 20 pemilik usaha | ≥ 70% berminat mencoba |
| **Pilot MVP** | **Jan–Mar 2027** | **30 UMKM, 8 minggu** | **Akurasi chatbot ≥ 90%; ≥ 40% bersedia berlangganan** |
| Peluncuran berbayar | April 2027 | — | 20 pelanggan baru di bulan pertama (Proposal Lampiran 1) |

| Fase | Waktu | Fitur | Target |
|---|---|---|---|
| 1 — MVP | Q4-2026 – Q1-2027 | POS/CRM ringan, Stock Intelligence, Finance Insight, Customer Chat RAG, Business Consultation | Pilot 30 UMKM; berbayar April 2027 |
| 2 — Retensi | 2027–2028 | Deteksi churn pelanggan toko, impor otomatis marketplace, AI Marketing Assistant | 1.316 pelanggan; churn ≤ 5% |
| 3 — Skala | 2029–2031 | Simulasi what-if, AI Agent dengan persetujuan, paket B2B2B | 8.404 pelanggan; 8 kontrak B2B2B/tahun |

---

## 13. Risiko Bisnis (Proposal Tabel 20) → Kebutuhan Mitigasi di Produk

| Risiko | Mitigasi bisnis | Kebutuhan produk |
|---|---|---|
| Halusinasi chatbot | Batasi ke knowledge base, ambang keyakinan, eskalasi, uji sampel mingguan | CHT-4, CHT-5, QA-1..3 |
| Kenaikan biaya AI / rupiah melemah | Kurs Rp18.000 + buffer 20%, routing model, caching, multi-penyedia | NFR-COST, TECH-SPEC §6 |
| Kebocoran data | Enkripsi, isolasi tenant, kontrol akses, pentest tahunan | SEC-1..6 |
| Churn tinggi / adopsi lambat | Onboarding terpandu, CS 1:500, laporan nilai bulanan, referral | ONB-*, VAL-1, BIL-5 |
| Gagal menggalang seed | Target traksi ±350 pelanggan, MRR ±Rp64 juta | ANL-* (dasbor MRR) |
| Perubahan tarif/kebijakan WhatsApp | Mitra resmi, widget chat mandiri, notifikasi via email/aplikasi | CHT-8, NTF-* |

---

## 14. Asumsi & Ketergantungan

| ID | Asumsi / ketergantungan | Risiko jika salah | Pemilik |
|---|---|---|---|
| A-1 | UMKM pilot mau menghubungkan nomor WhatsApp bisnisnya ke WADAR | Customer Chat tidak bisa dipilot | CMO |
| A-2 | Meta menyetujui verifikasi bisnis WADAR dan onboarding nomor (Tech Provider/BSP, Embedded Signup v4) | Onboarding WA manual & lambat | CTO |
| A-3 | File ekspor Shopee, TikTok Shop, dan Tokopedia bisa diunduh penjual dan berisi nomor pesanan, SKU, qty, harga, serta potongan | Finance Insight per kanal tidak akurat | CTO |
| A-4 | Pemilik mau mengisi HPP produk | Margin tidak bisa dihitung, sehingga produk wajib meminta HPP dengan default yang jelas | Produk |
| A-5 | Harga model ringan tetap ≤ US$0,25/US$1,50 per 1 juta token | Margin turun; uji sensitivitas biaya AI 2× masih NPV positif | CTO/CFO |
| A-6 | Pre-seed Rp600 juta masuk Jan-2027 | Runway | CEO |

---

## 15. Kriteria Penerimaan Bisnis (Sign-off)

Fase 1 dinyatakan **siap pilot** jika:
1. Semua BR berprioritas **M** lulus acceptance criteria di PRD.
2. Akurasi Customer Chat ≥ 90% pada golden set internal (≥ 200 pertanyaan) **sebelum** dipakai pembeli sungguhan.
3. Biaya AI simulasi per tenant (beban Growth) ≤ anggaran §9.
4. Tes isolasi tenant lulus 100%, kebijakan privasi terbit, dan backup harian berjalan.

Fase 1 dinyatakan **siap berbayar** jika: kriteria pilot BO-8 tercapai, billing berjalan end-to-end, dan registrasi PSE selesai.

| Peran | Nama | Tanda setuju |
|---|---|---|
| CEO | | |
| CTO | | |
