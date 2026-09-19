# COMPETITORS — Riset Kompetitor & Acuan untuk WADAR

| Meta | Isi |
|---|---|
| Versi | 1.0 — riset per 19 September 2026 |
| Fungsi | Acuan fitur & UX: apa yang **ditiru**, apa yang **dihindari**, dan di mana **celah** WADAR |
| Dokumen terkait | `PRD.md` (ID fitur), `ARCHITECTURE.md`, `BUILD-PLAN.md` |
| Catatan | Harga diambil dari halaman publik/ulasan pada tanggal riset dan bisa berubah. Harga dari pihak ketiga ditandai *(perkiraan)*. Cek ulang sebelum dipakai di pitch. |

---

## 1. Ringkasan: di mana posisi WADAR

Pasar sudah ramai, tetapi **terpecah per fungsi**. UMKM yang mau lengkap harus menyambung 3–4 aplikasi atau membayar banyak add-on:

| Kebutuhan | Pemain yang kuat | Masalahnya bagi UMKM kecil |
|---|---|---|
| Kasir/POS + stok | Majoo, Moka, Pawoon, Olsera, Qasir, Kasir Pintar | AI dan WA dijual sebagai add-on terpisah; harga naik cepat |
| Pembukuan | BukuWarung, Kledo | Pencatatan dan laporan saja, tidak ada asisten yang proaktif |
| Omnichannel marketplace | Jubelio | Fokus ke seller online bervolume besar; biaya per pesanan |
| Chatbot WhatsApp & CRM | Mekari Qontak | Produk kelas enterprise, tidak tersambung ke stok dan keuangan toko kecil |
| Notifikasi uang masuk | QRIS Soundbox (bank & PJP) | Hanya bunyi, tanpa pencatatan dan insight |

**Celah WADAR:** satu langganan terjangkau yang menyatukan *uang masuk + untung riil + stok + chat pembeli + asisten yang paham kondisi toko*. Pemain global (Shopify Sidekick, Square Managerbot, QuickBooks Finance Agent) membuktikan arah "AI yang mengawasi dan mengusulkan aksi" sudah jadi standar, tetapi belum ada versi yang pas untuk UMKM Indonesia dengan harga Indonesia.

**Kalimat positioning yang bisa dipakai:** *"Fitur yang di aplikasi lain jadi add-on — asisten AI, bot WhatsApp, laporan ke WA — di WADAR sudah termasuk."*

---

## 2. Peta Kompetitor

### 2.1 Lokal — POS/ERP untuk UMKM

| Produk | Harga | Kekuatan | Kelemahan | Pelajaran untuk WADAR |
|---|---|---|---|---|
| **Majoo** | Starter Rp249rb, Advance Rp499rb, Prime Rp999rb/bln; add-on Rp499rb/bln per modul (integrasi marketplace, WA automation, loyalty, dll.) | Paling lengkap dan paling mirip visi "satu aplikasi". Kasir baru bisa lancar ±1 jam. Trial 14 hari tanpa kartu kredit. Support 24/7 via WA. Sudah punya **"WA Asisten Manajer"**: tanya penjualan lewat chat WhatsApp (add-on, maks 3 nomor) | Biaya add-on menumpuk, bisa 2–3× harga dasar. Fitur multi-outlet dan akuntansi tidak ada di paket termurah. Integrasi eksternal butuh developer | **Kompetitor utama.** Asisten WA mereka baru sebatas tanya angka penjualan; WADAR harus melampauinya (konsultasi, aksi dengan persetujuan, memori, insight proaktif) dan **memasukkannya ke paket, bukan add-on** |
| **Moka POS** (GoTo) | *(perkiraan)* Rp299rb–799rb/bln per outlet | Ekosistem GoTo (GoFood, GoPay), multi-outlet, laporan realtime | Butuh internet stabil, biaya relatif tinggi, kurang fleksibel, kurva belajar | Offline mode itu penting dan menjadi keluhan nyata. Pertahankan O2.4 |
| **Pawoon** | *(perkiraan)* Rp299rb/bln per outlet | Fokus F&B, metode bayar lengkap | Kurang cocok untuk non-F&B | Vertikal F&B butuh fitur khusus (meja, resep); jangan dikejar di MVP |
| **Olsera** | *(perkiraan)* Rp1,288 jt/tahun | Kitchen Display System, sinkron stok | Fokus kasir | Harga tahunan yang terasa murah per bulan adalah taktik yang efektif |
| **Qasir** | *(perkiraan)* Rp699rb/tahun | Bisa offline, sinkron otomatis saat online | Fitur analitik terbatas | Offline + harga tahunan murah = standar untuk segmen warung |
| **Kasir Pintar** | Gratis; Pro *(perkiraan)* Rp55,5rb/bln | Paket gratis, cocok pemula | Fitur lanjutan terbatas | Segmen "Bu Tini" sangat sensitif harga. Pertimbangkan paket gratis terbatas (§6) |

