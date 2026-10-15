import { formatRupiah } from "@/core/money";
import { cardLabel, type ChatContext } from "./context";
import { bestNameWindow, nameMatchScore, namesProductWord, searchTerms, type NameWindow } from "./retrieval";
import type { ChatIntent, ChatReply, ChatSource, KbSnippet, ProductCard } from "./schema";
import { formatShippingEstimate } from "./store-policies";
import { findForbiddenTerms, hasAnyPhrase, hasPhrase, normalizeText, words } from "./text";

/**
 * Offline responder: a deterministic stand-in for the `chat_reply` model when
 * no LLM can be called (no API key, DEMO_SAFE=1, or the provider failed). It
 * fills the same `ChatReply` object from the same context, so the guardrails
 * and the inbox treat it exactly like a model answer — callers label it
 * `engine: "offline"` so nobody mistakes it for an LLM.
 *
 * Templates only state what the context holds: card prices via
 * `formatRupiah`, availability words (stock numbers only for "sisa sedikit",
 * = qty_hint), policy fields verbatim, FAQ answers verbatim. Anything else →
 * escalate.
 */
export type Topic =
  | "stok"
  | "harga"
  | "produk"
  | "varian"
  | "pembayaran"
  | "cod"
  | "ongkir_kirim"
  | "jam"
  | "lokasi"
  | "retur_garansi"
  | "cara_pesan"
  | "promo"
  | "status_pesanan"
  | "internal";

const TOPIC_PHRASES: Record<Topic, readonly string[]> = {
  stok: ["ready", "stok", "tersedia", "masih ada", "ada tidak", "kosong", "habis", "sisa", "restock"],
  harga: ["harga", "berapa", "price", "pricelist", "rp"],
  produk: ["cocok", "manfaat", "kegunaan", "fungsi", "pemula", "kulit", "isi", "kandungan", "rekomendasi", "bagus", "aman"],
  varian: ["warna", "varian", "pilihan", "ukuran", "tipe", "jenis", "shade"],
  pembayaran: ["bayar", "pembayaran", "transfer", "tf", "qris", "ewallet", "e wallet", "dana", "ovo", "gopay", "shopeepay", "rekening", "debit"],
  cod: ["cod", "bayar di tempat", "bayar ditempat"],
  ongkir_kirim: ["ongkir", "ongkos", "kirim", "pengiriman", "dikirim", "ekspedisi", "kurir", "jne", "jnt", "sicepat", "estimasi", "luar kota"],
  jam: ["jam", "buka", "tutup", "libur", "operasional"],
  lokasi: ["alamat", "lokasi", "dimana", "di mana", "maps", "offline", "toko fisik", "datang ke toko"],
  retur_garansi: ["retur", "tukar", "return", "garansi", "dikembalikan", "kembalikan"],
  cara_pesan: ["cara pesan", "cara beli", "cara order", "bagaimana pesan", "mau pesan", "pesan bagaimana", "checkout", "beli bagaimana", "bagaimana cara"],
  promo: ["promo", "diskon", "gratis ongkir", "potongan", "voucher", "cashback"],
  status_pesanan: ["resi", "status pesanan", "pesanan saya", "lacak", "tracking", "sudah dikirim belum"],
  internal: ["hpp", "modal", "margin", "untung", "keuntungan", "laba", "saldo", "omzet", "omset", "harga beli", "harga pokok", "kulakan"],
};

const GREETINGS = ["halo", "hai", "hi", "hallo", "hello", "pagi", "siang", "sore", "malam", "permisi", "assalamualaikum", "p", "test", "tes"];

/** Message topics, in priority order. */
export function detectTopics(message: string): Topic[] {
  const normalized = normalizeText(message);
  // "gratis ongkir" asks about a promo, not about shipping costs.
  const withoutPromo = normalized.replace(/\bgratis ongkir\b/g, " ");
  return (Object.keys(TOPIC_PHRASES) as Topic[]).filter((topic) =>
    hasAnyPhrase(topic === "ongkir_kirim" ? withoutPromo : normalized, TOPIC_PHRASES[topic]),
  );
}

