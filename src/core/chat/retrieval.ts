import type { KbSnippet, ProductCard } from "./schema";
import { normalizeText, words } from "./text";

/**
 * Retrieval for Customer Chat (TECH-SPEC §7.3 step 3, §7.5):
 *  - product cards: trigram similarity on the product name (> 0.3) fused with
 *    catalog-embedding hits → top-5;
 *  - KB: vector top-20 + tsvector top-20 → Reciprocal Rank Fusion (k = 60),
 *    FAQ weighted ×1.2 → top-3.
 * Pure functions; the db layer supplies the candidate lists.
 */

export const TRIGRAM_THRESHOLD = 0.3;
export const PRODUCT_LIMIT = 5;
export const KB_LIMIT = 3;
export const RRF_K = 60;
export const FAQ_BOOST = 1.2;

// ── Trigrams (same rules as Postgres pg_trgm) ────────────────────────────────

/**
 * pg_trgm's trigram set: lowercase, split into alphanumeric words, pad each
 * word with two spaces in front and one behind, take every 3-character run,
 * de-duplicate. `trigrams("Vit C")` = {"  v"," vi","vit","it ","  c"," c "}.
 */
export function trigrams(input: string): Set<string> {
  const out = new Set<string>();
  for (const word of input.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue;
    const padded = `  ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  }
  return out;
}

/** pg_trgm `similarity(a, b)`: shared trigrams / all distinct trigrams of both. */
export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / (ta.size + tb.size - shared);
}

/**
 * The product name without size/volume tokens: "Hyaluronic Toner 100ml" →
 * "hyaluronic toner", "Toner Pad 60 Lembar" → "toner pad". Shoppers rarely
 * type the size, and those trigrams would push a plain "toner" below 0.3.
 */
const SIZE_UNITS = new Set(["ml", "g", "gr", "gram", "l", "lembar", "pcs", "pc", "isi"]);
export function coreName(name: string): string {
  const tokens = name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const kept: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/\d/.test(token)) continue;
    if (SIZE_UNITS.has(token) && i > 0 && /\d/.test(tokens[i - 1])) continue;
    kept.push(token);
  }
  return kept.join(" ");
}

/**
 * How well a message names this product: the best pg_trgm similarity between
 * any run of 1…(name words + 1) consecutive message words and the product
 * name (full, without sizes, or with the variant label). This is the
 * message-vs-name analogue of pg_trgm `word_similarity`, built from plain
 * `similarity` so the 0.3 threshold of the spec keeps its meaning.
 */
export function nameMatchScore(message: string, card: Pick<ProductCard, "name" | "option_label">): number {
  return bestNameWindow(words(normalizeText(message)), card).score;
}

export interface NameWindow {
  score: number;
  /** Index of the first message word of the best window, and its length in words. */
  start: number;
  length: number;
}

/** {@link nameMatchScore} over pre-split words, with the window that scored. Empty strings are skipped words. */
export function bestNameWindow(msgWords: readonly string[], card: Pick<ProductCard, "name" | "option_label">): NameWindow {
  const best: NameWindow = { score: 0, start: 0, length: 0 };
  if (msgWords.length === 0) return best;
  const targets = [card.name, coreName(card.name)];
  if (card.option_label) targets.push(`${card.name} ${card.option_label}`, `${coreName(card.name)} ${card.option_label}`);
  const maxLen = Math.min(6, card.name.split(/\s+/).length + 1);
  for (let len = 1; len <= maxLen; len++) {
    for (let start = 0; start + len <= msgWords.length; start++) {
      const window = msgWords.slice(start, start + len).join(" ");
      for (const target of targets) {
        if (!target) continue;
        const score = trigramSimilarity(window, target);
        if (score > best.score) Object.assign(best, { score, start, length: len });
      }
    }
  }
  return best;
}

/**
 * The message contains a whole word of the product name (≥ 4 letters, not
 * chat filler): "toner ada?" names every toner, even "Exfoliating Toner AHA
 * BHA" whose full-name similarity stays under 0.3.
 */
export function namesProductWord(message: string, card: Pick<ProductCard, "name" | "option_label">): boolean {
  const nameWords = new Set(words(normalizeText(`${coreName(card.name)} ${card.option_label ?? ""}`)));
  return searchTerms(message).some((term) => term.length >= 4 && nameWords.has(term));
}

export interface ScoredCard {
  card: ProductCard;
  score: number;
}

/** Cards whose name scores above the threshold, best first (ties: catalog order). */
export function trigramCandidates(message: string, cards: readonly ProductCard[], threshold = TRIGRAM_THRESHOLD): ScoredCard[] {
  return cards
    .map((card, index) => ({ card, score: nameMatchScore(message, card), index }))
    .filter((c) => c.score > threshold)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ card, score }) => ({ card, score }));
}

// ── Reciprocal Rank Fusion ──────────────────────────────────────────────────

export interface RankedList {
  /** Ids best first. */
  ids: readonly string[];
}

export interface FusedItem {
  id: string;
  score: number;
}

/**
 * RRF (Cormack et al.): score(d) = weight(d) × Σ_lists 1 / (k + rank_list(d)),
 * rank starting at 1. Ties keep first appearance (list order, then rank), so
 * the result is deterministic.
 */
export function reciprocalRankFusion(
  lists: readonly RankedList[],
  { k = RRF_K, weight = () => 1 }: { k?: number; weight?: (id: string) => number } = {},
): FusedItem[] {
  const scores = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  let order = 0;
  for (const list of lists) {
    list.ids.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
      if (!firstSeen.has(id)) firstSeen.set(id, order++);
    });
  }
  return [...scores.entries()]
    .map(([id, sum]) => ({ id, score: sum * weight(id) }))
    .sort((a, b) => b.score - a.score || (firstSeen.get(a.id) ?? 0) - (firstSeen.get(b.id) ?? 0));
}

/** A KB candidate from the database (vector or tsvector side). */
export interface KbCandidate extends KbSnippet {
  /** 1-based rank on the vector side, null if not in the vector top-20. */
  vec_rank: number | null;
  /** 1-based rank on the tsvector side, null if not in the text top-20. */
  txt_rank: number | null;
}

/** Hybrid KB search → top-3 snippets + the best fused score (`retrieval_score`). */
export function fuseKb(candidates: readonly KbCandidate[], limit = KB_LIMIT): { snippets: KbSnippet[]; retrievalScore: number } {
  const byRank = (key: "vec_rank" | "txt_rank") =>
    candidates
      .filter((c) => c[key] !== null)
      .sort((a, b) => (a[key] as number) - (b[key] as number))
      .map((c) => c.id);
  const kind = new Map(candidates.map((c) => [c.id, c.kind]));
  const fused = reciprocalRankFusion([{ ids: byRank("vec_rank") }, { ids: byRank("txt_rank") }], {
    weight: (id) => (kind.get(id) === "faq" ? FAQ_BOOST : 1),
  }).slice(0, limit);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  return {
    snippets: fused.map(({ id }) => {
      const c = byId.get(id)!;
      const snippet: KbSnippet = { id: c.id, kind: c.kind, content: c.content };
      if (c.question !== undefined) snippet.question = c.question;
      if (c.answer !== undefined) snippet.answer = c.answer;
      return snippet;
    }),
    retrievalScore: fused[0]?.score ?? 0,
  };
}

/**
 * Product cards for the context: trigram ranking fused (RRF) with whole-word
 * name hits and catalog-embedding hits (product names, best first), top-5. Every variant of a
 * matched product rides along up to the limit so "warna apa aja?" sees all options.
 */
export function rankProductCards(
  message: string,
  cards: readonly ProductCard[],
  catalogHits: readonly string[] = [],
  limit = PRODUCT_LIMIT,
): ProductCard[] {
  const trigramNames = unique(trigramCandidates(message, cards).map((c) => c.card.name));
  const wordNames = unique(
    cards
      .filter((c) => namesProductWord(message, c))
      .map((c) => ({ name: c.name, score: nameMatchScore(message, c) }))
      .sort((a, b) => b.score - a.score)
      .map((c) => c.name),
  );
  const known = new Set(cards.map((c) => c.name));
  const fusedNames = reciprocalRankFusion([
    { ids: trigramNames },
    { ids: wordNames },
    { ids: catalogHits.filter((n) => known.has(n)) },
  ]).map((f) => f.id);
  const out: ProductCard[] = [];
  for (const name of fusedNames) {
    for (const card of cards) {
      if (card.name === name && out.length < limit) out.push(card);
    }
  }
  return out;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

// ── Lexical side (tsvector 'simple') ────────────────────────────────────────

/** Chat filler that carries no meaning for a KB lookup (the 'simple' config has no stopwords). */
const STOPWORDS = new Set(
  (
    "kak kakak admin halo hai hi hallo pagi siang sore malam permisi assalamualaikum ada apa saja yang dan di ke dari ini itu " +
    "bisa tidak dong ya yah sih nih kah mau saya aku kamu gimana bagaimana berapa untuk dengan sama juga atau kalau kalo klo " +
    "apakah tolong mohon terima kasih thanks ok oke masih lagi sudah belum akan boleh punya mana gitu kok deh lho loh kan nya " +
    "the is are dulu banget aja si pak bu mas mbak sis gan tanya nanya mo pengen ingin bang cuma hanya kah lah"
  ).split(" "),
);

/** Up to 12 distinct content words of a message, normalized ("Kak, ongkir ke Surabaya brp?" → ongkir, surabaya). */
export function searchTerms(message: string): string[] {
  const out: string[] = [];
  for (const word of words(normalizeText(message))) {
    if (word.length < 2 || STOPWORDS.has(word) || out.includes(word)) continue;
    out.push(word);
    if (out.length === 12) break;
  }
  return out;
}

/**
 * In-memory stand-in for the tsvector side (`to_tsquery('simple', t1 | t2 …)`
 * ranked by matched terms): used by tests and the offline fixture store.
 */
export function lexicalRank(terms: readonly string[], snippets: readonly KbSnippet[], limit = 20): string[] {
  return snippets
    .map((s, index) => {
      const tokens = new Set(words(normalizeText(s.content)));
      return { id: s.id, index, hits: terms.filter((t) => tokens.has(t)).length };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.index - b.index)
    .slice(0, limit)
    .map((s) => s.id);
}
