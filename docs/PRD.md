## Product Requirements Document: WADAR AI — Fase 1 (MVP → Peluncuran Berbayar)

**Author**: M. Irfan Rafi Gunawan
**Date**: 14 Oktober 2026
**Status**: Draft v2.0 (selaras proposal finalis BPC; menggantikan PRD v1)

| Dokumen | Fungsi |
|---|---|
| `BRD.md` | Tujuan bisnis, aturan bisnis (BRL-xx), batas biaya. **Sumber kebenaran untuk harga & kuota** |
| `PRD.md` (ini) | Apa yang dibangun, untuk siapa, dan kriteria lulusnya |
| `TECH-SPEC.md` | Bagaimana membangunnya: stack, skema data, rumus, pipeline AI, milestone |
| `COMPETITORS.md` | Pola UX yang ditiru dan dihindari |

---

## 1. Summary

WADAR AI adalah aplikasi web progresif (PWA) untuk UMKM lintas kanal yang terhubung ke WhatsApp Business Platform. Pemilik memasukkan transaksi lewat **POS ringan** atau **impor file marketplace**, mengunggah katalog dan kebijakan toko, lalu sistem membangun **knowledge base per toko**. Knowledge base itu dipakai bersama oleh **empat mesin AI**: Stock Intelligence, Finance Insight, Customer Chat (RAG), dan Business Consultation. PRD ini mencakup **Fase 1**: MVP (Nov 2026 – Jan 2027), pilot 30 UMKM (Jan–Mar 2027), dan peluncuran berbayar (April 2027).

## 2. Contacts

| Nama | Peran | Catatan |
|---|---|---|
| M. Irfan Rafi Gunawan | Pemilik produk / ketua tim | Keputusan produk & teknis |
| Mashayu Aulia Zahrina | Anggota tim | Riset & validasi pengguna (asumsi, konfirmasi) |
| Claude Code | Asisten engineering | Mengikuti `CLAUDE.md` |

## 3. Background

**Konteks.** UMKM menyumbang 60,51% PDB, dan lebih dari 25,55 juta UMKM sudah masuk digital. Setiap hari mereka menghasilkan data dari marketplace, media sosial, WhatsApp, dan kasir, tetapi data itu jarang menjadi keputusan. Ada empat masalah berulang: stok tidak sinkron, margin riil tidak diketahui, chat pelanggan menumpuk, dan tidak ada analis (rincian di BRD §2).

**Kenapa sekarang.** (1) LLM + RAG membuat jawaban berpijak pada dokumen milik toko sendiri, jadi lebih akurat daripada model generik (Lewis dkk., 2020). (2) Model kelas ringan sekarang hanya ±US$0,25 per 1 juta token input, sehingga asisten AI terjangkau untuk harga UMKM. (3) WhatsApp adalah kanal jualan utama UMKM, dan balasan di jendela layanan 24 jam gratis dari Meta.

**Pelajaran dari kompetitor** (`COMPETITORS.md`). Majoo kuat di kasir tetapi menjual AI/WA sebagai add-on Rp499 rb. Chatbot generik tidak tersambung ke stok. BukuWarung menunjukkan bahwa aplikasi yang makin rumit menurunkan kepuasan (rating 3,2). Pembeda WADAR adalah **integrasi + jawaban berbasis data toko + harga UMKM**.

## 4. Objective

**Tujuan Fase 1:** membuktikan bahwa UMKM lintas kanal mendapat nilai nyata dari empat mesin AI yang memakai data tokonya sendiri, sampai mau membayar.

| Key Result | Target | Kapan diukur |
|---|---|---|
| KR-1 Akurasi Customer Chat (uji sampel, definisi §7.4) | ≥ 90% | Setiap minggu selama pilot |
| KR-2 Pilot yang bersedia berlangganan | ≥ 40% dari 30 UMKM | Minggu ke-8 pilot |
| KR-3 Aktivasi: toko dengan ≥ 10 produk + ≥ 1 transaksi dalam 48 jam | ≥ 70% pilot / ≥ 60% trial | 48 jam sejak daftar |
| KR-4 Peringatan stok yang ditindaklanjuti (restock sebelum tanggal habis) | ≥ 50% | Minggu 4–8 pilot |
| KR-5 Pengguna aktif mingguan (buka dasbor atau tanya AI ≥ 1×/minggu) | ≥ 70% pilot | Mingguan |
| KR-6 Biaya AI + WA per tenant (beban Growth) | ≤ Rp23.491 (AI Rp19.924 + WA Rp3.567) | Bulanan |
| KR-7 Konversi trial → berbayar setelah peluncuran | ≥ 20% | Apr–Jun 2027 |
| KR-8 Waktu balas Customer Chat p95 | < 10 detik | Harian |

Hubungan dengan strategi: KR-1 dan KR-2 adalah syarat lolos pilot (BRD BO-8) dan menjadi bukti traksi untuk pre-seed/seed.

