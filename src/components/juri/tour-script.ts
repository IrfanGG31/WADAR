/**
 * Script of the /juri guided tour: a rule-based guide bot (no LLM) walks a judge through six
 * scenes. Numbers are illustrative ("contoh") but sized like the 30-day segment demo shops, so
 * what the judge sees afterwards in their own copy feels the same.
 */

export type TourSegment = "warkop" | "penyetan" | "madura";
export type SceneId = "beranda" | "kasir" | "stok" | "chat" | "keuangan" | "konsultasi";

export interface Scene {
  id: SceneId;
  title: string;
  /** What the bot says when the scene opens; `{toko}` = the chosen shop's name. */
  lines: string[];
  /** Answer to "Kenapa penting?". */
  why: string;
}

export const SCENES: readonly Scene[] = [
  {
    id: "beranda",
    title: "Beranda",
    lines: ["Ini Beranda {toko}. Omzet dan untung hari ini langsung terhitung dari setiap transaksi.", "Grafik 7 hari menunjukkan hari mana paling ramai — tanpa rekap buku."],
    why: "Kebanyakan UMKM baru tahu untungnya di akhir bulan, atau tidak pernah. Di sini kelihatan setiap hari.",
  },
  {
    id: "kasir",
    title: "Kasir",
    lines: ["Kasir cukup 2 ketuk: pilih menu, pilih bayar (tunai, QRIS, GoFood).", "Stok berkurang dan laporan ikut bergerak otomatis."],
    why: "Nota kertas dan hitung laci makan ±40 detik per transaksi. Ratusan transaksi sehari = berjam-jam tiap minggu.",
  },
  {
    id: "stok",
    title: "Stok",
    lines: ["WADAR menghitung kapan stok habis dari kecepatan jual harian.", "Yang perlu dipesan muncul duluan, lengkap dengan jumlah sarannya."],
    why: "Barang laris yang kosong = pembeli pindah ke warung sebelah. Barang yang tidak laku = modal tertahan.",
  },
  {
    id: "chat",
    title: "Chat pembeli",
    lines: ["Pembeli chat lewat WhatsApp, Telegram, atau web — asisten menjawab dari data {toko}.", "Yang sulit (tawar-menawar, komplain) diteruskan ke pemilik."],
    why: "Saat warung ramai, chat tidak sempat dibalas. Asisten tidak pernah membuka modal atau margin ke pembeli.",
  },
  {
    id: "keuangan",
    title: "Keuangan",
    lines: ["Untung bersih dihitung setelah modal, diskon, dan komisi aplikasi.", "Dibandingkan dengan minggu lalu, lengkap dengan alasannya."],
    why: "Omzet naik belum tentu untung naik — promo dan komisi GoFood sering diam-diam memotong margin.",
  },
  {
    id: "konsultasi",
    title: "Konsultasi Bisnis",
    lines: ["Tanya apa saja soal usaha, jawabannya dari angka {toko} sendiri.", "Angkanya dihitung sistem; AI hanya menjelaskan, tidak mengarang."],
    why: "Pemilik UMKM jarang punya waktu (atau konsultan) untuk membaca laporan. Cukup bertanya.",
  },
];

export interface SegmentExample {
  revenueToday: string;
  ordersToday: string;
  grossProfitToday: string;
  /** 7 bars, relative heights 0–100. */
  week: number[];
  menu: { name: string; price: string; emoji: string }[];
  lowStock: { name: string; note: string };
  chat: { question: string; answer: string };
  finance: { sales: string; cost: string; fees: string; profit: string; note: string };
  consult: { question: string; answer: string };
}

