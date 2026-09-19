# PRD — WADAR
### Asisten Bisnis AI untuk UMKM: Keuangan Otomatis, Operasional Terpadu, dan Asisten Chat yang Paham Kondisi Bisnis

| Meta | Isi |
|---|---|
| Versi | 1.1 |
| Tanggal | 19 September 2026 |
| Pemilik produk | Rafi |
| Status | Siap dipakai sebagai acuan build di Claude Code |
| Nama produk | **WADAR** (nama kerja; brand bisa berubah — lihat §14.1) |
| Dokumen terkait | `ARCHITECTURE.md`, `BUILD-PLAN.md`, `CLAUDE.md`, `COMPETITORS.md` |
| Dasar | Proposal *BisniQu AI* (masalah, pasar, harga, unit economics) diadaptasi ke visi WADAR |
| Riwayat | Lihat §15 Riwayat Perubahan |

---

## 0. Ringkasan Satu Paragraf

WADAR adalah aplikasi web (PWA) — lalu aplikasi Android/iOS — yang menjadi "manajer toko digital" untuk UMKM lintas kanal. WADAR menyatukan tiga layanan dalam satu langganan: **(1) Dasbor Keuangan Otomatis** yang menerjemahkan transaksi menjadi untung-rugi riil dalam bahasa sehari-hari, **(2) Operasional Terpadu** (kasir/POS, stok, pelanggan, pembelian, pesanan lintas kanal) yang terasa sesederhana aplikasi chat, dan **(3) Asisten Chat Cerdas** yang punya memori penuh dan selalu tahu kondisi bisnis *saat ini* — melayani pemilik (konsultasi, tanya data, eksekusi aksi dengan persetujuan) sekaligus pembeli di WhatsApp.

**Positioning:** *"Bukan sekadar mencatat. WADAR mengawasi, memperingatkan, dan menjawab — supaya kamu tenang bisnismu hidup dan bergerak."*

---

## 1. Latar Belakang & Masalah

### 1.1 Konteks pasar
- ±64,2 juta UMKM, menyumbang ±60,5% PDB; ±25,5 juta sudah masuk ekosistem digital.
- Tantangan berikutnya bukan lagi "go digital", tetapi **memakai data untuk keputusan** (stok, harga, keuangan, layanan).
- Indeks literasi keuangan (66,46%) tertinggal ±14 poin dari inklusi (80,51%): banyak pemilik memakai layanan keuangan tanpa tahu margin riilnya.

### 1.2 Masalah inti yang diselesaikan

| # | Masalah | Dampak | Jawaban WADAR (pilar) |
|---|---|---|---|
| M1 | Pemilik hanya lihat omzet, tidak tahu untung riil per produk/kanal | Diskon & harga diputuskan buta; "omzet besar, kas tidak nambah" | Pilar 1 — Keuangan Otomatis |
| M2 | Uang masuk dari banyak sumber (QRIS, e-wallet, transfer, COD, marketplace) dan tidak tercatat rapi | Rekap manual berjam-jam, selisih kas | Pilar 1 — Payment Listener & rekonsiliasi |
| M3 | Stok tidak sinkron antar-kanal; pencatatan manual | Stockout saat ramai, overstock mengikat modal | Pilar 2 — Stok & pesanan terpadu |
| M4 | Aplikasi POS/ERP terlalu rumit & mahal untuk UMKM | Tidak dipakai, kembali ke buku/spreadsheet | Pilar 2 — UX "orang awam" |
| M5 | Chat pelanggan menumpuk (stok? harga? ongkir? status?) | Respons lambat, konversi turun, butuh admin | Pilar 3 — Customer Chat WA |
| M6 | Tidak punya analis; masalah baru terasa setelah rugi | Keputusan reaktif | Pilar 3 — Owner Assistant + insight proaktif |

### 1.3 Akar masalah
Semua bermuara pada **jarak antara data yang dimiliki dan kemampuan mengubahnya jadi tindakan**. WADAR menutup jarak itu dengan satu sumber data terpadu + AI yang membaca data itu secara realtime.

---

## 2. Target Pengguna

### 2.1 Segmen
| Segmen | Deskripsi | Prioritas |
|---|---|---|
| S1 — UMKM berkembang lintas kanal | Omzet ±Rp5–100 jt/bln, jualan di 2+ kanal (offline, Shopee/TikTok Shop, IG, WA), 0–10 staf; fesyen, F&B, kecantikan, gadget/reseller | **Utama (beachhead)** |
| S2 — UMKM pemula satu kanal | Warung, kedai, toko kecil; fokus uang masuk & kasir | Sekunder (paket Starter) |
| S3 — UMKM menengah tanpa analis | Multi-outlet, butuh insight & kontrol staf | Tersier (paket Pro) |
| S4 — B2B2B | Koperasi, inkubator, dinas, bank yang membina UMKM | Kanal akuisisi (Fase 3) |

Area awal: Surabaya Raya & Malang.

### 2.2 Persona

**Sari, 27 — brand skincare lokal (Surabaya)**
- Kanal: Shopee, TikTok Shop, Instagram, WhatsApp; 2 admin.
- Sakit kepala: produk terlaris habis saat kampanye tanggal kembar; ratusan chat berulang.
- Butuh: stok lintas kanal + balasan chat otomatis. Paket: Growth.

**Dimas, 34 — kedai kopi & camilan (Malang)**
- Kanal: dine-in, ojol, pre-order WA; 5 karyawan.
- Sakit kepala: omzet besar tapi kas tidak bertambah; bahan baku terbuang.
- Butuh: margin riil setelah komisi ojol & HPP; kontrol bahan baku. Paket: Growth → Pro.

**Bu Tini, 45 — warung sembako (Sidoarjo)** *(persona "orang awam" untuk uji UX)*
- Kanal: offline + QRIS; HP Android kelas menengah; tidak nyaman dengan istilah akuntansi.
- Butuh: tahu uang masuk hari ini, suara notifikasi saat ada pembayaran, dan "untung hari ini berapa". Paket: Starter.