## 5. Market Segment(s)

**Utama:** UMKM berkembang lintas kanal (omzet ±Rp5–100 juta/bulan) di fesyen, F&B, dan kecantikan, Surabaya Raya & Malang. Mereka berjualan di 2+ kanal (offline, Shopee/TikTok Shop/Tokopedia, Instagram, WhatsApp), punya 0–5 staf, dan memakai HP Android sebagai perangkat kerja utama.

**Job utama:** *"Saat jualan di banyak kanal sekaligus, bantu aku tahu stok mana yang mau habis, produk mana yang sebenarnya untung, dan jawab pembeli yang nanya hal sama berulang-ulang, supaya aku tidak kehilangan penjualan dan tidak kerja lembur."*

**Batasan segmen:** bukan restoran besar yang butuh meja/KDS, bukan toko multi-gudang, dan bukan perusahaan yang butuh akuntansi formal.

**Sekunder:** UMKM pemula satu kanal (Starter: stok + keuangan + konsultasi, tanpa Customer Chat); UMKM menengah tanpa analis (Pro).

## 6. Value Proposition(s)

**VP-1 — Stok tidak bolong saat ramai (Stock Intelligence)**
- **Who:** Sari, pemilik brand skincare di Shopee, TikTok Shop, dan WA.
- **Why:** produk terlaris habis saat kampanye tanggal kembar, sehingga penjualan hilang dan peringkat toko turun.
- **What before:** mengecek stok manual per platform, baru sadar habis saat pesanan masuk.
- **How:** WADAR menghitung laju jual dari semua kanal, memperkirakan tanggal habis, dan menyarankan jumlah pesan ulang dengan memperhitungkan waktu tunggu pemasok.
- **What after:** dapat peringatan "Serum Vit C habis ±3 hari lagi, pesan 40 pcs" sebelum kehabisan.
- **Alternatives:** spreadsheet, fitur stok POS besar (tanpa prediksi), atau feeling.

**VP-2 — Tahu untung riil, bukan cuma omzet (Finance Insight)**
- **Who:** Dimas, pemilik kedai kopi dengan dine-in + ojek online.
- **Why:** omzet besar tapi kas tidak bertambah; tidak tahu komisi aplikasi menggerus margin.
- **What before:** hanya melihat total penjualan harian.
- **How:** WADAR menghitung margin per produk dan per kanal setelah HPP, komisi, dan diskon, lalu menjelaskan penyebab perubahan dalam bahasa sederhana.
- **What after:** "Untung minggu ini turun Rp420 rb: komisi GoFood −Rp260 rb, diskon −Rp110 rb, penjualan turun −Rp50 rb." Dimas lalu menaikkan harga menu khusus ojol.
- **Alternatives:** laporan formal POS/akuntansi yang tidak menjelaskan sebab.

**VP-3 — Pembeli terjawab 24 jam dengan data benar (Customer Chat RAG)**
- **Who:** Sari dan 2 admin chatnya.
- **Why:** ratusan chat berulang (stok, harga, ongkir, status); respons lambat menurunkan konversi.
- **What before:** admin membalas manual satu per satu, dan chat malam tidak terjawab.
- **How:** AI menjawab di WhatsApp/widget dari katalog, stok live, dan kebijakan toko; di luar itu dieskalasi ke pemilik.
- **What after:** admin hanya menangani chat yang dieskalasi.
- **Alternatives:** chatbot skrip, chatbot AI generik yang tidak tahu stok, atau menambah admin (±0,5 FTE = Rp2,6 jt/bulan).

**VP-4 — Konsultan yang hafal tokomu (Business Consultation)**
- **Who:** semua pemilik.
- **Why:** tidak mampu menggaji analis; masalah baru ketahuan setelah rugi.
- **What before:** menebak-nebak atau bertanya di grup komunitas.
- **How:** tanya bebas ("kenapa untung turun?") yang dijawab dari data toko, plus ringkasan proaktif setiap Senin.
- **What after:** keputusan harga/promo/restock berdasar data.
- **Alternatives:** ChatGPT umum (tidak tahu data toko), atau konsultan berbayar.

## 7. Solution

### 7.1 Arsitektur produk (Proposal Gambar 4, empat lapis)

| Lapis | Komponen Fase 1 |
|---|---|
| Kanal & antarmuka | Dasbor Web/PWA pemilik · WhatsApp Business Platform · Widget chat toko online · Notifikasi (WA/email/push) |
| Aplikasi | Modul POS ringan · Modul CRM ringan · Manajemen katalog & stok · Manajemen akun & langganan |
| Kecerdasan AI | AI Stock Intelligence · AI Finance Insight · AI Customer Chat (RAG) · AI Business Consultation |
| Data & infrastruktur | Basis data transaksi multi-tenant · Vector database (knowledge base) · LLM API (dapat diganti) · Cloud, enkripsi & backup |

