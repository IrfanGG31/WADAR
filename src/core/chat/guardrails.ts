import { normalizePhone } from "@/core/phone";
import { allowedAmounts, contextSourceIds, promiseSources, type ChatContext } from "./context";
import { coreName } from "./retrieval";
import type { ChatReply, EscalationCause } from "./schema";
import { extractAmounts, findForbiddenTerms, findPhoneNumbers, hasPhrase, normalizeText, words } from "./text";

/**
 * Deterministic guardrails (TECH-SPEC §7.3 step 5), in spec order:
 *  1. escalate flag / confidence < 0.6 / di_luar_cakupan → escalate;
 *  2. harga — every Rp amount must be a card price or a policy amount;
 *  3. stok — stock numbers ≤ qty_hint, availability words match the card;
 *  4. larangan — HPP|modal|margin|untung|saldo|laba or someone else's phone →
 *     block + escalate + `unsafe`;
 *  5. janji — diskon|potongan|gratis ongkir|garansi|cashback|bonus only if the
 *     word is in the retrieved policies/KB;
 *  6. sumber — no (valid) source for an intent other than `sapaan` → escalate.
 *
 * Price and stock mismatches are data errors the model can fix: the first
 * attempt gets one regeneration with feedback, the second escalates. An
 * unsafe reply is never regenerated or sent.
 */
export const MIN_CONFIDENCE = 0.6;

export type GuardRule =
  | "escalate_flag"
  | "low_confidence"
  | "out_of_scope"
  | "price"
  | "stock"
  | "forbidden"
  | "phone"
  | "promise"
  | "sources";

export interface GuardViolation {
  rule: GuardRule;
  detail: string;
}

export interface GuardResult {
  verdict: "pass" | "regenerate" | "escalate";
  violations: GuardViolation[];
  /** Set when verdict = escalate. */
  cause?: EscalationCause;
  /** Larangan hit: the reply must be logged as unsafe and never shown to the buyer. */
  unsafe: boolean;
  /** Set when verdict = regenerate: what the model got wrong, in its own prompt language. */
  feedback?: string;
}

/** Promise claims; any alias counts as the same claim ("ongkir gratis" = "gratis ongkir"). */
const PROMISE_CLAIMS: readonly (readonly string[])[] = [
  ["diskon"],
  ["potongan"],
  ["gratis ongkir", "free ongkir", "bebas ongkir", "ongkir gratis", "gratis ongkos kirim"],
  ["garansi"],
  ["cashback"],
  ["bonus"],
];

const POSITIVE_STOCK = ["ready", "tersedia", "masih ada", "ada stok", "stok ada", "stok masih", "bisa langsung dikirim"] as const;
const NEGATIVE_STOCK = ["habis", "kosong", "sold out", "tidak tersedia", "tidak ada stok", "stok tidak ada", "lagi tidak ada"] as const;

const NUM_WORDS: Record<string, number> = {
  satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11,
};
const UNIT_WORD = "(?:dua|tiga|empat|lima|enam|tujuh|delapan|sembilan)";
const NUM = `\\d+|(?:${UNIT_WORD}|se)\\s(?:belas|puluh)|${Object.keys(NUM_WORDS).join("|")}`;
const COUNT_UNIT = "(?:pcs|pc|buah|botol|unit|porsi|item|biji|pack|pak|lembar|cup|gelas|sachet|box)";
const NOT_COUNT = "(?!\\s*(?:ml|gr|g|gram|kg|mg|cm|%|hari|jam|menit|rb|ribu|jt|juta|k)\\b)";

/**
 * Stock numbers a buyer could read as "this many left": "sisa 3", "stok: 4", "tinggal lima pcs",
 * "cuma 5 pcs", "5 pcs saja", "3 pcs lagi". Group 1 is the number (digit or word).
 */
const STOCK_COUNT = new RegExp(
  `\\b(?:sisa|tersisa|tinggal|stok|stock|persediaan)\\s*[:=]?\\s*(?:(?:cuma|hanya|tinggal|sekitar|tersisa|kurang lebih)\\s+)?(${NUM})\\b${NOT_COUNT}` +
    `|\\b(?:cuma|hanya|tinggal)\\s+(${NUM})\\s*${COUNT_UNIT}\\b` +
    `|\\b(${NUM})\\s*${COUNT_UNIT}?\\s+(?:lagi|tersisa|saja|aja|doang)\\b`,
  "g",
);

function parseCount(token: string): number {
  if (/^\d+$/.test(token)) return Number(token);
  const [first, second] = token.split(/\s+/);
  if (second === undefined) return NUM_WORDS[first] ?? 0;
  const base = first === "se" ? 1 : (NUM_WORDS[first] ?? 0);
  return second === "belas" ? 10 + base : base * 10;
}

interface Mention {
  at: number;
  end: number;
  card: ChatContext["cards"][number];
}