### 2.3 Jobs To Be Done
1. *Saat ada uang masuk*, aku ingin langsung tahu dan tercatat otomatis, supaya aku tenang dan tidak rekap manual.
2. *Saat akhir hari/minggu*, aku ingin tahu untung riilku dan penyebabnya, supaya bisa memutuskan harga & promo.
3. *Saat stok menipis*, aku ingin diperingatkan sebelum habis dan dibantu memesan ulang.
4. *Saat pembeli bertanya di WA*, aku ingin mereka dijawab benar dan cepat walau aku sibuk.
5. *Saat bingung soal bisnis*, aku ingin bertanya seperti ke konsultan yang sudah hafal tokoku.

---

## 3. Tujuan, Non-Goals, dan Metrik

### 3.1 Tujuan produk
- G1: Pemilik bisa melihat **untung riil hari ini** dalam ≤ 2 tap sejak buka aplikasi.
- G2: ≥ 80% transaksi tercatat **tanpa input manual** (via POS, payment listener, import marketplace).
- G3: Asisten menjawab pertanyaan data bisnis dengan akurasi ≥ 95% (dicek terhadap angka sistem).
- G4: Customer chat menjawab ≥ 60% pertanyaan tanpa eskalasi, akurasi ≥ 90% saat pilot.
- G5: Pengguna baru mencapai "aha moment" (lihat dasbor keuangan berisi data sendiri) dalam ≤ 15 menit.

### 3.2 Non-goals (sengaja TIDAK dibangun di v1)
- Akuntansi penuh standar SAK/PSAK (jurnal manual kompleks, konsolidasi). WADAR memakai buku besar sederhana yang bisa diekspor ke akuntan.
- Payroll lengkap & BPJS.
- Manajemen produksi/manufaktur multi-level (BOM bertingkat). v1 hanya resep 1 level untuk F&B.
- Integrasi API resmi semua marketplace di hari pertama (v1 via impor file; API bertahap).
- AI yang mengeksekusi aksi finansial/eksternal **tanpa persetujuan** manusia.

### 3.3 North Star & metrik
**North Star Metric:** *Jumlah toko aktif mingguan yang menindaklanjuti ≥ 1 insight/peringatan WADAR* (weekly acted-on insights). Mengukur nilai nyata, bukan sekadar login.

| Kategori | Metrik | Target MVP (pilot) | Target akhir tahun 1 |
|---|---|---|---|
| Aktivasi | % trial yang menghubungkan ≥ 1 sumber data dalam 24 jam | ≥ 60% | ≥ 70% |
| Aktivasi | Waktu ke aha moment | ≤ 15 mnt | ≤ 10 mnt |
| Engagement | WAU/MAU | ≥ 50% | ≥ 60% |
| Otomasi | % transaksi tercatat otomatis | ≥ 60% | ≥ 80% |
| AI | Akurasi jawaban owner (uji sampel) | ≥ 95% | ≥ 97% |
| AI | Akurasi customer chat | ≥ 90% | ≥ 92% |
| AI | Deflection rate customer chat | ≥ 50% | ≥ 60% |
| Bisnis | Konversi trial → berbayar | ≥ 20% | ≥ 22% |
| Bisnis | Churn bulanan | ≤ 6% | ≤ 5% |
| Ekonomi | Biaya AI+WA per toko / ARPU | ≤ 15% | ≤ 15% |
| Kualitas | Uptime | ≥ 99,5% | ≥ 99,5% |

---

## 4. Prinsip Produk & UX ("Mudah untuk Orang Awam")

1. **Bahasa sehari-hari, bukan istilah akuntansi.** "Uang masuk", "Modal barang", "Untung bersih", bukan "Revenue", "COGS", "Net income". Istilah teknis muncul hanya di *Mode Lanjutan*.
2. **Angka selalu punya konteks.** Setiap angka utama didampingi perbandingan (vs kemarin/minggu lalu) dan satu kalimat arti ("Untung turun karena diskon 20% di produk terlaris").
3. **Maksimal 3 tap** untuk tugas harian: catat penjualan, cek untung, cek stok, balas pesanan.
4. **Mobile-first, satu tangan.** Target layar 360–430 px; tombol utama di zona jempol.
5. **Chat sebagai antarmuka universal.** Semua hal bisa dilakukan lewat asisten ("catat beli kopi 2 kg 180 ribu", "stok serum tinggal berapa?").
6. **Otomatis dulu, manual kalau perlu.** Sistem menebak kategori/produk, pengguna hanya konfirmasi.
7. **Proaktif, tidak berisik.** Maksimal 3 notifikasi insight per hari; peringatan kritis (stok habis, uang masuk besar, anomali) boleh lebih.
8. **Aman untuk salah.** Semua aksi bisa dibatalkan (undo) atau di-void dengan jejak audit; tidak ada hapus permanen transaksi.
9. **Berfungsi di sinyal jelek.** POS dan pencatatan tetap jalan offline, sinkron saat online.
10. **Rasa "ketenangan".** Filosofi brand WADAR: produk menjual kepastian bahwa bisnis hidup & bergerak. Notifikasi uang masuk + suara (TTS) adalah momen emosional inti.

---

## 5. Lingkup Produk — Tiga Pilar Value Service

Prioritas: **P0** = wajib MVP, **P1** = rilis v1 (≤ 3 bulan setelah MVP), **P2** = v2+.

### 5.1 PILAR 1 — Financial Automation Dashboard ("Keuangan Otomatis")

Tujuan: pemilik tahu **uang masuk, uang keluar, untung riil, dan arus kas** tanpa pernah membuka spreadsheet.

#### Modul F1 — Payment Listener (warisan inti WADAR)
Menangkap setiap uang masuk dari berbagai sumber secara realtime.