Alur layanan (Proposal Gambar 3): **Registrasi & pilih paket (trial 14 hari) → Integrasi data → Pemrosesan AI (knowledge base dibangun) → Penyajian layanan (dasbor, notifikasi, chatbot) → Continuous learning.**

### 7.2 UX & layar (mengikuti wireframe Proposal Gambar 1 dan sampul)

**Navigasi**
- Mobile (bottom tab, 5): **Beranda · Transaksi · Laporan · Chat AI · Lainnya**
- Desktop (sidebar): **Beranda · Penjualan · Stok · Keuangan · Pelanggan · Chat AI · Konsultasi Bisnis · Pengaturan**
- Prinsip: bahasa sehari-hari ("Untung bersih", bukan "net income"), maksimal 3 tap untuk tugas harian, target layar 360–430 px, dan setiap angka punya pembanding (vs kemarin/minggu lalu).

| Layar | Isi (sesuai wireframe) |
|---|---|
| **Beranda** | Sapaan + nama toko; pintasan POS · CRM · AI Insights · Konsultasi; kartu **Total Penjualan Hari Ini** (± % vs kemarin), **Jumlah Transaksi**, **Produk Terjual**, **Pelanggan Baru**; grafik **Tren Penjualan 7 Hari**; daftar **Stok Menipis**; kartu **Insight untukmu** (Prediksi Stok, Analisis Keuangan, Chat Pelanggan, Konsultasi Bisnis) |
| **Transaksi** | Tab **POS · Marketplace · Riwayat**. POS: pencarian, filter kategori, grid/daftar produk dengan harga & stok, keranjang, tombol **Bayar**. Marketplace: unggah file ekspor + riwayat impor |
| **Stock Intelligence** | Tab **Stok Produk · Prediksi & Rekomendasi**. Filter Semua / Stok Menipis / Stok Aman. Tiap baris: stok, minimum, status ikon. Kartu "Memprediksi: Tissue Basah habis 3 hari lagi. Disarankan pesan ulang 2 dus" |
| **Financial Insight** | Tab **Ringkasan · Margin · Detail**. Untung bersih hari ini (± %), donut performa penjualan per kategori, **Margin per Produk**, kartu penjelasan ("Margin Mie Instan turun 8% karena promo diskon...") |
| **Chat AI** | Tab **Asisten Bisnis** (konsultasi pemilik) · **Tanya Stok/Produk**. Contoh pertanyaan siap ketuk |
| **Inbox Pembeli** (di bawah Chat AI, desktop: Pelanggan) | Daftar percakapan WA/widget, status AI/Manusia/Eskalasi, ambil alih & kembalikan ke AI, tab **Belum bisa dijawab** |
| **Pelanggan** | Daftar + pencarian; profil: total belanja, terakhir beli, produk favorit, riwayat transaksi & chat, catatan/tag |
| **Pengaturan** | Profil toko, kanal & komisi, kebijakan toko, knowledge base, WhatsApp, widget, tim & peran, notifikasi, langganan & tagihan, data & privasi |
| **Onboarding** | Wizard 6 langkah (ONB-2) |

### 7.3 Kebutuhan fungsional

Prioritas: **P0** = wajib sebelum pilot (Jan 2027), **P1** = wajib sebelum berbayar (Apr 2027), **P2** = Fase 2+.

#### A. Akun, Onboarding, Tim
| ID | Kebutuhan | Prio | Acceptance criteria |
|---|---|---|---|
| ONB-1 | Daftar dengan email (magic link/OTP) atau Google; trial 14 hari otomatis aktif dengan hak akses Growth | P0 | Toko baru langsung punya subscription `trialing` dengan `trial_ends_at = +14 hari`; tidak meminta metode bayar |
| ONB-2 | Wizard onboarding: (1) jenis usaha & kategori, (2) kanal jualan + komisi default, (3) tambah produk (impor CSV/XLSX, impor file marketplace, atau manual), (4) kebijakan toko (form terstruktur), (5) hubungkan WhatsApp (boleh dilewati), (6) dasbor pertama | P0 | Pengguna uji non-teknis menyelesaikan langkah 1–4 ≤ 15 menit; setiap langkah bisa dilewati dan dilanjutkan dari checklist di Beranda |
| ONB-3 | Toko demo berisi data contoh 90 hari untuk eksplorasi | P0 | Bisa diaktifkan/dihapus; ditandai "Data contoh" di semua layar |
| TEAM-1 | Undang staf via email; peran **Pemilik**, **Kasir** (POS + stok baca), **Admin Chat** (Inbox + katalog baca); batas pengguna per paket (1/3/10) | P0 | Kasir tidak bisa membuka Keuangan maupun Konsultasi; undangan ke-4 di Growth ditolak dengan ajakan upgrade |