### 2.2 Lokal — Pembukuan & akuntansi

| Produk | Model | Kekuatan | Kelemahan | Pelajaran |
|---|---|---|---|---|
| **BukuWarung** | Gratis + monetisasi pembayaran & produk digital (pulsa, token listrik; komisi agen) | 5 juta+ unduhan, pembukuan sederhana, pengingat utang via WA/SMS | Rating Play Store 3,2 (±94 rb ulasan); pengguna mengeluh aplikasi makin rumit dan laporan tidak konsisten | Jumlah pengguna besar tidak berarti mereka puas. **Kesederhanaan harus dijaga**, jangan menumpuk fitur di layar utama. Pengingat utang via WA itu disukai; masukkan ke F2.7 |
| **Kledo** | Freemium (1 user gratis) + paket berbayar | Antarmuka ramah non-akuntan, laporan otomatis (neraca, laba-rugi, arus kas), inventaris | Skalabilitas dan kustomisasi terbatas, integrasi pihak ketiga sedikit | "Mode Lanjutan" untuk laporan formal (F3.7) cukup; jangan jadi software akuntansi penuh |

### 2.3 Lokal — Omnichannel & chat

| Produk | Model | Kekuatan | Kelemahan | Pelajaran |
|---|---|---|---|---|
| **Jubelio** | Per pesanan *(perkiraan: Rp350/order, min. Rp5.000)* | Sinkron stok ke Shopee, Tokopedia, Lazada, TikTok, dll.; WMS; **AI visual matching** untuk mendeteksi produk duplikat; AI chat yang merekomendasikan produk; rekonsiliasi pembayaran | Terlalu berat untuk toko kecil dan offline | Ide pemetaan SKU otomatis dengan AI (foto/nama mirip) → percepat O3.3. Model harga per pesanan jadi alternatif untuk add-on marketplace |
| **Mekari Qontak** | Enterprise, harga lewat sales | Chatbot AI WA dilatih dari PDF/URL/teks; **handover ke manusia + "listen mode"**; **daftar pertanyaan yang tidak terjawab**; persona dan "temperature" bisa diatur; batas jumlah percakapan AI; 10+ kanal | Mahal dan kompleks untuk UMKM; tidak tersambung ke stok/keuangan toko kecil | Tiru 3 pola: (1) listen mode admin, (2) daftar pertanyaan tak terjawab sebagai bahan KB, (3) batas percakapan AI per paket. Semua sudah sejalan dengan A2 |

### 2.4 Lokal — Perangkat notifikasi uang masuk

| Produk | Fungsi | Pelajaran |
|---|---|---|
| **QRIS Soundbox** (BSI, iFortePay, dll.) | Speaker kecil yang menyebutkan nominal saat QRIS dibayar. Tujuannya kasir tidak perlu cek HP, mencegah bukti bayar palsu, dan mempercepat antrean | **Validasi langsung untuk nilai inti WADAR ("ketenangan" + suara)**. Bank sampai membuat perangkat khusus. Tapi soundbox hanya berbunyi, tidak mencatat, tidak menghitung untung, dan terkunci ke satu bank. WADAR = "soundbox + buku kas + asisten" di HP yang sudah dimiliki. Naikkan **F1.5 Layar Kasir** ke P0 |

### 2.5 Global — Acuan AI assistant untuk merchant