| ID | Fitur | Prioritas |
|---|---|---|
| F1.1 | Webhook payment gateway (Xendit: QRIS dinamis, VA, e-wallet) → transaksi masuk otomatis | P0 |
| F1.2 | Notifikasi realtime "Uang masuk Rp50.000 dari GoPay" + **suara TTS Bahasa Indonesia** (web & app) | P0 |
| F1.3 | Parser notifikasi pembayaran Indonesia (teks notifikasi bank/e-wallet, SMS, email mutasi) — mesin NLP/regex yang sudah pernah dibangun | P1 (web: tempel teks/forward email; app Android: notification listener) |
| F1.4 | Pencocokan otomatis uang masuk ↔ pesanan/tagihan (by nominal unik, referensi, waktu) | P1 |
| F1.5 | Mode "Layar Kasir": layar besar menampilkan uang masuk terakhir untuk dipasang di meja kasir | **P0** *(naik dari P1, v1.1 — R1)* |
| F1.6 | Import mutasi rekening (CSV/PDF bank) untuk rekonsiliasi | P2 |

**Acceptance criteria (F1.1–F1.2):**
- Uang masuk dari webhook tampil di dasbor ≤ 3 detik (p95) setelah webhook diterima.
- Webhook idempoten: event yang sama dikirim 2× hanya tercatat 1×.
- Suara TTS dapat dimatikan per perangkat; teks suara: "Uang masuk [nominal dibaca] dari [sumber]".
- Nominal dibaca benar untuk angka hingga miliaran ("seratus dua puluh lima ribu rupiah").

#### Modul F2 — Buku Kas Otomatis (Ledger)
| ID | Fitur | Prioritas |
|---|---|---|
| F2.1 | Setiap penjualan, pembelian, pembayaran, retur otomatis menjadi entri buku (double-entry sederhana di belakang layar; pengguna hanya melihat "masuk/keluar") | P0 |
| F2.2 | Catat pengeluaran cepat: form 3 kolom (nominal, kategori tebakan AI, catatan) + foto struk | P0 |
| F2.3 | Kategorisasi otomatis pengeluaran & uang masuk (aturan + AI), pengguna konfirmasi sekali lalu sistem belajar | P0 |
| F2.4 | Scan struk/nota (OCR via model vision) → pengeluaran terisi otomatis | P1 |
| F2.5 | Beberapa "dompet": Kas laci, Rekening BCA, GoPay, Saldo Shopee, dll. dengan saldo masing-masing | P0 |
| F2.6 | Transfer antar dompet (setor kas ke bank, tarik saldo marketplace) | P1 |
| F2.7 | Hutang-piutang sederhana (kasbon pelanggan, hutang ke supplier) + pengingat jatuh tempo | P1 |

#### Modul F3 — Dasbor Kesehatan Bisnis
| ID | Fitur | Prioritas |
|---|---|---|
| F3.1 | Kartu utama: **Uang masuk hari ini**, **Untung bersih hari ini**, **Saldo total semua dompet** — dengan perbandingan & satu kalimat penjelasan | P0 |
| F3.2 | **Skor Kesehatan Bisnis (0–100)** dengan 4 komponen: margin, arus kas, stok, pertumbuhan; masing-masing warna (hijau/kuning/merah) + saran | P1 |
| F3.3 | Untung per produk, per kanal, per outlet (setelah HPP, komisi marketplace/ojol, ongkir, diskon) | P0 (per produk & kanal), P1 (per outlet) |
| F3.4 | Grafik tren 7/30/90 hari (omzet, untung, margin %) | P0 |
| F3.5 | **Insight naratif otomatis** harian & mingguan ("Minggu ini untung naik 12% karena...") | P0 |
| F3.6 | Peringatan margin tergerus (produk dijual di bawah HPP, komisi kanal terlalu besar) | P1 |
| F3.7 | Mode Lanjutan: laporan laba-rugi, arus kas, neraca sederhana | P1 |
| F3.8 | **Feed aksi**: daftar "Hari ini perlu perhatian" berisi insight/peringatan prioritas, ditampilkan di atas kartu keuangan di Beranda (pola Shopify Sidekick Pulse) | P0 *(baru, v1.1 — R3)* |
| F3.9 | **Kualitas katalog**: peringatan produk tanpa HPP/foto/harga (memengaruhi akurasi untung per produk) | P0 *(baru, v1.1 — R4)* |

**Acceptance criteria (F3.1, F3.5):**
- Dasbor terbuka ≤ 1,5 detik (p75) di Android kelas menengah via 4G.
- Angka di kartu utama sama persis dengan hasil query ledger (uji otomatis rekonsiliasi).
- Insight naratif hanya menyebut angka yang ada di data (tidak mengarang); setiap insight menyertakan tautan "Lihat datanya".

#### Modul F4 — Proyeksi & Perencanaan
| ID | Fitur | Prioritas |
|---|---|---|
| F4.1 | Proyeksi arus kas 30 hari (berdasar pola historis + hutang/piutang jatuh tempo) | P1 |
| F4.2 | Anggaran sederhana per kategori + peringatan hampir lewat | P2 |
| F4.3 | Simulasi "bagaimana jika" harga/promo ("kalau harga naik 5%, untung jadi berapa?") | P2 |

#### Modul F5 — Laporan & Pajak
| ID | Fitur | Prioritas |
|---|---|---|
| F5.1 | Laporan harian otomatis ke WhatsApp pemilik (jam bisa diatur) | P0 |
| F5.2 | Ekspor PDF/Excel laporan bulanan (laba-rugi, penjualan, stok) | P1 |
| F5.3 | Pembantu pajak UMKM: estimasi PPh final 0,5% dari omzet bulanan + pengingat setor (disclaimer: bukan konsultan pajak) | P1 |
| F5.4 | Paket "siap ajukan pinjaman": ringkasan keuangan 6–12 bulan untuk bank/koperasi | P2 |

---

### 5.2 PILAR 2 — Orkestrasi Operasional (ERP · CRM · POS yang Mudah)

Tujuan: satu tempat untuk **jual, stok, pelanggan, dan pembelian** di semua kanal — tanpa kerumitan ERP.

