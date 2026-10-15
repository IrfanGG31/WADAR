import { retrieveContext, type ChatContext } from "../context";
import { lexicalRank, searchTerms, type KbCandidate } from "../retrieval";
import type { HistoryTurn, KbSnippet, ProductCard } from "../schema";
import { StorePersona, StorePolicies } from "../store-policies";

/**
 * "Glow by Sari" as Customer Chat sees it: the demo catalog of
 * `app.seed_demo` (names, options, prices) shaped as `chat_product_cards`
 * rows, plus the policies / persona / FAQ that `app.seed_demo_kb` writes
 * (the policy JSON is checked against the migration in store-policies.test.ts).
 * Test data only.
 */
type CardSeed = [name: string, price: number, onHand: number, extra?: { option?: string; category?: string; description?: string }];

const SEED: CardSeed[] = [
  ["Serum Vit C 20ml", 89_000, 7, { category: "Serum", description: "Serum vitamin C 10% untuk mencerahkan dan meratakan warna kulit." }],
  ["Serum Niacinamide 10%", 79_000, 24, { category: "Serum", description: "Membantu menyamarkan noda bekas jerawat dan mengontrol minyak." }],
  ["Retinol Serum 0.3%", 110_000, 9, { category: "Serum", description: "Retinol ringan untuk pemula, dipakai malam hari." }],
  ["Brightening Essence 100ml", 105_000, 8, { category: "Serum" }],
  ["Hyaluronic Toner 100ml", 65_000, 30, { category: "Toner", description: "Toner hidrasi untuk semua jenis kulit." }],
  ["Exfoliating Toner AHA BHA", 85_000, 14, { category: "Toner" }],
  ["Toner Pad 60 Lembar", 89_000, 12, { category: "Toner" }],
  ["Gentle Cleanser 100ml", 55_000, 26, { category: "Pembersih", description: "Sabun cuci muka pH seimbang, tidak bikin kering." }],
  ["Micellar Water 200ml", 52_000, 15, { category: "Pembersih" }],
  ["Facial Wash Travel 30ml", 25_000, 40, { category: "Pembersih" }],
  ["Moisturizer Gel 50g", 75_000, 22, { category: "Pelembap", description: "Pelembap gel ringan, cocok untuk kulit berminyak." }],
  ["Night Cream 30g", 99_000, 6, { category: "Pelembap" }],
  ["Eye Cream 15g", 95_000, 3, { category: "Pelembap" }],
  ["Sunscreen SPF50 40ml", 69_000, 35, { category: "Sunscreen", description: "Sunscreen SPF50 PA++++, ringan dan tidak lengket." }],
  ["Clay Mask 60g", 59_000, 18, { category: "Masker" }],
  ["Sheet Mask", 15_000, 60, { option: "Hydrating", category: "Masker" }],
  ["Sheet Mask", 15_000, 45, { option: "Brightening", category: "Masker" }],
  ["Sheet Mask", 15_000, 0, { option: "Soothing", category: "Masker" }],
  ["Acne Spot Gel 15g", 45_000, 16, { category: "Perawatan" }],
  ["Lip Serum", 39_000, 20, { option: "Pink", category: "Bibir" }],
  ["Lip Serum", 39_000, 11, { option: "Nude", category: "Bibir" }],
  ["Lip Serum", 39_000, 2, { option: "Berry", category: "Bibir" }],
  ["Lip Balm SPF15", 29_000, 30, { category: "Bibir" }],
  ["Cushion SPF35", 129_000, 7, { option: "01 Light", category: "Makeup" }],
  ["Cushion SPF35", 129_000, 0, { option: "02 Natural", category: "Makeup" }],
  ["Body Lotion 200ml", 49_000, 17, { category: "Tubuh" }],
  ["Body Scrub Kopi 200g", 65_000, 21, { category: "Tubuh" }],
  ["Hair Mist 100ml", 59_000, 19, { category: "Rambut" }],
  ["Paket Glowing (Serum+Toner+Moisturizer)", 199_000, 6, { category: "Paket" }],
  ["Mini Pouch Glow", 20_000, 25, { category: "Merchandise" }],
];

/** Same rules as the view: availability by on_hand, qty_hint = least(on_hand, 5). */
export const GLOW_CARDS: ProductCard[] = SEED.map(([name, price, onHand, extra], i) => ({
  variant_id: `v${String(i + 1).padStart(2, "0")}`,
  name,
  option_label: extra?.option ?? null,
  category: extra?.category ?? null,
  description: extra?.description ?? null,
  price,
  availability: onHand <= 0 ? "habis" : onHand <= 5 ? "sisa_sedikit" : "tersedia",
  qty_hint: Math.min(onHand, 5),
}));

