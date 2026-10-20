/**
 * Ruang Demo: the demo shops a visitor (or a judge) can open. The three segment demos are
 * small (30 days, 8–10 products, `app.seed_demo_lite`); kopi and skincare keep the long
 * SPRINT §4 story. Names here must match `app.new_demo_shop`.
 */

export const DEMO_PROFILES = ["warkop", "penyetan", "madura", "kopi", "skincare"] as const;
export type DemoProfile = (typeof DEMO_PROFILES)[number];

export function parseDemoProfile(value: unknown): DemoProfile {
  return typeof value === "string" && (DEMO_PROFILES as readonly string[]).includes(value) ? (value as DemoProfile) : "skincare";
}

/** One moment of "Sehari di Toko": what happens, and which page shows it. */
export interface DayMoment {
  time: string;
  title: string;
  body: string;
  /** Page under /<slug>/ that shows it live. */
  page: string;
}

export interface DemoShop {
  name: string;
  segment: string;
  emoji: string;
  tagline: string;
  /** What this demo is good for showing, in one line each. */
  highlights: string[];
  day: DayMoment[];
}

export const DEMO_SHOPS: Readonly<Record<DemoProfile, DemoShop>> = {
  warkop: {
    name: "Warkop Mas Bayu",
    segment: "Cafe & warkop",
    emoji: "☕",
    tagline: "Kopi Rp5.000, ratusan gelas sehari, buka sampai tengah malam.",
    highlights: ["Kasir cepat untuk transaksi kecil", "Laris jam berapa, menu apa", "Untung per gelas, bukan perasaan"],
    day: [
      { time: "06.00", title: "Buka, kasir siap", body: "Shift pagi langsung jualan. Tiap gelas tercatat 2 ketuk, tanpa nota kertas.", page: "kasir" },
      { time: "09.00", title: "Tahu menu yang laku", body: "Kopi tubruk dan es teh paling laris; WADAR tunjukkan untung per menu, bukan cuma omzet.", page: "keuangan" },
      { time: "13.00", title: "Pesanan GoFood ikut tercatat", body: "Komisi GoFood dihitung otomatis, jadi kelihatan untung bersihnya.", page: "keuangan" },
      { time: "19.00", title: "Ramai nonton bola", body: "Tanya \"masih buka?\" di WhatsApp dijawab asisten, Mas Bayu tetap di dapur.", page: "chat" },
      { time: "23.59", title: "Tutup, laporan jadi", body: "Omzet, untung, dan menu terlaris hari ini sudah ada di Beranda. Tidak perlu hitung uang laci.", page: "beranda" },
    ],
  },
  penyetan: {
    name: "Penyetan Bu Ratmi",
    segment: "Warung makan",
    emoji: "🍗",
    tagline: "Ayam & lele penyet, ramai makan siang, GoFood sedang naik.",
    highlights: ["Promo GoFood: omzet naik, untung?", "Komisi aplikasi kelihatan jelas", "Chat pesanan nasi kotak dijawab AI"],
    day: [
      { time: "09.00", title: "Belanja pasar", body: "Biaya cabai, minyak, dan gas dicatat sekali; WADAR membaginya ke laporan mingguan.", page: "keuangan" },
      { time: "11.30", title: "Jam makan siang", body: "Antrean panjang: kasir pilih menu + level sambal, struk bisa dikirim ke WhatsApp.", page: "kasir" },
      { time: "14.00", title: "Promo GoFood 20%", body: "Omzet minggu ini naik, tapi WADAR memberi tahu untung menipis karena diskon + komisi.", page: "keuangan" },
      { time: "16.00", title: "Pesanan nasi kotak", body: "Pembeli tanya minimal order di WhatsApp; asisten jawab dari FAQ toko, Bu Ratmi tinggal konfirmasi.", page: "chat" },
      { time: "21.00", title: "Tanya ke Konsultasi Bisnis", body: "\"Lanjut promo GoFood atau tidak?\" dijawab dari angka penjualan toko sendiri.", page: "konsultasi" },
    ],
  },
  madura: {
    name: "Warung Madura Cak Mat",
    segment: "Toko kelontong",
    emoji: "🏪",
    tagline: "Buka 24 jam, jualan eceran: rokok per batang, bensin per liter.",
    highlights: ["Satuan eceran (batang, liter, butir)", "Stok gas & beras tidak sampai kosong", "Penjualan malam tetap tercatat"],
    day: [
      { time: "02.00", title: "Jaga malam", body: "Bensin eceran dan rokok per batang tercatat dengan satuan aslinya, bukan dibulatkan.", page: "kasir" },
      { time: "06.00", title: "Cek stok pagi", body: "Gas LPG 3 kg hampir habis; WADAR hitung kapan habis dan berapa yang perlu dipesan.", page: "stok" },
      { time: "10.00", title: "Pesan ke agen", body: "Pembelian ke agen gas dicatat; stok bertambah saat barang datang.", page: "stok/pembelian" },
      { time: "15.00", title: "Antar gas lewat WhatsApp", body: "Pelanggan pesan gas lewat chat, asisten tanya alamat, Cak Mat tinggal antar.", page: "chat" },
      { time: "23.00", title: "Ganti shift", body: "Keponakan masuk jaga; laporan hari ini jelas, tidak ada selisih uang yang dicurigai.", page: "beranda" },
    ],
  },
  kopi: {
    name: "Kopi Dimas",
    segment: "Coffee shop",
    emoji: "🧋",
    tagline: "Kedai kopi kekinian, 90 hari data, GoFood & WhatsApp.",
    highlights: ["Data 90 hari", "Diskon & komisi GoFood", "Produk retail + minuman"],
    day: [
      { time: "07.00", title: "Buka", body: "Kasir siap, stok susu dan biji kopi terpantau.", page: "kasir" },
      { time: "12.00", title: "Ramai GoFood", body: "Komisi tiap pesanan dihitung otomatis.", page: "keuangan" },
      { time: "16.00", title: "Chat pembeli", body: "Pertanyaan susu oat dijawab asisten.", page: "chat" },
      { time: "22.00", title: "Tutup", body: "Laporan harian sudah jadi.", page: "beranda" },
    ],
  },
  skincare: {
    name: "Glow by Sari",
    segment: "Skincare online",
    emoji: "✨",
    tagline: "Jualan di Shopee, TikTok Shop, dan WhatsApp; 90 hari data.",
    highlights: ["Prediksi stok Serum Vit C", "Untung turun karena diskon TikTok", "Chat produk + BPOM"],
    day: [
      { time: "09.00", title: "Cek prediksi stok", body: "Serum Vit C habis ±3 hari lagi, pesan 40.", page: "stok" },
      { time: "12.00", title: "Pesanan marketplace", body: "Shopee & TikTok tercatat dengan komisinya.", page: "kasir" },
      { time: "15.00", title: "Chat pembeli", body: "Pertanyaan BPOM dan cara pakai dijawab asisten.", page: "chat" },
      { time: "20.00", title: "Kenapa untung turun?", body: "Konsultasi Bisnis menjelaskan dari angka toko.", page: "konsultasi" },
    ],
  },
};

/** The three segment demos shown first in Ruang Demo. */
export const SEGMENT_PROFILES: readonly DemoProfile[] = ["warkop", "penyetan", "madura"];