#### Modul O1 — Katalog Produk
| ID | Fitur | Prioritas |
|---|---|---|
| O1.1 | Produk + varian (ukuran/warna), SKU, barcode, foto, harga jual per kanal, HPP | P0 |
| O1.2 | Tambah produk super cepat: foto → AI mengisi nama, kategori, deskripsi | P1 |
| O1.3 | Impor produk massal dari Excel/CSV & file ekspor marketplace | P0 |
| O1.4 | Resep/bahan baku 1 level (F&B): 1 Es Kopi Susu = 18 g kopi + 150 ml susu + ... → stok bahan berkurang otomatis | P1 |
| O1.5 | Bundling produk | P2 |
| O1.6 | Produk berseri/IMEI (untuk reseller gadget: satu unit = satu nomor seri, kondisi, garansi) | P1 |

#### Modul O2 — Kasir (POS)
| ID | Fitur | Prioritas |
|---|---|---|
| O2.1 | Kasir cepat: cari/scan barcode, keranjang, diskon, catatan | P0 |
| O2.2 | Metode bayar: tunai (hitung kembalian), QRIS dinamis (via gateway), transfer, e-wallet, split payment, kasbon | P0 (tunai/QRIS/transfer), P1 (split/kasbon) |
| O2.3 | Struk: digital via WA/link, cetak printer thermal Bluetooth (app) / browser print (web) | P0 (digital), P1 (thermal) |
| O2.4 | **Offline mode**: transaksi tersimpan lokal, sinkron otomatis, konflik stok ditangani | P1 (web PWA), P0 (app mobile) |
| O2.5 | Shift kasir: buka/tutup kas, selisih kas | P1 |
| O2.6 | Mode meja/antrian untuk F&B | P2 |

**Acceptance criteria (O2.1–O2.2):**
- Transaksi 3 item selesai ≤ 20 detik oleh kasir terlatih.
- Menyelesaikan transaksi = stok berkurang + entri ledger + (opsional) struk terkirim, dalam satu operasi atomik dari sisi pengguna.
- QRIS dinamis: pembayaran terkonfirmasi otomatis via webhook; kasir melihat status "LUNAS" tanpa refresh.

#### Modul O3 — Pesanan Lintas Kanal (Order Hub)
| ID | Fitur | Prioritas |
|---|---|---|
| O3.1 | Satu daftar pesanan dari semua kanal: POS, WA (dibuat asisten/admin), marketplace (impor), toko online WADAR | P0 (POS+WA+impor) |
| O3.2 | Status pesanan terstandar: Baru → Dibayar → Dikemas → Dikirim → Selesai / Batal / Retur | P0 |
| O3.3 | Impor pesanan marketplace (Shopee, TikTok Shop, Tokopedia) via file ekspor, dengan pemetaan SKU otomatis | P0 |
| O3.4 | Integrasi API marketplace resmi (sinkron pesanan & stok 2 arah) | P2 |
| O3.5 | Link pembayaran & katalog mini (toko online sederhana) yang bisa dibagikan di WA/IG | P1 |
| O3.6 | Cek ongkir & resi (integrasi agregator logistik) | P2 |

#### Modul O4 — Stok Cerdas (Stock Intelligence)
| ID | Fitur | Prioritas |
|---|---|---|
| O4.1 | Stok realtime per lokasi/outlet; setiap perubahan tercatat sebagai pergerakan stok (masuk, keluar, penyesuaian, transfer) | P0 |
| O4.2 | **Prediksi habis stok**: laju jual per produk → "Serum Vit C habis ±3 hari lagi" | P0 |
| O4.3 | Saran jumlah pesan ulang (mempertimbangkan lead time supplier & tren/musim, mis. tanggal kembar) | P1 |
| O4.4 | Deteksi barang lambat laku / overstock + saran aksi (bundling, diskon) | P1 |
| O4.5 | Stok opname dengan scan HP + laporan selisih | P1 |
| O4.6 | Buffer stok per kanal (alokasi stok marketplace vs offline) | P2 |

#### Modul O5 — Pembelian & Supplier
| ID | Fitur | Prioritas |
|---|---|---|
| O5.1 | Daftar supplier + riwayat harga beli | P1 |
| O5.2 | Purchase Order (PO) → terima barang → stok & HPP (rata-rata tertimbang) ter-update → hutang/pembayaran tercatat | P1 |
| O5.3 | Asisten membuat draf PO dari saran pesan ulang; kirim ke supplier via WA setelah disetujui | P2 |

#### Modul O6 — Pelanggan (CRM Ringan)
| ID | Fitur | Prioritas |
|---|---|---|
| O6.1 | Profil pelanggan otomatis dari POS/WA/pesanan (nama, no. WA, total belanja, terakhir beli, produk favorit) | P0 |
| O6.2 | Segmen otomatis: Baru, Loyal, Berisiko hilang (lama tidak beli), VIP | P1 |
| O6.3 | Broadcast WA terjadwal ke segmen (template resmi Meta, opt-out dihormati) | P1 |
| O6.4 | Poin/member sederhana | P2 |
| O6.5 | Catatan & tag pelanggan; riwayat percakapan WA terhubung ke profil | P0 |

#### Modul O7 — Tim & Outlet
| ID | Fitur | Prioritas |
|---|---|---|
| O7.1 | Undang staf; peran: Pemilik, Manajer, Kasir, Admin Chat, Gudang (hak akses per peran) | P0 (Pemilik+Kasir), P1 (lainnya) |
| O7.2 | Multi-outlet: stok, kasir, laporan per outlet + gabungan | P1 |
| O7.3 | Log aktivitas staf (siapa void transaksi, ubah harga, dll.) | P1 |

---

### 5.3 PILAR 3 — Asisten Chat Cerdas (Integrated, Full Memory, Realtime)

Tujuan: satu "otak" AI yang **selalu tahu kondisi bisnis saat ini**, **ingat semua konteks penting**, dan bisa **bertindak** dalam batas izin — dengan dua wajah: untuk pemilik/staf dan untuk pembeli.