| Produk | Yang relevan | Pelajaran |
|---|---|---|
| **Shopify Sidekick** (+ Pulse) | Mengubah data penjualan, traffic, dan stok menjadi **"next best actions" di beranda admin**. Asisten tersedia di setiap layar, tidak menutupi layar kerja, bisa pakai suara, bahkan dari jam tangan. Otomasi dengan aturan konfirmasi dan eskalasi | Beranda WADAR sebaiknya berupa **feed aksi** ("3 hal hari ini"), bukan sekadar grafik. Asisten dibuka sebagai panel/bottom sheet dari layar mana pun |
| **Square AI → Managerbot** (open beta AS, April 2026) | Ringkasan performa harian per lokasi, laju jual vs stok + peringatan kekurangan, jadwal staf, peluang kampanye, deteksi katalog tak lengkap. Pola: **mengusulkan → menunggu persetujuan → mengeksekusi** | Pola persetujuan WADAR (§7.6 ARCHITECTURE) sama dengan pemimpin pasar. Tambah cek **"kualitas katalog"** (produk tanpa foto/HPP/harga) sebagai insight murah yang berguna |
| **QuickBooks Finance Agent** | Insight laba-rugi, ringkasan performa bulanan yang bisa dibagikan, rekomendasi per KPI, deteksi anomali, pantau anggaran dan proyeksi | Validasi F3.5, F4.1, dan A1.8. "Ringkasan bulanan yang bisa dibagikan" (ke investor/bank) itu bernilai; hubungkan dengan F5.4 |
| **Loyverse** | POS gratis selamanya; bayar hanya untuk add-on (staf, inventaris lanjutan, integrasi). UI bersih, mobile-first, onboarding cepat | Model freemium POS terbukti menarik pengguna. Dasbor realtime sederhana (penjualan, item terlaris, total shift) sudah cukup memuaskan pengguna awam |

---

## 3. Pola UX yang Ditiru (dengan pemetaan ke PRD)

| # | Pola | Contoh di pasar | Terapkan di WADAR | ID PRD |
|---|---|---|---|---|
| U1 | Suara nominal uang masuk | QRIS Soundbox | TTS di web/app + Layar Kasir layar penuh | F1.2, F1.5 |
| U2 | Tanya data bisnis lewat WhatsApp | Majoo WA Asisten Manajer | Owner Assistant via WA pemilik, **termasuk di paket Growth** | A1.1 |
| U3 | Beranda = daftar aksi, bukan grafik | Shopify Sidekick Pulse | Feed "Hari ini perlu perhatian" di atas kartu keuangan | F3.1, F3.5 |
| U4 | Usul → setujui → eksekusi | Square Managerbot | Kartu konfirmasi aksi | A1.3, A1.4 |
| U5 | Asisten ada di setiap layar | Shopify Sidekick | Tombol asisten mengambang → bottom sheet, membawa konteks layar | A1, §8.1 |
| U6 | Admin bisa memantau lalu mengambil alih | Qontak listen mode & handover | Inbox dengan status AI/Manusia + ambil alih | A2.4, A2.5 |
| U7 | Daftar pertanyaan yang tidak terjawab | Qontak | Tab "Belum bisa dijawab" → satu tap jadi FAQ | A2.9 |
| U8 | Kasir bisa dipakai dalam 1 jam | Majoo, Loyverse | Uji kegunaan: kasir baru selesai 3 transaksi tanpa bantuan | O2.1 |
| U9 | Trial tanpa kartu kredit | Majoo | Trial 14 hari tanpa metode bayar | X6 |
| U10 | Pengingat utang via WA | BukuWarung | Tombol "Tagih lewat WA" di piutang | F2.7 |
| U11 | Deteksi produk duplikat/mirip saat impor | Jubelio AI visual matching | Saran pemetaan SKU otomatis dengan skor keyakinan | O3.3 |
| U12 | Ringkasan bulanan yang bisa dibagikan | QuickBooks Finance Agent | PDF "Rapor Bisnis Bulanan" | A1.8, F5.4 |

## 4. Anti-Pola yang Dihindari

| Anti-pola | Terlihat di | Aturan WADAR |
|---|---|---|
| Add-on menumpuk sampai harga 2–3× lipat | Majoo | Maksimal **1 jenis add-on** (kuota chat). Fitur inti tidak dipecah per modul |
| Aplikasi makin rumit setiap update | BukuWarung (rating 3,2) | Setiap fitur baru harus lolos uji "Bu Tini": tidak menambah item di navigasi utama tanpa menghapus yang lain |
| Wajib online | Moka | POS offline (O2.4) |
| Chatbot terputus dari stok/keuangan | Chatbot generik | Customer chat selalu membaca stok live (A2.1) |
| Integrasi butuh developer | Majoo | Impor file + wizard; API marketplace baru di P2 |
| AI yang mengeksekusi tanpa izin | — | Semua aksi tulis lewat persetujuan (PRD §3.2) |