#### B. Katalog & Stok (lapisan aplikasi)
| ID | Kebutuhan | Prio | Acceptance criteria |
|---|---|---|---|
| CAT-1 | Produk dengan varian (mis. ukuran/warna), SKU, barcode opsional, kategori, satuan, harga jual default, **HPP**, foto, deskripsi, stok minimum, waktu tunggu pemasok (hari), kelipatan pesan (pack size) | P0 | HPP wajib diisi saat simpan (boleh 0 dengan label "HPP belum diisi" yang muncul sebagai peringatan kualitas data) |
| CAT-2 | Impor produk massal CSV/XLSX dengan template, pratinjau, dan validasi per baris | P0 | 500 baris diproses < 30 detik; baris gagal ditampilkan beserta alasannya; impor ulang file sama tidak menggandakan produk (kunci SKU) |
| CAT-3 | Harga per kanal opsional (mis. harga GoFood ≠ harga offline) | P1 | Jika kosong, pakai harga default |
| STK-0 | Pergerakan stok tercatat: masuk (pembelian/restock), keluar (penjualan), penyesuaian, retur; stok masuk bisa mencatat HPP batch & tanggal kedaluwarsa | P0 | Stok saat ini = jumlah semua pergerakan (tes otomatis); HPP rata-rata tertimbang diperbarui saat stok masuk |
| STK-0b | Stok opname sederhana: input hitungan fisik → selisih menjadi penyesuaian | P1 | Riwayat opname tersimpan |

#### C. POS ringan & Transaksi
| ID | Kebutuhan | Prio | Acceptance criteria |
|---|---|---|---|
| POS-1 | Kasir: cari/scan (kamera) produk, keranjang, diskon per item/transaksi, pilih pelanggan (opsional, cari by nomor HP), catatan | P0 | Transaksi 3 item selesai ≤ 20 detik oleh pengguna terlatih |
| POS-2 | Metode bayar: tunai (hitung kembalian), transfer, QRIS statis toko, e-wallet, "lainnya", dicatat sebagai metode, **bukan diproses** | P0 | Menyimpan transaksi = stok berkurang + data keuangan terbarui dalam satu transaksi DB |
| POS-3 | Struk digital (link) + kirim via WhatsApp (`wa.me` dengan teks) | P0 | Link struk publik bertanda tangan, tanpa data internal (HPP) |
| POS-4 | Pencatatan penjualan manual untuk kanal non-POS (mis. pesanan WA/IG) dengan pilihan kanal | P0 | Transaksi tercatat dengan kanal yang dipilih |
| POS-5 | Void transaksi dengan alasan (hanya Pemilik) → stok dikembalikan, tercatat di audit log | P0 | Transaksi tidak pernah dihapus, hanya berstatus `void` |
| POS-6 | POS tetap jalan saat offline singkat (antrean lokal, sinkron otomatis, idempoten) | P1 | 20 transaksi offline tersinkron tanpa duplikat setelah online |

#### D. Impor Marketplace
| ID | Kebutuhan | Prio | Acceptance criteria |
|---|---|---|---|
| IMP-1 | Unggah file ekspor pesanan **Shopee, TikTok Shop, Tokopedia** (CSV/XLSX); sistem mengenali format, memetakan kolom, dan menampilkan pratinjau | P0 | Fixture contoh tiap marketplace di repo lolos impor; format tak dikenal → pemetaan kolom manual yang tersimpan sebagai template |
| IMP-2 | Pemetaan SKU marketplace → varian WADAR: otomatis (SKU sama / kemiripan nama) + koreksi manual yang diingat | P0 | Baris tanpa pemetaan tidak diimpor diam-diam; ditahan di "Perlu dicocokkan" |
| IMP-3 | Impor menyimpan nomor pesanan, tanggal, status, item, qty, harga, diskon/voucher penjual, ongkir, dan **potongan/komisi platform** jika tersedia; kalau tidak tersedia, komisi dihitung dari tarif kanal | P0 | Impor file yang sama 2× tidak menggandakan pesanan (kunci: kanal + nomor pesanan) |
| IMP-4 | Pesanan batal/retur di file berikutnya memperbarui status dan mengembalikan stok | P1 | Perubahan status tercatat sebagai pergerakan stok balik |

#### E. CRM ringan
| ID | Kebutuhan | Prio | Acceptance criteria |
|---|---|---|---|
| CRM-1 | Pelanggan dibuat/digabung otomatis dari POS (nomor HP), impor (nama/username pembeli), dan chat WA (nomor) | P0 | Nomor HP dinormalisasi ke format E.164 (+62); duplikat nomor digabung |
| CRM-2 | Profil: total belanja, jumlah transaksi, terakhir beli, produk favorit, kanal, riwayat chat, catatan & tag | P0 | Angka profil = agregat transaksi (tes) |
| CRM-3 | Daftar pelanggan dengan filter (baru 30 hari, belum beli > 60 hari, top 20 belanja) | P1 | — |