/** Where each retrieved product is named in the (lower-cased) reply — full name or its core name. */
function productMentions(ctx: ChatContext, lower: string): Mention[] {
  const out: Mention[] = [];
  for (const card of ctx.cards) {
    const names = new Set([card.name.toLowerCase(), coreName(card.name).toLowerCase()].filter((n) => n.length > 2));
    for (const name of names) {
      let from = 0;
      for (let i = lower.indexOf(name, from); i !== -1; i = lower.indexOf(name, from)) {
        out.push({ at: i, end: i + name.length, card });
        from = i + name.length;
      }
    }
  }
  // Longest span first at the same start (full name before core name), then drop the contained ones.
  out.sort((x, y) => x.at - y.at || y.end - x.end);
  const kept: Mention[] = [];
  for (const m of out) if (!kept.some((k) => m.at >= k.at && m.end <= k.end)) kept.push(m);
  return kept;
}

/** The reply with product names / options blanked out (same length), so "Toner Pad 60 Lembar" is not "60 lembar lagi". */
function maskProductNames(ctx: ChatContext, lower: string): string {
  let out = lower;
  for (const card of ctx.cards) {
    for (const name of [card.name, card.option_label]) {
      if (!name) continue;
      const n = name.toLowerCase();
      out = out.split(n).join(" ".repeat(n.length));
    }
  }
  return out;
}

const CONNECTORS = new Set(["", "dan", "serta", "sama", "plus", "atau", "juga", "&"]);

function checkStock(reply: ChatReply, ctx: ChatContext): GuardViolation[] {
  const lower = reply.reply.toLowerCase();
  const mentions = productMentions(ctx, lower);
  const out: GuardViolation[] = [];
  const maxAll = ctx.cards.reduce((m, c) => Math.max(m, c.qty_hint), 0);

  // Numbers: bound by the qty_hint of the product they sit next to (nearest mention before, else after).
  for (const m of maskProductNames(ctx, lower).matchAll(STOCK_COUNT)) {
    const n = parseCount(m[1] ?? m[2] ?? m[3]);
    const before = mentions.filter((x) => x.end <= m.index!).at(-1);
    const after = mentions.find((x) => x.at >= m.index!);
    const owner = before ?? after;
    const limit = owner ? owner.card.qty_hint : maxAll;
    if (n > limit) {
      out.push({ rule: "stock", detail: `menyebut stok ${n}${owner ? ` untuk ${owner.card.name}` : ""}, batas yang boleh disebut ${limit}` });
    }
  }

  // Availability words: per product, over the text from its mention to the next product / sentence end.
  const normalizedAt = (from: number, to: number) => normalizeText(lower.slice(from, to));
  for (let i = 0; i < mentions.length; i++) {
    // Mentions joined only by "dan" / "," share the claim that follows ("A dan B ready").
    const group = [mentions[i]];
    let j = i;
    while (j + 1 < mentions.length) {
      const gap = normalizedAt(mentions[j].end, mentions[j + 1].at);
      if (!CONNECTORS.has(gap)) break;
      group.push(mentions[++j]);
    }
    const tail = lower.slice(mentions[j].end);
    const stop = tail.search(/[.!?\n]/);
    const nextMention = mentions[j + 1]?.at ?? Infinity;
    const to = Math.min(nextMention, stop === -1 ? Infinity : mentions[j].end + stop, lower.length);
    const segment = normalizedAt(mentions[j].end, to);
    const saysOut = NEGATIVE_STOCK.some((p) => hasPhrase(segment, p));
    const saysIn = POSITIVE_STOCK.some((p) => hasPhrase(segment, p));
    for (const { card } of group) {
      if (card.availability === "habis" && saysIn && !saysOut) {
        out.push({ rule: "stock", detail: `menyebut ${card.name} tersedia padahal kartu produk habis` });
      }
      if (card.availability !== "habis" && saysOut && !saysIn) {
        out.push({ rule: "stock", detail: `menyebut ${card.name} habis padahal kartu produk tersedia` });
      }
    }
    i = j;
  }
  return out;
}

/** Clause boundaries: punctuation not followed by a digit ("250.000" stays whole), newlines, "dan"/"tapi". */
const SENTENCE_SPLIT = /[.,;!?]+(?!\d)|\n+|\s(?:dan|tapi|serta|namun)\s/;

function sentencesOf(text: string): string[] {
  return text.split(SENTENCE_SPLIT).map((x) => x.trim()).filter(Boolean);
}

/** Digits a sentence commits to ("50%", "Rp250.000", "2 tahun"), as plain digit strings. */
function numbersIn(text: string): Set<string> {
  return new Set([...text.matchAll(/\d[\d.,]*/g)].map((m) => m[0].replace(/\D/g, "")).filter(Boolean));
}

function containsAll(sentenceWords: Set<string>, phrase: string): boolean {
  return phrase.split(" ").every((w) => sentenceWords.has(w));
}

function findUnbackedPromises(replyText: string, sources: string[]): string[] {
  const sourceSentences = sources.flatMap(sentencesOf).map((t) => ({
    words: new Set(words(normalizeText(t))),
    numbers: numbersIn(t),
  }));
  const bad = new Set<string>();
  for (const sentence of sentencesOf(replyText)) {
    const w = new Set(words(normalizeText(sentence)));
    const nums = numbersIn(sentence);
    for (const aliases of PROMISE_CLAIMS) {
      if (!aliases.some((alias) => containsAll(w, normalizeText(alias)))) continue;
      const backed = sourceSentences.some(
        (src) => aliases.some((alias) => containsAll(src.words, normalizeText(alias))) && [...nums].every((n) => src.numbers.has(n)),
      );
      if (!backed) bad.add(aliases[0]);
    }
  }
  return [...bad];
}