export const GLOW_POLICIES_JSON = {
  hours: "Senin–Sabtu 09.00–20.00 WIB, Minggu 10.00–17.00 WIB",
  address: "Jl. Kaliurang Km 5 No. 12, Sleman, Yogyakarta",
  shipping_areas: "Kirim ke seluruh Indonesia lewat JNE, J&T, dan SiCepat. Area Jogja bisa kurir instan.",
  shipping_estimates: [
    { area: "Jogja & sekitarnya", cost_min: 8000, cost_max: 15000, eta: "hari yang sama, kurir instan", keywords: ["jogja", "yogyakarta", "sleman", "bantul"] },
    { area: "Pulau Jawa", cost_min: 12000, cost_max: 25000, eta: "2–4 hari", keywords: ["jakarta", "bandung", "surabaya", "semarang", "solo", "malang", "jawa"] },
    { area: "Luar Jawa", cost_min: 25000, cost_max: 60000, eta: "3–7 hari", keywords: ["bali", "medan", "makassar", "sumatra", "kalimantan", "sulawesi", "papua"] },
  ],
  cod: { available: true, note: "lewat J&T untuk seluruh Pulau Jawa, bayar ke kurir saat paket sampai" },
  payment_methods: ["Transfer BCA", "Transfer Mandiri", "QRIS", "ShopeePay", "COD"],
  returns: "Tukar atau retur maksimal 3 hari setelah paket diterima, segel belum dibuka, dan sertakan video unboxing.",
  warranty: "Garansi produk original 100% dan sudah terdaftar BPOM.",
  processing_time: "Pesanan sebelum jam 15.00 dikirim di hari yang sama.",
  order_steps: "Tulis nama produk, jumlah, nama penerima, alamat lengkap, dan nomor HP di chat ini. Admin akan kirim total dan nomor rekening.",
  admin_contact: "0812-2700-3456",
  promo: "Gratis ongkir Pulau Jawa untuk belanja minimal Rp250.000.",
};

export const GLOW_PERSONA_JSON = {
  name: "Sari",
  salutation: "Kak",
  style: "santai",
  emoji: true,
  holding_message: "Pertanyaan Kakak sudah aku teruskan ke admin ya. Mohon tunggu sebentar, admin akan balas langsung di chat ini 🙏",
};

export const GLOW_POLICIES = StorePolicies.parse(GLOW_POLICIES_JSON);
export const GLOW_PERSONA = StorePersona.parse(GLOW_PERSONA_JSON);

export const GLOW_FAQ: { question: string; answer: string }[] = [
  { question: "Apakah semua produk sudah BPOM?", answer: "Iya Kak, semua produk Glow by Sari original dan sudah terdaftar BPOM." },
  {
    question: "Bagaimana cara pakai Serum Vit C?",
    answer: "Pakai pagi hari setelah toner: 2–3 tetes, ratakan di wajah, lalu lanjut pelembap dan sunscreen.",
  },
  {
    question: "Apakah aman untuk ibu hamil?",
    answer: "Untuk ibu hamil dan menyusui, hindari Retinol Serum dan konsultasikan dulu dengan dokter ya Kak.",
  },
  {
    question: "Kulit sensitif cocok pakai apa?",
    answer: "Untuk kulit sensitif, mulai dari Gentle Cleanser, Hyaluronic Toner, dan Moisturizer Gel. Tes dulu di belakang telinga ya Kak.",
  },
  { question: "Bisa kirim ke luar negeri?", answer: "Belum bisa Kak, untuk sekarang kami hanya kirim ke seluruh Indonesia." },
  {
    question: "Apakah ada toko offline?",
    answer: "Ada Kak, di Jl. Kaliurang Km 5 No. 12, Sleman. Buka Senin–Sabtu 09.00–20.00 WIB.",
  },
];

export const GLOW_KB: KbSnippet[] = GLOW_FAQ.map((f, i) => ({
  id: `faq${i + 1}`,
  kind: "faq",
  content: `Tanya: ${f.question}\nJawab: ${f.answer}`,
  question: f.question,
  answer: f.answer,
}));

/** Offline retrieval over the fixture: tsvector side = lexicalRank, no vectors (no embedding key). */
export function glowContext(message: string, history: HistoryTurn[] = [], buyerPhone: string | null = null): ChatContext {
  const ranked = lexicalRank(searchTerms(message), GLOW_KB);
  const kbCandidates: KbCandidate[] = ranked.map((id, index) => ({
    ...GLOW_KB.find((k) => k.id === id)!,
    vec_rank: null,
    txt_rank: index + 1,
  }));
  return retrieveContext({
    message,
    shopName: "Glow by Sari",
    persona: GLOW_PERSONA,
    policies: GLOW_POLICIES,
    allCards: GLOW_CARDS,
    kbCandidates,
    history,
    buyerPhone,
  });
}
