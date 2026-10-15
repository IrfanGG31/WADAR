/**
 * Number grounding for Konsultasi answers (TECH-SPEC §7.4). Every rupiah amount
 * and percentage the model writes must match a value in the tool results /
 * snapshot it was given (±Rp1.000, ±1 point). A failing answer is regenerated
 * once with feedback, then replaced by a template built from the tool results.
 * Pure: the model call is injected, nothing here reads a clock or the network.
 */

export const RUPIAH_TOLERANCE = 1_000;
export const PERCENT_TOLERANCE = 1;

export interface Claim {
  kind: "rupiah" | "percent";
  /** The text as written, e.g. "Rp1,2 juta". */
  text: string;
  /** Absolute value: rupiah as an integer, percent as a number. */
  value: number;
  /** Allowed distance to an evidence value — wider when the model rounded ("Rp1,2 juta"). */
  tolerance: number;
}

/** Evidence the answer may quote: money/count values and percentages, absolute. */
export interface Evidence {
  numbers: number[];
  percents: number[];
}

const UNITS: Record<string, number> = {
  rb: 1_000,
  ribu: 1_000,
  k: 1_000,
  jt: 1_000_000,
  juta: 1_000_000,
  m: 1_000_000_000,
  miliar: 1_000_000_000,
  milyar: 1_000_000_000,
};

/** "1.250.000" → 1250000, "1,2" → 1.2, "2.5" with a unit → 2.5. Returns the value and its decimal places. */
function parseIdNumber(raw: string, hasUnit: boolean): { value: number; decimals: number } | null {
  let s = raw.trim();
  if (!/^\d[\d.,]*$/.test(s)) return null;
  if (s.includes(",")) {
    // "1.234,5" — dots are thousands, the comma is the decimal separator.
    const [int, frac = ""] = s.split(",");
    const v = Number(`${int.replace(/\./g, "")}.${frac}`);
    return Number.isFinite(v) ? { value: v, decimals: frac.length } : null;
  }
  const dots = s.split(".").length - 1;
  if (dots === 0) return { value: Number(s), decimals: 0 };
  const lastGroup = s.split(".").pop() ?? "";
  // "1.250.000" and "1.250" (no unit) are thousands; "2.5 jt" is a decimal.
  if (dots > 1 || (lastGroup.length === 3 && !hasUnit)) {
    s = s.replace(/\./g, "");
    return { value: Number(s), decimals: 0 };
  }
  return { value: Number(s), decimals: lastGroup.length };
}

const RUPIAH_RE = /(-|−)?\s*Rp\.?\s*(-|−)?\s*(\d[\d.,]*)(?:\s*(ribu|rb|juta|jt|miliar|milyar|k|m)\b)?/gi;
const BARE_UNIT_RE = /(?<![\w.,])(\d[\d.,]*)\s*(ribu|rb|juta|jt|miliar|milyar)\b/gi;
const PERCENT_RE = /(\d[\d.,]*)\s*(?:%|persen\b|poin\b)/gi;

/** Rupiah amounts and percentages the text asserts. Order of appearance. */
export function extractClaims(text: string): Claim[] {
  const claims: Claim[] = [];
  const taken: Array<[number, number]> = [];
  const overlaps = (a: number, b: number) => taken.some(([s, e]) => a < e && b > s);

  for (const m of text.matchAll(RUPIAH_RE)) {
    const unit = m[4]?.toLowerCase();
    const parsed = parseIdNumber(m[3].replace(/[.,]+$/, ""), Boolean(unit));
    if (!parsed) continue;
    const mult = unit ? UNITS[unit] : 1;
    const value = Math.round(parsed.value * mult);
    // Rounded to the shown precision: "1,2 juta" is anywhere in ±50.000.
    const half = unit ? Math.round((mult / 10 ** parsed.decimals) / 2) : 0;
    claims.push({ kind: "rupiah", text: m[0].trim().replace(/[.,]+$/, ""), value, tolerance: Math.max(RUPIAH_TOLERANCE, half + RUPIAH_TOLERANCE) });
    taken.push([m.index, m.index + m[0].length]);
  }
  for (const m of text.matchAll(BARE_UNIT_RE)) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    const unit = m[2].toLowerCase();
    const parsed = parseIdNumber(m[1].replace(/[.,]+$/, ""), true);
    if (!parsed) continue;
    const mult = UNITS[unit];
    const half = Math.round((mult / 10 ** parsed.decimals) / 2);
    claims.push({
      kind: "rupiah",
      text: m[0].trim().replace(/[.,]+$/, ""),
      value: Math.round(parsed.value * mult),
      tolerance: Math.max(RUPIAH_TOLERANCE, half + RUPIAH_TOLERANCE),
    });
    taken.push([m.index, m.index + m[0].length]);
  }
  for (const m of text.matchAll(PERCENT_RE)) {
    const parsed = parseIdNumber(m[1].replace(/[.,]+$/, ""), true);
    if (!parsed) continue;
    claims.push({ kind: "percent", text: m[0].trim(), value: parsed.value, tolerance: PERCENT_TOLERANCE });
  }
  return claims;
}