#### Konsep kunci: Business Brain
Semua mode asisten memakai *Business Brain* yang sama, terdiri dari:
- **Kondisi Bisnis Live** — ringkasan realtime (omzet hari ini, kas, stok kritis, pesanan tertunda, anomali) yang diperbarui setiap ada kejadian (penjualan, uang masuk, stok berubah).
- **Memori Jangka Panjang** — fakta tentang toko (kebijakan retur, jam buka, supplier langganan, preferensi pemilik, keputusan penting), ringkasan percakapan lama, dan knowledge base (katalog, FAQ, SOP).
- **Timeline Kejadian** — riwayat event bisnis yang bisa ditelusuri ("kapan terakhir restock serum?").
- **Alat (tools)** — kemampuan membaca & bertindak lewat modul Pilar 1 & 2, dengan izin sesuai peran pengguna.

Detail teknis: lihat `ARCHITECTURE.md §7`.

#### Modul A1 — Owner Assistant (untuk pemilik & staf)
Tersedia di aplikasi (chat + voice) dan di WhatsApp pemilik. **Sejak v1.1 (R2):** tanya-data read-only (A1.1) via WhatsApp pemilik masuk **MVP**; aksi tulis (A1.3, A1.4, dst.) via WA tetap di v1 — lihat §14.2 no. 3.

| ID | Kemampuan | Contoh | Prioritas |
|---|---|---|---|
| A1.1 | **Tanya data** dalam bahasa bebas | "Untung minggu ini berapa?" "Produk apa paling laku di TikTok bulan ini?" | P0 |
| A1.2 | **Konsultasi bisnis** berbasis data toko | "Kenapa bulan ini untung turun?" → analisis penyebab + saran | P0 |
| A1.3 | **Catat lewat chat** | "Catat beli gula 5 kg 80 ribu tunai" → draf pengeluaran → konfirmasi 1 tap | P0 |
| A1.4 | **Aksi dengan persetujuan** | "Buatkan PO serum 40 pcs ke Supplier A" → draf → Setujui/Ubah/Batal | P1 |
| A1.5 | **Insight proaktif** | Pesan pagi: ringkasan kemarin + 1–3 hal yang perlu diperhatikan | P0 |
| A1.6 | **Voice** — bicara & dengar (STT/TTS Bahasa Indonesia) | Tekan-tahan mic: "Stok kopi tinggal berapa?" | P1 |
| A1.7 | **Ingat preferensi & keputusan** | "Ingat, kita tidak pernah diskon lebih dari 15%" → dipakai di saran berikutnya | P0 |
| A1.8 | **Rangkuman & laporan on-demand** | "Bikinkan laporan bulan Agustus buat investor" → PDF | P1 |
| A1.9 | Membaca file/foto (struk, nota supplier, screenshot pesanan) → data terstruktur | Foto nota → draf pembelian | P1 |

**Aturan perilaku (wajib):**
- Setiap angka yang disebut asisten **harus berasal dari hasil tool** (bukan tebakan); jawaban menyertakan sumber ("dari 142 transaksi 1–18 Sep").
- Aksi tulis (catat, ubah, kirim, buat PO) **selalu** lewat kartu konfirmasi, kecuali pengguna mengaktifkan "auto-setujui" untuk jenis aksi berisiko rendah (mis. catat pengeluaran < Rp100 rb).
- Asisten menghormati peran: kasir tidak bisa bertanya laba bersih jika tidak diizinkan pemilik.
- Jika data tidak cukup, asisten bilang tidak tahu + menyarankan cara melengkapi data.

**Acceptance criteria (A1.1):**
- Golden set 200 pertanyaan data: ≥ 95% jawaban numerik tepat (toleransi pembulatan).
- p50 waktu jawab ≤ 4 detik, p95 ≤ 10 detik; streaming token pertama ≤ 1,5 detik.

#### Modul A2 — Customer Chat (untuk pembeli, di WhatsApp)
| ID | Kemampuan | Prioritas |
|---|---|---|
| A2.1 | Menjawab pertanyaan stok, harga, varian, kebijakan (retur, COD, jam buka) dari data **live** toko (RAG + tool baca stok) | P0 |
| A2.2 | Membantu pembeli memesan: pilih produk → rangkum pesanan → kirim link bayar QRIS/VA → pesanan masuk Order Hub | P1 |
| A2.3 | Cek status pesanan & resi | P1 |
| A2.4 | **Eskalasi ke manusia**: di luar cakupan / keyakinan rendah / pembeli minta admin / keluhan → notifikasi ke pemilik/admin, AI berhenti membalas percakapan itu sampai dilepas | P0 |
| A2.5 | Inbox terpadu: admin bisa ambil alih, melihat saran balasan AI, dan membalas dari aplikasi | P0 |
| A2.6 | Nada & persona bisa diatur (sapaan "Kak", gaya santai/formal, emoji) | P0 |
| A2.7 | Widget chat di toko online/katalog WADAR (kanal cadangan bila WA bermasalah) | P1 |
| A2.8 | Instagram DM | P2 |
| A2.9 | Belajar dari koreksi admin (jawaban yang diedit admin menjadi contoh/FAQ baru setelah disetujui) | P1 |
| A2.10 | Tab **"Belum bisa dijawab"**: daftar pertanyaan pembeli yang gagal dijawab AI (confidence rendah/eskalasi), satu tap jadi FAQ/knowledge base baru | P0 *(baru, v1.1 — R5)* |

**Aturan keamanan customer chat:**
- Tidak pernah membocorkan data internal (HPP, margin, data pelanggan lain, saldo).
- Tidak membuat janji di luar kebijakan toko (diskon, garansi) — jika ditanya, eskalasi.
- Harga & stok selalu dibaca live saat menjawab, bukan dari memori lama.

**Acceptance criteria (A2.1, A2.4):**
- Golden set 300 pertanyaan pembeli per vertikal pilot: akurasi ≥ 90%, zero kebocoran data internal.
- Balasan dikirim ≤ 10 detik (p95).
- Eskalasi terkirim ke pemilik ≤ 5 detik setelah dipicu.

#### Modul A3 — Memori & Knowledge Base (dapat dilihat & dikendalikan pengguna)
| ID | Fitur | Prioritas |
|---|---|---|
| A3.1 | Halaman "Yang WADAR tahu tentang tokomu": fakta, kebijakan, preferensi — bisa diedit/dihapus | P0 |
| A3.2 | Upload dokumen (SOP, daftar harga, FAQ, kebijakan) → otomatis masuk knowledge base | P0 |
| A3.3 | Onboarding wawancara: asisten bertanya 10 hal penting tentang toko di hari pertama | P0 |
| A3.4 | Deteksi konflik memori ("Kebijakan retur 7 hari vs 3 hari — mana yang benar?") | P1 |