export const EXAMPLES: Readonly<Record<TourSegment, SegmentExample>> = {
  warkop: {
    revenueToday: "Rp600 rb",
    ordersToday: "66 transaksi",
    grossProfitToday: "Rp390 rb",
    week: [62, 55, 60, 58, 70, 92, 88],
    menu: [
      { name: "Kopi Tubruk", price: "Rp5.000", emoji: "☕" },
      { name: "Es Teh Manis", price: "Rp4.000", emoji: "🧊" },
      { name: "Indomie Telur", price: "Rp12.000", emoji: "🍜" },
    ],
    lowStock: { name: "Kopi Susu Sachet", note: "habis ±2 hari · pesan 100" },
    chat: { question: "Mas, masih buka jam 11 malam?", answer: "Masih, Mas! Buka sampai jam 12 malam. Mau dipesankan kopi dulu? ☕" },
    finance: { sales: "Rp4,2 jt", cost: "−Rp1,4 jt", fees: "−Rp60 rb", profit: "Rp2,7 jt", note: "Untung minggu ini naik 8%: malam Sabtu–Minggu ramai." },
    consult: { question: "Menu apa yang paling untung?", answer: "Kopi Tubruk: untung ±Rp3.500 per gelas dan paling laris. Es Teh di urutan kedua." },
  },
  penyetan: {
    revenueToday: "Rp880 rb",
    ordersToday: "56 transaksi",
    grossProfitToday: "Rp400 rb",
    week: [58, 60, 57, 63, 72, 90, 84],
    menu: [
      { name: "Ayam Penyet", price: "Rp18.000", emoji: "🍗" },
      { name: "Lele Penyet", price: "Rp15.000", emoji: "🐟" },
      { name: "Es Teh Manis", price: "Rp4.000", emoji: "🧊" },
    ],
    lowStock: { name: "Lele Penyet", note: "habis besok siang · siapkan 30 porsi" },
    chat: { question: "Bu, bisa pesan nasi kotak 25 buat besok siang?", answer: "Bisa, Kak! Minimal 20 kotak. Jam berapa diambil? Nanti pemilik langsung konfirmasi 🙏" },
    finance: { sales: "Rp6,2 jt", cost: "−Rp3,1 jt", fees: "−Rp620 rb", profit: "Rp2,5 jt", note: "Omzet naik 12%, tapi untung turun: promo GoFood 20% + komisi aplikasi." },
    consult: { question: "Promo GoFood lanjut atau tidak?", answer: "Pesanan GoFood naik, tapi untung per porsi tinggal ±Rp1.200. Coba turunkan promo ke 10%." },
  },
  madura: {
    revenueToday: "Rp1,0 jt",
    ordersToday: "78 transaksi",
    grossProfitToday: "Rp170 rb",
    week: [70, 68, 72, 69, 75, 84, 80],
    menu: [
      { name: "Rokok (batang)", price: "Rp2.500", emoji: "🚬" },
      { name: "Bensin (liter)", price: "Rp13.000", emoji: "⛽" },
      { name: "Telur (butir)", price: "Rp2.500", emoji: "🥚" },
    ],
    lowStock: { name: "Gas LPG 3kg", note: "sisa 6 tabung · habis ±1 hari" },
    chat: { question: "Cak, gas 3 kilo masih ada? Antar ke Kalibokor ya", answer: "Masih ada, Mas. Diantar ±15 menit, bayar ke yang antar. Alamat lengkapnya?" },
    finance: { sales: "Rp7,0 jt", cost: "−Rp6,1 jt", fees: "Rp0", profit: "Rp0,9 jt", note: "Untung per barang tipis, tapi buka 24 jam: jam 22–06 menyumbang hampir sepertiga omzet." },
    consult: { question: "Barang apa yang modalnya numpuk?", answer: "Beras 5kg: laku ±1 karung sehari tapi stok cukup 2 minggu. Pesan lebih sedikit, lebih sering." },
  },
};

export function isTourSegment(value: string): value is TourSegment {
  return value === "warkop" || value === "penyetan" || value === "madura";
}

export function fillShop(text: string, shopName: string): string {
  return text.replaceAll("{toko}", shopName);
}

export const GREETING = [
  "Halo! Saya Asisten Tur WADAR 👋",
  "Dalam ±2 menit saya tunjukkan cara WADAR membantu warung sehari-hari — kasir, stok, chat pembeli, sampai untung bersih.",
  "Mau lihat contoh usaha yang mana?",
];

export const OUTRO = ["Itu tadi gambaran singkatnya.", "Sekarang coba sendiri: setiap pengunjung dapat toko contoh pribadi, isinya 30 hari penjualan. Silakan coba transaksi apa pun."];
