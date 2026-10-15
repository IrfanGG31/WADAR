import { formatRupiah } from "@/core/money";
import { fuseKb, rankProductCards, type KbCandidate } from "./retrieval";
import type { HistoryTurn, KbSnippet, ProductCard } from "./schema";
import { policyFacts, type StorePersona, type StorePolicies } from "./store-policies";
import { extractAmounts } from "./text";

/**
 * Everything the reply step may use, and nothing more (TECH-SPEC §7.3 step 3):
 * structured policies, ≤ 5 product cards from `chat_product_cards`, ≤ 3 KB
 * snippets, the last 6 turns. The guardrails check replies against this same
 * object, so "in the context" and "allowed to say" are one definition.
 */
export interface ChatContext {
  shopName: string;
  persona: StorePersona;
  policies: StorePolicies;
  cards: ProductCard[];
  kb: KbSnippet[];
  history: HistoryTurn[];
  /** Best fused KB score (TECH-SPEC: `retrieval_score`); 0 when nothing matched. */
  retrievalScore: number;
  /** The buyer's own number, if known — the one phone number besides the shop's that a reply may contain. */
  buyerPhone?: string | null;
}

export const HISTORY_TURNS = 6;

export interface RetrieveInput {
  message: string;
  shopName: string;
  persona: StorePersona;
  policies: StorePolicies;
  /** Every card of the shop (the view, paged). */
  allCards: readonly ProductCard[];
  /** FAQ/doc candidates with their vector / text ranks. */
  kbCandidates: readonly KbCandidate[];
  /** Product names from catalog-embedding hits, best first (empty offline). */
  catalogHits?: readonly string[];
  history?: readonly HistoryTurn[];
  buyerPhone?: string | null;
}

export function retrieveContext(input: RetrieveInput): ChatContext {
  const kb = fuseKb(input.kbCandidates);
  return {
    shopName: input.shopName,
    persona: input.persona,
    policies: input.policies,
    cards: rankProductCards(input.message, input.allCards, input.catalogHits ?? []),
    kb: kb.snippets,
    history: (input.history ?? []).slice(-HISTORY_TURNS),
    retrievalScore: kb.retrievalScore,
    buyerPhone: input.buyerPhone ?? null,
  };
}

export const AVAILABILITY_LABEL: Record<ProductCard["availability"], string> = {
  tersedia: "tersedia",
  sisa_sedikit: "sisa sedikit",
  habis: "habis",
};

/** "Lip Serum — Pink" */
export function cardLabel(card: Pick<ProductCard, "name" | "option_label">): string {
  return card.option_label ? `${card.name} — ${card.option_label}` : card.name;
}

/**
 * The DATA TOKO block of the prompt. Cards show price and availability; the
 * stock number appears only for "sisa sedikit" and is `qty_hint` (≤ 5), so the
 * real stock never reaches the model.
 */
export function renderStoreData(ctx: ChatContext): string {
  const policy = policyFacts(ctx.policies).map((f) => `- [policy:${f.key}] ${f.label}: ${f.text}`);
  const cards = ctx.cards.map((c) => {
    const stock = c.availability === "sisa_sedikit" ? `sisa sedikit (boleh sebut: sisa ${c.qty_hint})` : AVAILABILITY_LABEL[c.availability];
    const extra = [c.category ? `kategori ${c.category}` : "", c.description ?? ""].filter(Boolean).join("; ");
    return `- [product:${c.variant_id}] ${cardLabel(c)} — ${formatRupiah(c.price)} — ${stock}${extra ? ` — ${extra}` : ""}`;
  });
  const docs = ctx.kb.map((k) => `- [kb:${k.id}] ${k.content.replace(/\s+/g, " ").trim()}`);
  return [
    "[KEBIJAKAN]",
    ...(policy.length ? policy : ["- (belum diisi)"]),
    "[KARTU PRODUK]",
    ...(cards.length ? cards : ["- (tidak ada produk yang cocok)"]),
    "[DOKUMEN]",
    ...(docs.length ? docs : ["- (tidak ada)"]),
  ].join("\n");
}

/**
 * Rupiah amounts a reply may quote: card prices + amounts written in the policies (ongkir, promo
 * minimums) and in the retrieved KB chunks — exactly what the prompt contains, nothing else.
 */
export function allowedAmounts(ctx: ChatContext): Set<number> {
  const out = new Set<number>(ctx.cards.map((c) => c.price));
  for (const e of ctx.policies.shipping_estimates) {
    out.add(e.cost_min);
    out.add(e.cost_max);
  }
  for (const fact of policyFacts(ctx.policies)) for (const amount of extractAmounts(fact.text)) out.add(amount);
  for (const k of ctx.kb) for (const amount of extractAmounts(k.content)) out.add(amount);
  return out;
}

/** Policy values and KB chunks, one string each: the only places a promise word (diskon, garansi, …) may come from. */
export function promiseSources(ctx: ChatContext): string[] {
  return [...policyFacts(ctx.policies).map((f) => f.text), ...ctx.kb.map((k) => k.content)];
}

/** Every source id a reply may cite. */
export function contextSourceIds(ctx: ChatContext): Set<string> {
  return new Set([
    ...ctx.cards.map((c) => `product:${c.variant_id}`),
    ...policyFacts(ctx.policies).map((f) => `policy:${f.key}`),
    ...ctx.kb.map((k) => `kb:${k.id}`),
  ]);
}

/** Rough token estimate (≈ 4 characters per token for Indonesian/English mixed text). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
