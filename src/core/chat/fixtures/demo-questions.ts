import type { ChatReply } from "../schema";

/**
 * The 15 demo questions (D6 DoD) for "Glow by Sari" and what a correct turn
 * looks like: facts the reply must contain, or the escalation cause. Shared
 * by the core pipeline test and the ai.run() integration test.
 */
export type DemoExpectation =
  | { reply: true; intent: ChatReply["intent"]; includes: string[]; excludes?: string[] }
  | { reply: false; cause: string };

export const DEMO_QUESTIONS: [question: string, expected: DemoExpectation][] = [
  ["Halo kak", { reply: true, intent: "sapaan", includes: ["Glow by Sari"] }],
  // SPRINT-8D §4 step 5, verbatim.
  ["serum vit c ready? bisa COD?", { reply: true, intent: "stok", includes: ["Serum Vit C 20ml ready", "Rp89.000", "COD bisa"] }],
  ["harga serum niacinamide berapa?", { reply: true, intent: "harga", includes: ["Serum Niacinamide 10%", "Rp79.000"], excludes: ["Rp89.000"] }],
  ["sunscreen spf50 masih ada stok?", { reply: true, intent: "stok", includes: ["Sunscreen SPF50 40ml ready", "Rp69.000"] }],
  ["lip serum ada warna apa aja?", { reply: true, intent: "produk", includes: ["Pink", "Nude", "Berry", "tinggal 2 lagi", "Rp39.000"] }],
  [
    "moisturizer gel cocok untuk kulit berminyak?",
    { reply: true, intent: "produk", includes: ["Moisturizer Gel 50g", "cocok untuk kulit berminyak", "Rp75.000"] },
  ],
  ["ongkir ke surabaya berapa?", { reply: true, intent: "ongkir_kirim", includes: ["Pulau Jawa", "Rp12.000–Rp25.000", "2–4 hari"] }],
  ["tokonya buka jam berapa?", { reply: true, intent: "jam_lokasi", includes: ["Senin–Sabtu 09.00–20.00 WIB"] }],
  ["alamat toko di mana kak?", { reply: true, intent: "jam_lokasi", includes: ["Jl. Kaliurang Km 5 No. 12"] }],
  ["bisa bayar pakai apa aja?", { reply: true, intent: "pembayaran", includes: ["Transfer BCA", "QRIS", "COD"] }],
  ["kalau produknya ga cocok bisa retur?", { reply: true, intent: "retur_garansi", includes: ["maksimal 3 hari", "video unboxing"] }],
  ["cara pesannya gimana?", { reply: true, intent: "cara_pesan", includes: ["alamat lengkap", "nomor HP"] }],
  // The DoD case: haggling never gets an answer from the bot.
  ["kasih diskon dong kak", { reply: false, cause: "negotiation" }],
  ["paketku belum sampai nih, kecewa", { reply: false, cause: "complaint" }],
  // Probing internal numbers: escalated, and the holding message says nothing about them.
  ["modal serum vit c berapa sih?", { reply: false, cause: "out_of_scope" }],
];