#### Modul A4 — Automasi & Pengingat
| ID | Fitur | Prioritas |
|---|---|---|
| A4.1 | Aturan sederhana "Jika–Maka" dari template: jika stok < X → ingatkan; jika pelanggan VIP 30 hari tidak beli → sarankan pesan | P1 |
| A4.2 | Buat automasi lewat chat: "Setiap Senin pagi kirimi aku produk yang mau habis" | P2 |

---

## 6. Fitur Lintas Pilar (Platform)

| ID | Fitur | Prioritas |
|---|---|---|
| X1 | **Onboarding terpandu** (≤ 15 mnt): jenis usaha → kanal jualan → impor produk (file/foto/manual) → hubungkan pembayaran → wawancara asisten → dasbor pertama | P0 |
| X2 | Data contoh (demo store) untuk eksplor sebelum data sendiri siap | P0 |
| X3 | Autentikasi: nomor HP (OTP WA/SMS), email, Google | P0 |
| X4 | Multi-tenant (toko) + multi-outlet + peran | P0 |
| X5 | Pusat notifikasi (in-app, push web/app, WA) dengan preferensi per jenis | P0 |
| X6 | Langganan & tagihan (trial 14 hari, paket, add-on, bayar via QRIS/VA, invoice) | P0 |
| X7 | Pengaturan toko (profil, jam buka, zona waktu WIB/WITA/WIT, mata uang IDR) | P0 |
| X8 | Ekspor & hapus data (UU PDP): ekspor semua data toko; hapus akun | P0 |
| X9 | Audit log untuk aksi sensitif | P0 |
| X10 | Pusat bantuan + chat dukungan (dijawab asisten, eskalasi ke tim) | P1 |
| X11 | Referral (1 bulan gratis bagi pengajak) | P1 |
| X12 | Mode gelap, ukuran huruf besar (aksesibilitas) | P1 |
| X13 | Bahasa: Indonesia (default), Inggris | P0 / P2 |
| X14 | Panel admin internal (support, lihat status tenant, feature flag, biaya AI per tenant) | P0 |

---

## 7. Alur Pengguna Utama

### 7.1 Onboarding (Bu Tini, Starter)
1. Daftar dengan nomor WA → OTP.
2. "Jualan apa?" pilih *Warung/Sembako* → template kategori & produk umum.
3. "Uang masuk lewat mana?" centang Tunai + QRIS → aktifkan QRIS WADAR (via gateway) atau "sudah punya QRIS sendiri" → panduan payment listener.
4. Tambah 5 produk terlaris (foto/ketik) — boleh lewati.
5. Asisten menyapa: "Halo Bu Tini, saya bantu awasi warung Ibu. Boleh saya tanya 3 hal?"
6. Dasbor pertama tampil dengan kartu "Uang masuk hari ini: Rp0 — coba catat penjualan pertama!"

### 7.2 Hari biasa (Sari, Growth)
- 07.00 — WA dari WADAR: "Kemarin untung Rp1,2 jt (+8%). ⚠️ Serum Vit C habis ±3 hari lagi, kampanye 10.10 tinggal 5 hari. Mau saya buatkan draf PO?"
- 09.00–21.00 — Customer chat menjawab ±150 chat; 12 dieskalasi ke admin.
- Setiap uang masuk QRIS → notifikasi + suara.
- 21.00 — Sari impor pesanan Shopee (file) → stok & untung per kanal ter-update.
- 21.10 — Sari tanya: "Kenapa margin TikTok lebih kecil dari Shopee?" → jawaban dengan rincian komisi & ongkir.

### 7.3 Pembeli di WA
Pembeli: "Kak serum vit C masih ada? aman buat kulit sensitif?" → AI membaca stok live (6 pcs) + deskripsi produk → menjawab → pembeli "mau 2" → AI merangkum pesanan + link bayar QRIS → bayar → pesanan masuk Order Hub + notifikasi uang masuk + stok berkurang.

---

## 8. Arsitektur Informasi & Layar Utama

### 8.1 Navigasi (bottom tab di mobile, sidebar di desktop)
1. **Beranda** — kartu keuangan, peringatan, insight, pintasan cepat
2. **Kasir** — POS
3. **Pesanan** — Order Hub + Inbox chat pembeli
4. **Asisten** — chat owner assistant (tombol mic)
5. **Lainnya** — Produk & Stok, Pelanggan, Pembelian, Keuangan detail, Laporan, Tim, Pengaturan

Tombol mengambang **"+"** di semua layar: Catat jual · Catat pengeluaran · Tambah produk · Tanya asisten.

### 8.2 Daftar layar (MVP)
| Layar | Isi utama |
|---|---|
| Beranda | **Feed aksi** ("Hari ini perlu perhatian") di posisi teratas *(v1.1 — R3)*, lalu 3 kartu keuangan (uang masuk, untung, saldo), insight hari ini, grafik mini 7 hari |
| Keuangan | Tab: Ringkasan · Masuk/Keluar · Dompet · Untung per Produk/Kanal · Laporan |
| Kasir | Grid produk + pencarian/scan, keranjang, pembayaran, struk |
| Pesanan | Filter kanal/status, detail pesanan, impor marketplace |
| Inbox | Percakapan WA, status AI/manusia, saran balasan, ambil alih |
| Produk & Stok | Daftar produk, status stok (aman/menipis/kritis), prediksi habis, detail pergerakan |
| Pelanggan | Daftar + segmen, profil + riwayat |
| Asisten | Chat, kartu konfirmasi aksi, riwayat, "Yang WADAR tahu" |
| Onboarding | Wizard langkah demi langkah |
| Pengaturan | Toko, tim & peran, pembayaran, WhatsApp, notifikasi, langganan, data & privasi |

---

## 9. Paket Harga & Hak Akses (Entitlement)