#### F. Knowledge Base (dipakai bersama 4 mesin AI)
| ID | Kebutuhan | Prio | Acceptance criteria |
|---|---|---|---|
| KB-1 | **Kebijakan toko terstruktur**: jam buka, alamat, area & cara kirim, estimasi ongkir, COD ya/tidak, metode bayar, retur/tukar, garansi, waktu proses pesanan, kontak admin | P0 | Disimpan sebagai field terstruktur (bukan hanya teks) agar jawaban tepat |
| KB-2 | Unggah dokumen (PDF, DOCX, TXT) dan FAQ (tanya-jawab) → dipotong, di-embed, dan bisa dicari | P0 | Dokumen 20 halaman siap dipakai ≤ 2 menit; status "Sedang diproses/Siap/Gagal" |
| KB-3 | Katalog otomatis tersinkron ke knowledge base saat produk berubah (nama, deskripsi, varian, harga). **Stok dan harga selalu dibaca live**, bukan dari embedding | P0 | Ubah harga → jawaban chat berikutnya memakai harga baru tanpa reindex |
| KB-4 | Halaman "Yang WADAR tahu tentang tokomu": lihat, edit, hapus isi KB, plus versi KB | P0 | Hapus dokumen → potongannya tidak lagi dipakai dalam ≤ 1 menit |

#### G. AI Stock Intelligence (rumus di TECH-SPEC §7.1)
| ID | Kebutuhan | Prio | Acceptance criteria |
|---|---|---|---|
| STK-1 | **Laju jual** per varian dari semua kanal (rata-rata tertimbang 28 hari, hari stok habis tidak dihitung) | P0 | Uji fixture: hasil sama dengan hitungan referensi |
| STK-2 | **Estimasi tanggal habis** dan status: Habis / Kritis (habis sebelum restock tiba) / Menipis (≤ titik pesan ulang atau ≤ stok minimum) / Aman | P0 | Status konsisten dengan rumus; diperbarui ≤ 1 menit setelah transaksi |
| STK-3 | **Saran jumlah pesan ulang** = kebutuhan selama waktu tunggu + 14 hari + stok pengaman − stok tersedia, dibulatkan ke kelipatan pesan | P0 | Tidak pernah negatif; pembulatan ke pack size |
| STK-4 | **Deteksi barang lambat laku**: tidak terjual 30 hari, atau persediaan > 90 hari penjualan; tampilkan nilai modal yang tertahan | P0 | Daftar diurutkan dari modal tertahan terbesar |
| STK-5 | **Risiko kedaluwarsa** untuk batch bertanggal: jumlah yang diperkirakan tidak terjual sebelum tanggal kedaluwarsa | P1 | Muncul jika kedaluwarsa ≤ 30 hari dan proyeksi penjualan < sisa batch |
| STK-6 | **Penyesuaian momen kampanye** (tanggal kembar 9.9–12.12, gajian) untuk kanal marketplace berdasarkan histori toko | P1 | Jika histori belum ada, faktor default dapat diatur pemilik |
| STK-7 | Penjelasan AI satu kalimat per rekomendasi, hanya menarasikan angka yang dihitung | P0 | Tidak ada angka di narasi yang tidak ada di data rekomendasi (cek otomatis) |
| STK-8 | Penandaan "stockout dicegah": peringatan muncul → restock tercatat sebelum tanggal habis → tidak terjadi stok 0 | P0 | Dipakai untuk KR-4 dan laporan nilai |

#### H. AI Finance Insight (rumus di TECH-SPEC §7.2)
| ID | Kebutuhan | Prio | Acceptance criteria |
|---|---|---|---|
| FIN-1 | Catat **pengeluaran operasional** cepat (nominal, kategori, tanggal, catatan, foto struk opsional); kategori default: Bahan/Stok non-katalog, Gaji, Sewa, Listrik & Air, Internet, Iklan, Ongkir, Lain-lain | P0 | Form ≤ 3 kolom wajib |
| FIN-2 | Konfigurasi **komisi per kanal** (% + biaya tetap per pesanan), dengan nilai awal yang bisa diedit untuk Shopee, TikTok Shop, Tokopedia, GoFood, GrabFood, ShopeeFood | P0 | Nilai default ditandai "perkiraan, cek di akun sellermu" |
| FIN-3 | Ringkasan: penjualan, modal barang (HPP), komisi & potongan, diskon, **untung kotor**, pengeluaran, **untung bersih**; harian/mingguan/bulanan dengan pembanding | P0 | Angka sama dengan hitungan referensi fixture (toleransi Rp0) |
| FIN-4 | **Margin per produk dan per kanal** (Rp dan %) | P0 | Produk tanpa HPP ditandai, tidak dihitung sebagai margin 100% |
| FIN-5 | **Penjelasan sebab-akibat** perubahan untung (minggu ini vs minggu lalu) yang dipecah menjadi efek volume, harga, diskon, HPP, komisi, campuran produk, dan pengeluaran; dinarasikan AI dalam bahasa sederhana | P0 | Jumlah semua efek = selisih untung (tes); narasi hanya memakai angka hasil dekomposisi |
| FIN-6 | **Peringatan margin tergerus**: jual di bawah modal, margin produk turun ≥ 5 poin vs rata-rata 4 minggu, komisi > 20% penjualan kanal, diskon > 15% penjualan | P0 | Tiap peringatan punya tombol "Lihat datanya" |
| FIN-7 | Ekspor laporan bulanan (PDF/CSV) | P1 | — |
| FIN-8 | Estimasi PPh final 0,5% dari omzet bulanan (dengan disclaimer) | P2 | — |