function isGreetingOnly(message: string): boolean {
  const w = words(normalizeText(message)).filter((x) => x !== "kak" && x !== "admin");
  return w.length > 0 && w.length <= 4 && w.some((x) => GREETINGS.includes(x)) && detectTopics(message).length === 0;
}

const INTENT_OF: Record<Exclude<Topic, "internal" | "promo">, ChatIntent> = {
  stok: "stok",
  harga: "harga",
  produk: "produk",
  varian: "produk",
  pembayaran: "pembayaran",
  cod: "pembayaran",
  ongkir_kirim: "ongkir_kirim",
  jam: "jam_lokasi",
  lokasi: "jam_lokasi",
  retur_garansi: "retur_garansi",
  cara_pesan: "cara_pesan",
  status_pesanan: "status_pesanan",
};

/** Offline `intent` task: the primary intent of a message. */
export function classifyIntentOffline(message: string): ChatIntent {
  if (isGreetingOnly(message)) return "sapaan";
  const topics = detectTopics(message);
  if (topics.length === 0 || topics.includes("internal")) return "di_luar_cakupan";
  if (topics.includes("status_pesanan")) return "status_pesanan";
  return primaryIntent(topics, false);
}

/** Score at which a product counts as "the one the buyer named"; a whole name word scores WORD_MATCH; a second product needs NEXT_MATCH. */
const STRONG_MATCH = 0.45;
const WORD_MATCH = 0.5;
const NEXT_MATCH = 0.6;

interface ProductGroup {
  name: string;
  cards: ProductCard[];
  score: number;
}

/**
 * Products the buyer named, best first (≤ 3). Greedy: take the best-matching
 * product, remove the words that matched it, look again ("body lotion sama
 * body scrub berapa?" names two). A generic word ("toner ada?") also brings
 * the products that match it about as well as the first one.
 */