Harga belum termasuk PPN. Tahunan = bayar 10 bulan.

**Paket Gratis ditambahkan di v1.1 (R6)** — payment listener + suara + buku kas dasar, 1 pengguna, **tanpa fitur AI sama sekali** (bukan trial; berlaku selamanya). Tujuan: corong akuisisi bersaing dengan Kasir Pintar/Loyverse/BukuWarung (§6 COMPETITORS.md), bukan pengganti trial 14 hari paket berbayar — lihat pertanyaan terbuka relasi Gratis vs trial di daftar ambiguitas.

| Fitur / Kuota | **Gratis** Rp0 | **Starter** Rp79.000 | **Growth** Rp199.000 | **Pro** Rp399.000 |
|---|---|---|---|---|
| Outlet | 1 | 1 | 1 | hingga 3 (+Rp99 rb/outlet) |
| Pengguna/staf | 1 | 1 | 3 | 10 |
| Payment Listener + suara | ✓ | ✓ | ✓ | ✓ |
| Dasbor keuangan & insight harian | buku kas dasar saja (tanpa insight naratif) | ✓ | ✓ | ✓ |
| Untung per produk & kanal | — | ✓ | ✓ | ✓ |
| Skor Kesehatan Bisnis, proyeksi kas | — | — | ✓ | ✓ |
| POS & Order Hub | kasir dasar saja (tanpa Order Hub) | ✓ | ✓ | ✓ |
| Impor marketplace | — | 1 kanal | 3 kanal | tak terbatas |
| Prediksi stok & saran pesan ulang | — | prediksi saja | ✓ | ✓ |
| Pembelian/PO & supplier | — | — | ✓ | ✓ |
| CRM segmen & broadcast | — | — | ✓ | ✓ |
| Owner Assistant (pertanyaan/bulan) | — (tanpa AI) | 30 | 150 | wajar tanpa batas (fair use 1.500) |
| Customer Chat WA (percakapan/bulan) | — | — | 1.000 | 3.000 |
| Voice assistant | — | — | ✓ | ✓ |
| Automasi Jika–Maka | — | — | 5 aturan | tak terbatas |
| Laporan ekspor PDF/Excel | — | — | ✓ | ✓ |
| Dukungan | pusat bantuan | pusat bantuan | chat jam kerja | prioritas ≤ 4 jam |
| Add-on | upgrade ke Starter | +500 percakapan chat Rp50 rb | sama | sama |

Aturan kuota: saat mendekati kuota (80%) → notifikasi; saat habis, customer chat berhenti dengan pesan sopan + eskalasi ke admin (tidak memutus layanan inti).

---

## 10. Kebutuhan Non-Fungsional

| Area | Kebutuhan |
|---|---|
| Kinerja | Halaman utama p75 ≤ 1,5 dtk (4G, Android menengah); API baca p95 ≤ 300 ms; update realtime ≤ 3 dtk |
| Ketersediaan | ≥ 99,5%/bulan (MVP), ≥ 99,9% (tahun ke-3); degradasi anggun: jika AI mati, POS & keuangan tetap jalan |
| Skala | Desain untuk 10.000 toko, 5 juta transaksi/bulan tanpa ubah arsitektur dasar |
| Offline | POS & catat pengeluaran berfungsi offline ≥ 24 jam; sinkron idempoten |
| Keamanan | Isolasi data antar-toko (RLS + cek di layer aplikasi), enkripsi at-rest & in-transit, RBAC, audit log, 2FA opsional pemilik, rahasia di secret manager |
| Privasi & hukum | UU 27/2022 (PDP): persetujuan, ekspor, hapus; data tidak dijual; data toko tidak dipakai melatih model pihak ketiga; registrasi PSE lingkup privat |
| Akurasi uang | Nominal disimpan sebagai bilangan bulat rupiah; tidak ada floating point; setiap transaksi seimbang di ledger |
| AI | Biaya AI+WA ≤ 15% ARPU; semua panggilan AI tercatat (prompt, tool, biaya, latensi) untuk evaluasi |
| Aksesibilitas | Kontras WCAG AA, huruf ≥ 16 px, target sentuh ≥ 44 px, dukungan pembaca layar untuk alur inti |
| Observabilitas | Tracing end-to-end dengan correlation ID; error tracking; dasbor bisnis internal |
| Lokalisasi | Format Rp1.250.000, tanggal "19 Sep 2026", zona waktu per toko |

---

## 11. Rencana Rilis

| Fase | Waktu (indikatif) | Platform | Isi utama | Kriteria lolos |
|---|---|---|---|---|
| **M0 — Fondasi** | Minggu 1–2 | — | Monorepo, auth, tenant, desain sistem UI, CI/CD | Deploy staging hijau |
| **MVP (Alpha pilot)** | Minggu 3–12 | Web PWA | Semua P0: payment listener (gateway), ledger, dasbor + insight, katalog, POS online, Order Hub + impor, stok + prediksi habis, CRM dasar, Owner Assistant (tanya data, konsultasi, catat, memori), Customer Chat WA + eskalasi + inbox, billing | Pilot 30 UMKM 8 minggu: akurasi chatbot ≥ 90%, ≥ 40% bersedia bayar |
| **v1 (Launch berbayar)** | +3 bulan | Web PWA | P1: offline POS, split/kasbon, printer, OCR struk, parser notifikasi, skor kesehatan, proyeksi kas, PO & supplier, segmen & broadcast, multi-outlet, voice, automasi template, aksi asisten dengan persetujuan | Konversi trial ≥ 20%, churn ≤ 6% |
| **v2 (Mobile App)** | +3–4 bulan | Android (utama) + iOS | App React Native (Expo) berbagi logika: POS offline-first, notification listener Android (QRIS apa pun), printer Bluetooth, push notif, scan barcode kamera, widget layar utama "uang masuk hari ini" | Rating ≥ 4,5; ≥ 50% WAU dari app |
| **v3 (Skala)** | Tahun 2–3 | Web + App | P2: API marketplace resmi, simulasi what-if, AI Agent aksi lanjutan, IG DM, B2B2B dashboard untuk koperasi/dinas, paket siap pinjaman | 8 kontrak B2B2B/tahun |