#### I. AI Customer Chat (RAG)
| ID | Kebutuhan | Prio | Acceptance criteria |
|---|---|---|---|
| CHT-1 | Menghubungkan nomor WhatsApp toko ke WADAR (lihat keputusan Q-3 di TECH-SPEC); toko tetap bisa membalas dari aplikasi WA Business jika memakai mode *coexistence* | P0 | Status koneksi terlihat; pesan masuk tercatat ≤ 5 detik |
| CHT-2 | AI menjawab pertanyaan **produk, harga, varian, stok tersedia, cara pesan, ongkir/area kirim, metode bayar, COD, jam buka, retur, status pesanan** dari KB terstruktur + katalog live + dokumen | P0 | Golden set ≥ 200 pertanyaan per vertikal pilot: akurasi ≥ 90%, 0 kebocoran data internal |
| CHT-3 | Persona toko: sapaan ("Kak"), gaya santai/formal, emoji ya/tidak, nama asisten | P0 | Tersimpan per toko |
| CHT-4 | **Eskalasi ke pemilik** bila: keyakinan rendah, info tidak ada di data toko, keluhan/komplain, negosiasi harga/diskon, pembeli minta admin, bukti transfer/gambar, atau 2 kali gagal berturut-turut. AI mengirim pesan penahan sopan dan **berhenti membalas** percakapan itu | P0 | Notifikasi eskalasi ke pemilik ≤ 5 detik (in-app + push; WA hanya jika diatur); AI tidak membalas lagi sampai dikembalikan |
| CHT-5 | **Larangan keras**: tidak menyebut HPP, margin, saldo, atau data pelanggan lain; tidak menjanjikan diskon/garansi/pengecualian; tidak mengarang harga atau stok | P0 | Red-team 100 prompt: 0 pelanggaran |
| CHT-6 | Inbox: lihat semua percakapan, status, ambil alih, balas manual, kembalikan ke AI; jika jendela 24 jam tertutup, balasan manual wajib memakai template | P0 | UI memblokir teks bebas di luar jendela |
| CHT-7 | Tab **"Belum bisa dijawab"**: pertanyaan yang dieskalasi/keyakinan rendah → pemilik menulis jawaban → satu tap jadi FAQ di KB | P0 | FAQ baru langsung dipakai pada pertanyaan serupa berikutnya |
| CHT-8 | **Widget chat** untuk website/link toko (kanal cadangan) dengan mesin yang sama | P1 | Snippet `<script>` + halaman link chat publik |
| CHT-9 | Kuota percakapan per paket dan add-on (BRL-02..05) | P0 | Meter akurat per definisi BRL-03; perilaku saat habis sesuai BRL-05 |
| CHT-10 | Membantu pembeli memesan (rangkum pesanan → diteruskan ke pemilik sebagai draf pesanan) | P2 | — |

#### J. AI Business Consultation
| ID | Kebutuhan | Prio | Acceptance criteria |
|---|---|---|---|
| CON-1 | Tanya-jawab bebas di Chat AI → Asisten Bisnis; jawaban berbasis data toko lewat fungsi baca (penjualan, untung, margin, stok, pelanggan, insight) | P0 | Golden set 150 pertanyaan data: ≥ 95% angka tepat; setiap jawaban menyebut periode & sumber ("dari 142 transaksi 1–7 Okt") |
| CON-2 | Pertanyaan "kenapa/apa yang harus dilakukan" menghasilkan analisis penyebab + 1–3 saran yang bisa ditindaklanjuti | P0 | Saran tidak bertentangan dengan preferensi tersimpan (CON-4) |
| CON-3 | **Insight proaktif mingguan** setiap Senin 07.00 waktu toko: ringkasan minggu lalu + maksimal 3 hal prioritas (stok, margin, pelanggan) → in-app + email + WA (1 pesan utility) | P0 | Maks 3 poin; setiap poin punya "Lihat datanya"; dihitung terhadap anggaran WA |
| CON-4 | Ingat preferensi/keputusan pemilik ("jangan pernah sarankan diskon > 15%") → tersimpan di "Yang WADAR tahu", bisa dihapus | P0 | Preferensi dipakai pada saran berikutnya (uji skenario) |
| CON-5 | Ringkasan harian singkat di Beranda ("Insight untukmu") dari aturan + narasi tercache | P0 | Dihasilkan 1×/hari/toko (cache), bukan per buka halaman |
| CON-6 | Hak akses: Kasir & Admin Chat tidak bisa memakai Konsultasi | P0 | Tes izin |
| CON-7 | Kuota pertanyaan per paket (30/150/fair use) | P0 | Sisa kuota terlihat; saat habis tampil ajakan upgrade |