---

## 5. Perbandingan Harga (per bulan, per outlet, sebelum PPN)

Skenario: toko 1 outlet yang ingin POS + stok + laporan + **bot chat WA** + **asisten AI via WA**.

| Susunan | Biaya/bulan |
|---|---|
| Majoo Starter Rp249rb + add-on WhatsApp Rp499rb + add-on WA Asisten Manajer (harga tidak dipublikasikan) | **≥ Rp748rb** |
| Moka Basic *(perkiraan)* Rp299rb + chatbot pihak ketiga | **≥ Rp300rb + biaya chatbot** |
| **WADAR Growth** (semua termasuk, 1.000 percakapan chat) | **Rp199rb** |

Selisih harganya besar. Risikonya: pasar bisa menganggap harga murah = kualitas rendah. Mitigasinya dengan demo nyata, trial, dan "Rapor Nilai Bulanan" (berapa jam dihemat, berapa stockout dicegah).

---

## 6. Rekomendasi Perubahan PRD (usulan, perlu persetujuan Rafi)

| # | Perubahan | Alasan |
|---|---|---|
| R1 | **F1.5 Layar Kasir: P1 → P0** | Soundbox membuktikan nilai "dengar uang masuk" di kasir. Biaya build kecil karena memakai realtime yang sudah ada |
| R2 | **Owner Assistant via WA (tanya data): v1 → MVP** (hanya baca, tanpa aksi) | Majoo sudah punya sebagai add-on, jadi ini sudah jadi standar pasar. Jawab pertanyaan terbuka PRD §14.2 no. 3 |
| R3 | Beranda menjadi **feed aksi** di atas kartu keuangan | Pola Sidekick Pulse dan Managerbot |
| R4 | Tambah insight **"kualitas katalog"** (produk tanpa HPP/foto/harga) | Murah dibangun, dan akurasi untung per produk bergantung pada HPP |
| R5 | Tambah A2.10 **tab "Belum bisa dijawab"** | Pola Qontak; mempercepat akurasi customer chat |
| R6 | Pertimbangkan **paket Gratis**: payment listener + suara + buku kas, 1 pengguna, tanpa AI | Bersaing dengan Kasir Pintar/Loyverse/BukuWarung; jadi corong ke Starter. Biaya server kecil karena tanpa LLM |
| R7 | Pesan pemasaran: bandingkan dengan **total biaya add-on** kompetitor | §5 |

---

## 7. Sumber

- Majoo — [Harga](https://majoo.id/harga), [WA Asisten Manajer](https://majoo.id/panduan-pengguna/detail/652), [Ulasan HashMicro](https://www.hashmicro.com/id/blog/aplikasi-majoo/)
- Moka — [Ulasan Equip ERP](https://www.equiperp.com/blog/aplikasi-moka-pos-dan-alternatifnya/)
- Daftar harga POS Indonesia — [MAS Software](https://www.mas-software.com/blog/aplikasi-pos-terbaik)
- BukuWarung — [Google Play](https://play.google.com/store/apps/details?id=com.bukuwarung&hl=en_US)
- Kledo — [MAS Software](https://www.mas-software.com/blog/software-kledo)
- Jubelio — [Situs resmi](https://jubelio.com/en/)
- Mekari Qontak — [Chatbot AI WhatsApp](https://qontak.com/fitur/aplikasi-chatbot-ai-whatsapp/)
- QRIS Soundbox — [iFortePay (Otonominews)](https://www.otonominews.id/2026/08/31/qris-soundbox-ifortepay-meluncur-jadi-asisten-kasir-pintar-untuk-umkm/), [BSI](https://www.bankbsi.co.id/news-update/berita/ajak-pedagang-naik-kelas-bsi-perkuat-transformasi-digital-lewat-qris-soundbox)
- Shopify Sidekick — [Digital Applied](https://www.digitalapplied.com/blog/shopify-spring-2026-edition-sidekick-campaign-autopilot-ai)
- Square Managerbot — [PYMNTS](https://www.pymnts.com/artificial-intelligence-2/2026/new-square-ai-agent-automates-daily-tasks-for-main-street-sellers/)
- QuickBooks Finance Agent — [QuickBooks](https://quickbooks.intuit.com/finance-agent/)
- Loyverse — [Flozic](https://www.flozic.ai/blog/reviews/loyverse-review)