/** Keys that hold a percentage (`margin_pct`, `delta_pct`, `pct`). */
const PCT_KEY = /(^|_)pct$/;

/**
 * Every numeric leaf of the tool results, absolute. Percent-keyed leaves go to
 * `percents` only; everything else (rupiah, quantities, counts) to `numbers`.
 */
export function collectEvidence(...sources: unknown[]): Evidence {
  const numbers = new Set<number>();
  const percents = new Set<number>();
  const walk = (v: unknown, key: string) => {
    if (typeof v === "number" && Number.isFinite(v)) {
      (PCT_KEY.test(key) ? percents : numbers).add(Math.abs(v));
    } else if (typeof v === "bigint") {
      numbers.add(Math.abs(Number(v)));
    } else if (typeof v === "string") {
      // Template sentences from the core already carry their numbers ("Rp1.250.000", "18%").
      for (const c of extractClaims(v)) (c.kind === "percent" ? percents : numbers).add(c.value);
    } else if (Array.isArray(v)) {
      for (const x of v) walk(x, key);
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) walk(x, k);
    }
  };
  for (const s of sources) walk(s, "");
  return { numbers: [...numbers], percents: [...percents] };
}

export interface GroundingResult {
  ok: boolean;
  claims: Claim[];
  /** Claims that match nothing in the evidence. */
  ungrounded: Claim[];
}

export function checkGrounding(answer: string, evidence: Evidence): GroundingResult {
  const claims = extractClaims(answer);
  const ungrounded = claims.filter((c) => {
    const pool = c.kind === "percent" ? evidence.percents : evidence.numbers;
    return !pool.some((e) => Math.abs(e - c.value) <= c.tolerance);
  });
  return { ok: ungrounded.length === 0, claims, ungrounded };
}

/** The correction sent with the single regeneration. */
export function groundingFeedback(ungrounded: readonly Claim[]): string {
  const list = ungrounded.map((c) => `"${c.text}"`).join(", ");
  return (
    `Angka berikut tidak ada di hasil tool: ${list}. Tulis ulang jawaban hanya dengan angka yang ` +
    `persis ada di hasil tool atau snapshot (jangan menghitung sendiri, jangan membulatkan berbeda).`
  );
}

export type GroundedSource = "model" | "regenerated" | "template";

export interface GroundedOutcome {
  text: string;
  source: GroundedSource;
  /** How many model drafts were produced (0–2). */
  attempts: number;
  /** Claims that were still wrong on the last draft when the template took over. */
  rejected: Claim[];
}

/**
 * Draft → check → (one regeneration with feedback) → template.
 * `generate(feedback)` returns the model text; `evidence()` is read after each
 * draft because tool calls made while drafting add to it. Throws only if
 * `generate` throws — the caller decides what an unavailable model means.
 */
export async function groundAnswer(opts: {
  generate: (feedback?: string) => Promise<string>;
  evidence: () => Evidence;
  template: () => string;
  onReject?: (info: { attempt: number; ungrounded: Claim[] }) => void;
}): Promise<GroundedOutcome> {
  let feedback: string | undefined;
  let last: GroundingResult | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await opts.generate(feedback);
    last = checkGrounding(text, opts.evidence());
    if (last.ok) return { text, source: attempt === 1 ? "model" : "regenerated", attempts: attempt, rejected: [] };
    opts.onReject?.({ attempt, ungrounded: last.ungrounded });
    feedback = groundingFeedback(last.ungrounded);
  }
  return { text: opts.template(), source: "template", attempts: 2, rejected: last?.ungrounded ?? [] };
}
