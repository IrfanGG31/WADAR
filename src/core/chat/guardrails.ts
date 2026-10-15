import { normalizePhone } from "@/core/phone";
import { allowedAmounts, contextSourceIds, promiseSourceText, type ChatContext } from "./context";
import { coreName } from "./retrieval";
import type { ChatReply, EscalationCause } from "./schema";
import { extractAmounts, findForbiddenTerms, findPhoneNumbers, hasPhrase, normalizeText } from "./text";

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

const PROMISE_TERMS = ["diskon", "potongan", "gratis ongkir", "garansi", "cashback", "bonus"] as const;

const POSITIVE_STOCK = ["ready", "tersedia", "masih ada", "ada stok", "stok ada", "stok masih", "bisa langsung dikirim"] as const;
const NEGATIVE_STOCK = ["habis", "kosong", "sold out", "tidak tersedia", "tidak ada stok", "stok tidak ada", "lagi tidak ada"] as const;

/** "sisa 3", "tinggal 2 pcs", "stok 4", "3 pcs lagi". */
const STOCK_COUNT =
  /\b(?:sisa|tersisa|tinggal|stok|stock)\s+(?:cuma\s+|hanya\s+|tinggal\s+|sekitar\s+|tersisa\s+)?(\d+)\b|\b(\d+)\s*(?:pcs|pc|buah|botol|unit|porsi|item|biji|pack|lembar)?\s+(?:lagi|tersisa)\b/g;

function cardsMentioned(ctx: ChatContext, normalizedReply: string) {
  return ctx.cards.filter((card) => {
    const core = coreName(card.name);
    return (core && hasPhrase(normalizedReply, normalizeText(core))) || hasPhrase(normalizedReply, normalizeText(card.name));
  });
}

/** The reply text with product names removed, so "Toner Pad 60 Lembar" is not read as "60 lembar lagi". */
function withoutProductNames(ctx: ChatContext, reply: string): string {
  let out = reply.toLowerCase();
  for (const card of ctx.cards) {
    out = out.split(card.name.toLowerCase()).join(" ");
    if (card.option_label) out = out.split(card.option_label.toLowerCase()).join(" ");
  }
  return out;
}

function checkStock(reply: ChatReply, ctx: ChatContext): GuardViolation[] {
  const normalized = normalizeText(reply.reply);
  const mentioned = cardsMentioned(ctx, normalized);
  const scope = mentioned.length > 0 ? mentioned : ctx.cards;
  const out: GuardViolation[] = [];

  const maxHint = scope.reduce((m, c) => Math.max(m, c.qty_hint), 0);
  for (const m of withoutProductNames(ctx, reply.reply).matchAll(STOCK_COUNT)) {
    const n = Number(m[1] ?? m[2]);
    if (n > maxHint) out.push({ rule: "stock", detail: `menyebut stok ${n}, batas yang boleh disebut ${maxHint}` });
  }

  if (mentioned.length > 0) {
    const allOut = mentioned.every((c) => c.availability === "habis");
    const noneOut = mentioned.every((c) => c.availability !== "habis");
    const saysOut = NEGATIVE_STOCK.some((p) => hasPhrase(normalized, p));
    const saysIn = POSITIVE_STOCK.some((p) => hasPhrase(normalized, p));
    if (allOut && saysIn && !saysOut) out.push({ rule: "stock", detail: "menyebut tersedia padahal kartu produk habis" });
    if (noneOut && saysOut && !saysIn) out.push({ rule: "stock", detail: "menyebut habis padahal kartu produk tersedia" });
  }
  return out;
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

  // 5. Janji.
  const normalized = normalizeText(reply.reply);
  const source = normalizeText(promiseSourceText(ctx));
  const promises = PROMISE_TERMS.filter((t) => hasPhrase(normalized, t) && !hasPhrase(source, t));
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