function checkPhones(reply: ChatReply, ctx: ChatContext): GuardViolation[] {
  const allowed = new Set(
    [ctx.buyerPhone ?? null, ctx.policies.admin_contact ? normalizePhone(ctx.policies.admin_contact) : null].filter(
      (p): p is string => Boolean(p),
    ),
  );
  return findPhoneNumbers(reply.reply)
    .filter((raw) => {
      const e164 = normalizePhone(raw);
      return !e164 || !allowed.has(e164);
    })
    .map((raw) => ({ rule: "phone" as const, detail: `nomor HP ${raw.trim()} bukan milik pembeli atau toko` }));
}

export function checkReply(reply: ChatReply, ctx: ChatContext, attempt: number): GuardResult {
  const violations: GuardViolation[] = [];

  // 1. The model's own call.
  if (reply.escalate) violations.push({ rule: "escalate_flag", detail: reply.escalate_reason ?? "other" });
  if (reply.confidence < MIN_CONFIDENCE) violations.push({ rule: "low_confidence", detail: String(reply.confidence) });
  if (reply.intent === "di_luar_cakupan") violations.push({ rule: "out_of_scope", detail: "di_luar_cakupan" });

  // 2. Harga.
  const allowed = allowedAmounts(ctx);
  const badAmounts = extractAmounts(reply.reply).filter((a) => !allowed.has(a));
  if (badAmounts.length > 0) violations.push({ rule: "price", detail: badAmounts.join(", ") });

  // 3. Stok.
  violations.push(...checkStock(reply, ctx));

  // 4. Larangan.
  const forbidden = findForbiddenTerms(reply.reply);
  if (forbidden.length > 0) violations.push({ rule: "forbidden", detail: forbidden.join(", ") });
  violations.push(...checkPhones(reply, ctx));

  // 5. Janji — per claim (sentence), not per document: the claim's words must sit together in
  // one policy/KB sentence, and any number the buyer is promised must be in that sentence too.
  const promises = findUnbackedPromises(reply.reply, promiseSources(ctx));
  if (promises.length > 0) violations.push({ rule: "promise", detail: promises.join(", ") });

  // 6. Sumber.
  const known = contextSourceIds(ctx);
  const validSources = reply.sources.filter((s) => known.has(`${s.type}:${s.id}`));
  if (reply.intent !== "sapaan" && validSources.length === 0) violations.push({ rule: "sources", detail: "tanpa sumber" });

  return decide(reply, violations, attempt);
}

function decide(reply: ChatReply, violations: GuardViolation[], attempt: number): GuardResult {
  const has = (rule: GuardRule) => violations.some((v) => v.rule === rule);
  if (violations.length === 0) return { verdict: "pass", violations, unsafe: false };

  if (has("forbidden") || has("phone")) return { verdict: "escalate", violations, cause: "unsafe", unsafe: true };

  if (has("escalate_flag") || has("low_confidence") || has("out_of_scope")) {
    return { verdict: "escalate", violations, cause: modelCause(reply), unsafe: false };
  }

  const dataErrors = violations.filter((v) => v.rule === "price" || v.rule === "stock");
  if (dataErrors.length > 0 && dataErrors.length === violations.length && attempt === 0) {
    return { verdict: "regenerate", violations, unsafe: false, feedback: feedbackFor(dataErrors) };
  }
  if (has("price")) return { verdict: "escalate", violations, cause: "price_mismatch", unsafe: false };
  if (has("stock")) return { verdict: "escalate", violations, cause: "stock_mismatch", unsafe: false };
  if (has("promise")) return { verdict: "escalate", violations, cause: "policy_exception", unsafe: false };
  return { verdict: "escalate", violations, cause: "not_in_store_data", unsafe: false };
}

function modelCause(reply: ChatReply): EscalationCause {
  if (reply.escalate && reply.escalate_reason && reply.escalate_reason !== "other") return reply.escalate_reason;
  if (reply.intent === "di_luar_cakupan") return "out_of_scope";
  if (reply.confidence < MIN_CONFIDENCE) return "low_confidence";
  return "other";
}

function feedbackFor(errors: GuardViolation[]): string {
  const lines = errors.map((e) =>
    e.rule === "price"
      ? `Nominal ${e.detail} tidak ada di KARTU PRODUK atau KEBIJAKAN. Pakai hanya harga yang tertulis di data toko.`
      : `Info stok salah (${e.detail}). Ikuti ketersediaan di KARTU PRODUK dan jangan sebut angka stok di atas qty_hint.`,
  );
  return lines.join("\n");
}

/** Last line of defence for any text about to reach a buyer (replies, holding messages, manual-mode notices). */
export function isSafeOutgoing(text: string): boolean {
  return findForbiddenTerms(text).length === 0;
}