#### K. Notifikasi, Nilai, Billing, Admin
| ID | Kebutuhan | Prio | Acceptance criteria |
|---|---|---|---|
| NTF-1 | Pusat notifikasi in-app + Web Push (PWA) + email; WA utility hanya untuk insight mingguan & eskalasi (opsional) sesuai anggaran | P0 | Preferensi per jenis notifikasi; penghitung pesan WA berbayar per tenant |
| VAL-1 | **Laporan nilai bulanan**: chat dijawab AI (≈ jam admin dihemat), stockout dicegah (≈ penjualan diselamatkan), jam rekap dihemat, peringatan margin | P1 | Dikirim tanggal 1; asumsi perhitungan ditampilkan |
| BIL-1 | Paket Starter/Growth/Pro, bulanan/tahunan (bayar 10 bulan), status `trialing → active → past_due → read_only → canceled` | P1 | Sesuai BRL-01, BRL-07 |
| BIL-2 | Pembayaran via payment gateway (VA + QRIS) dengan invoice; webhook idempoten | P1 | Bayar → aktif ≤ 1 menit; webhook duplikat tidak menggandakan |
| BIL-3 | Entitlement & kuota ditegakkan di server (pengguna, chat, konsultasi) | P0 | Tes per paket |
| BIL-4 | Add-on +500 percakapan Rp50.000 | P1 | — |
| BIL-5 | Referral (kode/link; 1 bulan gratis untuk pengajak setelah toko yang diajak membayar) | P1 | Kredit tercatat & otomatis terpakai |
| BIL-6 | Kupon early adopter (100 pertama) dan kupon pilot | P1 | Batas pemakaian ditegakkan |
| BIL-7 | PPN di invoice hanya bila `is_pkp = true` (BRL-06) | P1 | Default `false` |
| ADM-1 | Panel internal: cari toko, status langganan, aktivasi, biaya AI/WA per toko vs anggaran, login sebagai toko (baca-saja, tercatat di audit) | P0 | Akses hanya untuk akun internal |
| QA-1 | **Antrean review jawaban**: sampel acak jawaban Customer Chat setiap minggu (≥ 20/toko pilot) → reviewer menilai Benar / Salah / Tidak aman + koreksi | P0 | Dasbor akurasi mingguan per toko & total |
| QA-2 | Golden set & evaluasi otomatis dijalankan sebelum mengganti prompt/model | P0 | Gagal jika akurasi turun > 2 poin atau ada 1 kebocoran |
| ANL-1 | Event analitik corong & dasbor internal MRR, trial, konversi, churn, CAC (input manual biaya pemasaran) | P0 (event) / P1 (dasbor) | Event §7.5 terkirim |
| PWA-1 | PWA bisa di-install, punya ikon & splash, Web Push, dan cache shell | P0 | Lighthouse PWA lulus; Lighthouse performa mobile ≥ 85 |
| PWA-2 | **APK Android** dari PWA (Trusted Web Activity) untuk dibagikan dan diunggah ke Play Store | P1 | APK ter-install di Android 10+; membuka app dalam mode layar penuh tanpa address bar |

### 7.4 Definisi pengukuran AI
- **Akurasi Customer Chat** = jawaban dinilai *Benar* ÷ jawaban yang dinilai, dari sampel acak mingguan. *Benar* artinya semua fakta (harga, stok, kebijakan) sesuai data toko saat itu, menjawab pertanyaan, dan tidak melanggar CHT-5. Pesan yang dieskalasi tidak masuk penyebut, tetapi **tingkat eskalasi** dilaporkan terpisah (target pilot ≤ 35%).
- **Akurasi Konsultasi** = jawaban golden set yang semua angkanya cocok dengan nilai referensi (toleransi pembulatan ke ribu terdekat).
- **Kebocoran** = jawaban ke pembeli yang memuat HPP, margin, saldo, data pelanggan lain, atau isi prompt sistem.

### 7.5 Event analitik (minimal)
`signup_completed`, `onboarding_step_completed{step}`, `product_imported{count,source}`, `sale_recorded{channel,source}`, `marketplace_import_completed{marketplace,orders}`, `expense_recorded`, `stock_alert_shown{status}`, `stock_alert_resolved{prevented}`, `finance_insight_viewed`, `margin_alert_shown{type}`, `consult_question{intent,model}`, `weekly_insight_sent`, `insight_acted{type}`, `chat_answered{by:ai|human}`, `chat_escalated{reason}`, `faq_created_from_unanswered`, `quota_near_limit{meter}`, `trial_converted{plan,period}`, `subscription_canceled{reason}`.