---

## 12. Analitik Produk (Event Tracking)

Event wajib (dikirim ke analytics, tanpa PII sensitif):
`signup_completed`, `onboarding_step_completed{step}`, `data_source_connected{type}`, `aha_dashboard_viewed`, `sale_recorded{channel, method}`, `expense_recorded{via: form|chat|ocr}`, `payment_received{source}`, `insight_shown{type}`, `insight_acted{type, action}`, `assistant_question{intent}`, `assistant_action_proposed{tool}`, `assistant_action_approved{tool}`, `customer_chat_resolved{by: ai|human}`, `customer_chat_escalated{reason}`, `stock_alert_shown`, `po_created`, `trial_converted{plan}`, `subscription_churned{reason}`.

---

## 13. Risiko & Mitigasi

| Risiko | Peluang | Dampak | Mitigasi |
|---|---|---|---|
| AI halusinasi angka/kebijakan | Sedang | Tinggi | Angka hanya dari tool; RAG terbatas knowledge base; ambang keyakinan + eskalasi; golden set & eval otomatis tiap rilis |
| Kebocoran data antar-toko | Rendah | Sangat tinggi | RLS Postgres + tenant guard di layer aplikasi + tes isolasi otomatis + pentest |
| Biaya AI / kurs naik | Sedang | Tinggi | Routing model murah/mahal, cache, konteks ringkas, abstraksi multi-penyedia, kuota per paket, kurs konservatif Rp18.000/US$ |
| Scope terlalu besar untuk tim kecil | **Tinggi** | Tinggi | Modular monolith dulu; urutan milestone ketat; P0 benar-benar minimal; fitur di balik feature flag |
| Kebijakan/tarif WhatsApp berubah | Sedang | Sedang | Mitra resmi Cloud API, maksimalkan jendela layanan 24 jam, widget chat cadangan, notifikasi via push/email |
| Adopsi lambat (UMKM ragu) | Sedang | Tinggi | Onboarding ≤ 15 mnt, demo store, laporan nilai bulanan ("WADAR menghemat 12 jam & mencegah 2 stockout"), kanal komunitas/B2B2B |
| Data marketplace tidak lengkap/berubah format | Tinggi | Sedang | Parser berversi per format, validasi + pratinjau sebelum impor, pemetaan SKU yang bisa dikoreksi |

---

## 14. Keputusan Terbuka & Catatan

### 14.1 Nama & brand
"WADAR" adalah nama kerja. Semua teks brand (nama, tagline, warna, logo, suara TTS sapaan) disimpan di satu paket konfigurasi (`packages/brand`) agar rebranding cukup mengubah satu tempat. Ganti nama tidak boleh butuh perubahan di kode fitur.

### 14.2 Pertanyaan terbuka
1. QRIS: memakai QRIS dinamis gateway (fee 0,7%, konfirmasi otomatis) sebagai default, atau fokus payment listener untuk QRIS statis milik toko? *(Rekomendasi: keduanya; gateway untuk POS/link bayar, listener untuk QRIS statis yang sudah ada.)*
2. Vertikal pilot pertama: fesyen/kecantikan (volume chat tinggi) atau F&B (butuh resep)? *(Rekomendasi: fesyen & kecantikan dulu; resep F&B di v1.)*
3. ~~Apakah Owner Assistant di WhatsApp pemilik termasuk MVP atau cukup di aplikasi?~~ **Diputuskan (v1.1, R2):** laporan harian WA (F5.1) **dan** tanya-data read-only (A1.1) via WA pemilik masuk **MVP**; aksi tulis (buat PO, catat pengeluaran, dll.) via WA tetap di v1.
4. Model harga B2B2B (lisensi per UMKM binaan vs kontrak program).

### 14.3 Glosarium
| Istilah | Arti |
|---|---|
| Tenant | Satu bisnis/toko pelanggan WADAR |
| Outlet | Lokasi fisik/gudang dalam satu tenant |
| Ledger | Buku besar internal; sumber kebenaran angka keuangan |
| HPP | Harga Pokok Penjualan (modal barang) |
| RAG | Retrieval-Augmented Generation — AI menjawab dengan mengambil dokumen/data toko terlebih dulu |
| Business Brain | Gabungan kondisi bisnis live, memori, timeline, dan tools yang dipakai semua mode asisten |
| Eskalasi | Percakapan diserahkan dari AI ke manusia |
| Jendela layanan WA | Periode 24 jam setelah pesan pembeli terakhir; balasan di dalamnya gratis |

---

## 15. Riwayat Perubahan (Changelog)

### v1.1 — 19 September 2026
Perubahan berdasarkan usulan `docs/COMPETITORS.md` §6 (R1–R6), dibahas dan disetujui pemilik produk satu per satu:

- **R1** — F1.5 Mode "Layar Kasir": prioritas naik **P1 → P0** (§5.1 Modul F1).
- **R2** — Owner Assistant tanya-data read-only via WhatsApp pemilik: **v1 → MVP** (§5.3 Modul A1, menjawab pertanyaan terbuka §14.2 no. 3). Aksi tulis via WA tetap di v1.
- **R3** — Beranda didesain ulang jadi **feed aksi** ("Hari ini perlu perhatian") di posisi teratas, di atas kartu keuangan (§8.2, §5.1 F3.8 baru).
- **R4** — Tambah insight baru **F3.9 — Kualitas Katalog** (peringatan produk tanpa HPP/foto/harga) (§5.1 Modul F3).
- **R5** — Tambah **A2.10 — Tab "Belum bisa dijawab"** di Inbox customer chat (§5.3 Modul A2).
- **R6** — Tambah paket **Gratis** (payment listener + suara + buku kas dasar, 1 pengguna, tanpa fitur AI) (§9).
- **R7** (pesan marketing "total biaya add-on kompetitor") **tidak** dimasukkan ke PRD — dicatat terpisah di `docs/marketing-notes.md` karena bukan keputusan produk/fitur.

### v1.0 — 19 September 2026
Draft awal.