function namedProducts(message: string, cards: readonly ProductCard[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();
  for (const card of cards) {
    const g = groups.get(card.name) ?? { name: card.name, cards: [], score: 0 };
    g.cards.push(card);
    groups.set(card.name, g);
  }
  const all = [...groups.values()];
  const msgWords = words(normalizeText(message));
  const picked: ProductGroup[] = [];

  while (picked.length < 3) {
    let best: { group: ProductGroup; window: NameWindow } | null = null;
    for (const group of all) {
      if (picked.includes(group)) continue;
      for (const card of group.cards) {
        const window = bestNameWindow(msgWords, card);
        if (picked.length === 0 && namesProductWord(message, card)) window.score = Math.max(window.score, WORD_MATCH);
        if (!best || window.score > best.window.score) best = { group, window };
      }
    }
    if (!best || best.window.score < (picked.length === 0 ? STRONG_MATCH : NEXT_MATCH)) break;
    picked.push({ ...best.group, score: best.window.score });
    for (let i = best.window.start; i < best.window.start + best.window.length; i++) msgWords[i] = "";
  }
  if (picked.length === 0) return [];

  const first = picked[0].score;
  for (const group of all) {
    if (picked.length >= 3 || picked.some((p) => p.name === group.name)) continue;
    const score = Math.max(
      ...group.cards.map((c) => Math.max(nameMatchScore(message, c), namesProductWord(message, c) ? WORD_MATCH : 0)),
    );
    if (score >= STRONG_MATCH && first - score < 0.15) picked.push({ ...group, score });
  }
  return picked;
}

function availabilityPhrase(card: ProductCard): string {
  if (card.availability === "habis") return "lagi kosong";
  if (card.availability === "sisa_sedikit") return `ready, tinggal ${card.qty_hint} lagi`;
  return "ready";
}

function productSentence(group: ProductGroup, topics: Topic[], sal: string): string {
  const [first] = group.cards;
  if (group.cards.length === 1) {
    const card = first;
    if (card.availability === "habis") return `Maaf ${sal}, ${cardLabel(card)} ${availabilityPhrase(card)}. Harga normalnya ${formatRupiah(card.price)}.`;
    const describe = topics.includes("produk") && card.description ? ` ${card.description}` : "";
    return `${cardLabel(card)} ${availabilityPhrase(card)} ${sal}, harganya ${formatRupiah(card.price)}.${describe}`;
  }
  const samePrice = group.cards.every((c) => c.price === first.price);
  const options = group.cards.map((c) =>
    samePrice ? `${c.option_label} (${availabilityPhrase(c)})` : `${c.option_label} ${formatRupiah(c.price)} (${availabilityPhrase(c)})`,
  );
  const price = samePrice ? ` Semuanya ${formatRupiah(first.price)}.` : "";
  const describe = topics.includes("produk") && first.description ? ` ${first.description}` : "";
  return `${group.name} ada ${group.cards.length} pilihan ${sal}: ${options.join(", ")}.${price}${describe}`;
}

/** Share of an FAQ question's content words found in the message: ≥ 0.5 = related, ≥ 0.75 = the same question. */
const RELATED_FAQ = 0.5;
const EXACT_FAQ = 0.75;

/** The FAQ whose question shares the most content words with the message (at least half). */
function matchingFaq(message: string, kb: readonly KbSnippet[]): { snippet: KbSnippet; ratio: number } | null {
  const terms = new Set(searchTerms(message));
  let best: { snippet: KbSnippet; ratio: number } | null = null;
  for (const snippet of kb) {
    if (snippet.kind !== "faq" || !snippet.question || !snippet.answer) continue;
    const qTerms = searchTerms(snippet.question);
    if (qTerms.length === 0) continue;
    const ratio = qTerms.filter((t) => terms.has(t)).length / qTerms.length;
    if (ratio >= RELATED_FAQ && (!best || ratio > best.ratio)) best = { snippet, ratio };
  }
  return best;
}

function escalateReply(intent: ChatIntent, reason: NonNullable<ChatReply["escalate_reason"]>, confidence: number): ChatReply {
  return { intent, reply: "", sources: [], confidence, escalate: true, escalate_reason: reason };
}

export function composeOfflineReply(message: string, ctx: ChatContext): ChatReply {
  const sal = ctx.persona.salutation || "Kak";
  const p = ctx.policies;

  if (isGreetingOnly(message)) {
    const who = ctx.persona.name ? `, aku ${ctx.persona.name}` : "";
    const emoji = ctx.persona.emoji ? " 😊" : "";
    return {
      intent: "sapaan",
      reply: `Halo ${sal}${who} dari ${ctx.shopName}${emoji} Ada yang bisa dibantu? Boleh tanya produk, harga, stok, ongkir, atau cara pesan.`,
      sources: [],
      confidence: 0.95,
      escalate: false,
    };
  }

  const topics = detectTopics(message);
  if (topics.includes("internal") || findForbiddenTerms(message).length > 0) return escalateReply("di_luar_cakupan", "other", 0.2);
  if (topics.includes("status_pesanan")) return escalateReply("status_pesanan", "not_in_store_data", 0.3);

  const parts: string[] = [];
  const sources: ChatSource[] = [];
  let unanswered = false;
  const products = namedProducts(message, ctx.cards);
  const faq = matchingFaq(message, ctx.kb);
  const policyTopics = topics.filter((t) => POLICY_TOPICS.includes(t));
  const productTopic = topics.some((t) => t === "stok" || t === "harga" || t === "produk" || t === "varian");
  const answerWithFaq = (snippet: KbSnippet) => {
    parts.push(snippet.answer!);
    sources.push({ type: "kb", id: snippet.id });
  };

  // An FAQ written for exactly this question beats the generic policy sentence ("bisa kirim ke luar negeri?").
  const exactFaq = faq && faq.ratio >= EXACT_FAQ ? faq.snippet : null;
  if (exactFaq) {
    // "cara pakai serum vit c?": the FAQ is the answer; the product line only if price/stock was asked too.
    if (topics.includes("stok") || topics.includes("harga")) {
      for (const group of products) {
        parts.push(productSentence(group, topics, sal));
        for (const card of group.cards) sources.push({ type: "product", id: card.variant_id });
      }
    }
    answerWithFaq(exactFaq);
  } else if (products.length > 0) {
    for (const group of products) {
      parts.push(productSentence(group, topics, sal));
      for (const card of group.cards) sources.push({ type: "product", id: card.variant_id });
    }
    if (topics.includes("produk") && products.every((g) => !g.cards[0].description)) {
      if (faq) answerWithFaq(faq.snippet);
      else unanswered = true;
    }
  } else if (policyTopics.length === 0) {
    if (faq) answerWithFaq(faq.snippet);
    else if (productTopic) return escalateReply(topics.includes("harga") ? "harga" : "produk", "not_in_store_data", 0.3);
  }

  const policy = (key: string, sentence: string | null) => {
    if (sentence === null) {
      unanswered = true;
      return;
    }
    parts.push(sentence);
    sources.push({ type: "policy", id: key });
  };

  if (!exactFaq) {
    const normalized = normalizeText(message);
    if (topics.includes("cod")) {
      policy(
        "cod",
        p.cod.available === null
          ? null
          : p.cod.available
            ? `COD bisa ${sal}${p.cod.note ? `, ${p.cod.note}` : ""}.`
            : `Maaf ${sal}, untuk sekarang belum bisa COD.`,
      );
    }
    if (topics.includes("pembayaran")) {
      policy("payment_methods", p.payment_methods.length ? `Pembayaran bisa lewat ${joinList(p.payment_methods)}.` : null);
    }
    if (topics.includes("ongkir_kirim")) {
      const area = p.shipping_estimates.find((e) => e.keywords.some((k) => hasPhrase(normalized, normalizeText(k))));
      if (area) policy("shipping_estimates", `Estimasi ongkir ke ${formatShippingEstimate(area)}.`);
      else if (p.shipping_estimates.length) {
        policy("shipping_estimates", `Estimasi ongkir: ${p.shipping_estimates.map(formatShippingEstimate).join("; ")}.`);
      } else policy("shipping_areas", p.shipping_areas || null);
    }
    if (topics.includes("jam")) policy("hours", p.hours ? `Toko buka ${p.hours}.` : null);
    if (topics.includes("lokasi")) policy("address", p.address ? `Alamat toko: ${p.address}.` : null);
    if (topics.includes("retur_garansi")) {
      if (hasPhrase(normalized, "garansi")) policy("warranty", p.warranty || null);
      else policy("returns", p.returns || null);
    }
    if (topics.includes("cara_pesan")) policy("order_steps", p.order_steps || null);
    if (topics.includes("promo")) policy("promo", p.promo ? `Promo saat ini: ${p.promo}` : `Untuk sekarang belum ada promo ya ${sal}.`);
  }

  if (parts.length === 0) return escalateReply("di_luar_cakupan", "not_in_store_data", 0.3);

  return {
    intent: primaryIntent(topics, products.length > 0),
    reply: fit(parts),
    sources,
    confidence: unanswered ? 0.5 : 0.9,
    escalate: false,
  };
}

const POLICY_TOPICS: readonly Topic[] = ["pembayaran", "cod", "ongkir_kirim", "jam", "lokasi", "retur_garansi", "cara_pesan", "promo"];

/** With a named product the product question leads; otherwise the first policy topic ("ongkir … berapa?" is ongkir, not harga). */
function primaryIntent(topics: Topic[], hasProduct: boolean): ChatIntent {
  const productTopic = topics.find(
    (t): t is "stok" | "harga" | "produk" | "varian" => t === "stok" || t === "harga" || t === "produk" || t === "varian",
  );
  if (hasProduct) return productTopic ? INTENT_OF[productTopic] : "produk";
  const policyTopic = topics.find((t): t is keyof typeof INTENT_OF => t in INTENT_OF && POLICY_TOPICS.includes(t));
  if (policyTopic) return INTENT_OF[policyTopic];
  if (topics.includes("promo")) return "harga";
  return productTopic ? INTENT_OF[productTopic] : "produk";
}

function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")}, atau ${items[items.length - 1]}`;
}

/** Join sentences, keeping the reply within the schema's 700 characters. */
function fit(parts: string[]): string {
  let out = "";
  for (const part of parts) {
    const next = out ? `${out} ${part}` : part;
    if (next.length > 700) break;
    out = next;
  }
  return out;
}