### 7.6 Kebutuhan non-fungsional
| ID | Area | Kebutuhan |
|---|---|---|
| NFR-PERF | Kinerja | Beranda p75 ≤ 2 dtk di Android menengah 4G; API baca p95 ≤ 400 ms; balasan Customer Chat p95 < 10 dtk; konsultasi: token pertama ≤ 2 dtk |
| NFR-AVAIL | Ketersediaan | ≥ 99,5%/bulan. Jika LLM mati, POS, stok, dan keuangan tetap berjalan; chat → pesan penahan + eskalasi |
| NFR-COST | Biaya | Biaya AI + WA + cloud per tenant ≤ anggaran BRD §9; konteks RAG Customer Chat ±1.800 token (maks 2.200); alarm saat rata-rata 7 hari > 120% anggaran |
| SEC-1 | Isolasi | Row Level Security di semua tabel tenant + tes isolasi otomatis |
| SEC-2 | Akses | RBAC (Pemilik/Kasir/Admin Chat/Internal); audit log untuk void, ubah harga, ubah peran, ekspor data, login internal |
| SEC-3 | Enkripsi | TLS; enkripsi at-rest (penyedia); token WhatsApp & kunci API dienkripsi di aplikasi |
| SEC-4 | Privasi | Kebijakan privasi, persetujuan saat daftar, ekspor data (ZIP CSV/JSON), hapus akun |
| SEC-5 | Backup | Backup harian, retensi 30 hari, uji restore bulanan |
| SEC-6 | Webhook | Verifikasi signature (Meta, payment gateway), idempoten, rate limit |
| NFR-A11Y | Aksesibilitas | Kontras WCAG AA, huruf ≥ 16 px, target sentuh ≥ 44 px |
| NFR-L10N | Lokalisasi | Bahasa Indonesia; format Rp1.250.000; zona waktu per toko (WIB default) |
| NFR-MONEY | Akurasi uang | Nominal disimpan sebagai bilangan bulat rupiah; tidak ada floating point |

### 7.7 Assumptions & open questions
**Asumsi** (ditandai di BRD §14): pemilik mau mengisi HPP; file ekspor marketplace memuat potongan platform; pilot mau menghubungkan nomor WA.

**Pertanyaan terbuka** (dijawab sebelum M0; daftar lengkap dengan rekomendasi default di TECH-SPEC §15):
1. Kapan presentasi final BPC, dan apakah butuh demo live?
2. Jalur onboarding WhatsApp untuk pilot: Tech Provider sendiri, BSP, atau manual?
3. Siapa yang menulis kode dan berapa jam/minggu?
4. Apakah notifikasi uang masuk + suara (WADAR lama) ikut di Fase 1? Proposal tidak menyebutnya; rekomendasi: **tidak di Fase 1** (lihat TECH-SPEC §15).

## 8. Release

| Rilis | Waktu | Isi | Gerbang lolos |
|---|---|---|---|
| **R0 — Demo Final BPC** *(jika diperlukan)* | Sebelum tanggal final | Beranda, POS, Stock Intelligence, Finance Insight, Konsultasi, Customer Chat via **widget**, di atas toko demo | Alur demo 5 menit tanpa error, data contoh realistis |
| **R1 — Alpha internal** | Akhir Des 2026 | Semua P0 | Golden set chat ≥ 90%, konsultasi ≥ 95%, tes isolasi 100%, biaya simulasi ≤ anggaran |
| **R2 — Pilot 30 UMKM** | Jan–Mar 2027 (8 minggu) | P0 + perbaikan mingguan | KR-1..KR-5; BO-8 |
| **R3 — Peluncuran berbayar** | 1 April 2027 | P0 + P1 (billing, add-on, referral, early adopter, laporan nilai, widget, APK TWA, POS offline) | PSE terdaftar; billing end-to-end; 20 pelanggan bulan pertama |
| **Fase 2** | 2027–2028 | Deteksi churn pelanggan toko (RFM), impor otomatis marketplace via API, AI Marketing Assistant, pemesanan via chat (CHT-10) | 1.316 pelanggan; churn ≤ 5% |
| **Fase 3** | 2029–2031 | Simulasi what-if, AI Agent dengan persetujuan (draf PO), dasbor & paket B2B2B | 8.404 pelanggan |

**Tidak dikerjakan di Fase 1:** AI yang mengeksekusi aksi, pemrosesan pembayaran pembeli (QRIS dinamis/payment link untuk transaksi toko), multi-outlet/gudang, akuntansi formal, payroll, integrasi API marketplace, aplikasi native, dan Instagram DM.
