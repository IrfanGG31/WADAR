/**
 * Number grounding for Konsultasi answers (TECH-SPEC §7.4). Every rupiah amount
 * (Rp/IDR/rupiah/rb/jt or a bare figure ≥ 1.000), count ("12 pcs") and
 * percentage the model writes must match a value in the tool results /
 * snapshot it was given (±Rp1.000, ±1 point, counts exact), with the same
 * direction when it says naik/turun. The question is never evidence, and an
 * empty answer fails. A failing answer is regenerated
 * once with feedback, then replaced by a template built from the tool results.
 * Pure: the model call is injected, nothing here reads a clock or the network.
 */

export const RUPIAH_TOLERANCE = 1_000;
export const PERCENT_TOLERANCE = 1;

export interface Claim {
  /** rupiah: Rp/IDR/rupiah/unit amounts; number: a bare figure ≥ 1.000; count: "12 pcs". */
  kind: "rupiah" | "percent" | "count" | "number";
  /** The text as written, e.g. "Rp1,2 juta". */
  text: string;
  /** Absolute value: rupiah as an integer, percent as a number. */
  value: number;
  /** Allowed distance to an evidence value — wider when the model rounded ("Rp1,2 juta"). */
  tolerance: number;
  /** "naik 30%" / "turun Rp77.340": the sign the matching evidence value must have. */
  direction?: "up" | "down";
}

/**
 * Evidence the answer may quote, signed: a fall is negative (`delta: -77340`,
 * "turun Rp77.340"), so "turun" can only match a fall. Percent-keyed values go
 * to `percents`, every other number (rupiah, counts) to `numbers`.
 */
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

const RUPIAH_RE = /(-|−)?\s*(?:Rp\.?|IDR)\s*(-|−)?\s*(\d[\d.,]*)(?:\s*(ribu|rb|juta|jt|miliar|milyar|k|m)\b)?/gi;
const BARE_UNIT_RE = /(?<![\w.,])(\d[\d.,]*)\s*(ribu|rb|juta|jt|miliar|milyar)\b/gi;
const RUPIAH_WORD_RE = /(?<![\w.,])(\d[\d.,]*)\s*rupiah\b/gi;
const COUNT_RE = /(?<![\w.,])(\d[\d.,]*)\s*(?:pcs|pc|buah|botol|unit|item|biji|pack|pak|lusin|box|sachet|porsi|cup)\b/gi;
const PERCENT_RE = /(\d[\d.,]*)\s*(?:%|persen\b|poin\b)/gi;
/** A bare figure: grouped ("1.250.000") or ≥ 4 digits; not part of a date, time, code or decimal. */
const PLAIN_RE = /(?<![\w.,\-\/:])(\d{1,3}(?:\.\d{3})+|\d{4,})(?![\w\-\/:]|[.,]\d)/g;

/** "naik 30%", "turun sebesar Rp77.340", "anjlok hampir 40%" — but not "turun jadi Rp500.000" (a level). */
const DIRECTION_BEFORE =
  /\b(naik|turun|meningkat|menurun|bertambah|berkurang|melonjak|anjlok|merosot|tumbuh|drop)(?:nya)?\s+(?:(?:sebesar|sekitar|hampir|kurang lebih|sampai|hingga|lebih dari|sebanyak)\s+)?$/i;
const UP_WORDS = new Set(["naik", "meningkat", "bertambah", "melonjak", "tumbuh"]);

function directionAt(text: string, index: number, minusSign: boolean): Claim["direction"] {
  if (minusSign) return "down";
  const word = text.slice(Math.max(0, index - 40), index).match(DIRECTION_BEFORE)?.[1]?.toLowerCase();
  if (!word) return undefined;
  return UP_WORDS.has(word) ? "up" : "down";
}

/** Rupiah amounts, percentages, counts and bare figures the text asserts. Grouped by kind, each in order of appearance. */
export function extractClaims(text: string): Claim[] {
  const claims: Claim[] = [];
  const taken: Array<[number, number]> = [];
  const overlaps = (a: number, b: number) => taken.some(([s, e]) => a < e && b > s);
  const push = (m: RegExpMatchArray, claim: Omit<Claim, "direction">, minusSign = false) => {
    // The number starts after an optional sign / "Rp": read the direction from the text before the match.
    const lead = m[0].length - m[0].trimStart().length;
    const direction = directionAt(text, m.index! + lead, minusSign);
    claims.push(direction ? { ...claim, direction } : claim);
    taken.push([m.index!, m.index! + m[0].length]);
  };
  const clean = (raw: string) => raw.replace(/[.,]+$/, "");

  for (const m of text.matchAll(RUPIAH_RE)) {
    const unit = m[4]?.toLowerCase();
    const parsed = parseIdNumber(clean(m[3]), Boolean(unit));
    if (!parsed) continue;
    const mult = unit ? UNITS[unit] : 1;
    const value = Math.round(parsed.value * mult);
    // Rounded to the shown precision: "1,2 juta" is anywhere in ±50.000.
    const half = unit ? Math.round((mult / 10 ** parsed.decimals) / 2) : 0;
    push(m, { kind: "rupiah", text: clean(m[0].trim()), value, tolerance: Math.max(RUPIAH_TOLERANCE, half + RUPIAH_TOLERANCE) }, Boolean(m[1] || m[2]));
  }
  for (const m of text.matchAll(BARE_UNIT_RE)) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    const unit = m[2].toLowerCase();
    const parsed = parseIdNumber(clean(m[1]), true);
    if (!parsed) continue;
    const mult = UNITS[unit];
    const half = Math.round((mult / 10 ** parsed.decimals) / 2);
    push(m, {
      kind: "rupiah",
      text: clean(m[0].trim()),
      value: Math.round(parsed.value * mult),
      tolerance: Math.max(RUPIAH_TOLERANCE, half + RUPIAH_TOLERANCE),
    });
  }
  for (const m of text.matchAll(RUPIAH_WORD_RE)) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    const parsed = parseIdNumber(clean(m[1]), false);
    if (!parsed) continue;
    push(m, { kind: "rupiah", text: m[0].trim(), value: Math.round(parsed.value), tolerance: RUPIAH_TOLERANCE });
  }
  for (const m of text.matchAll(COUNT_RE)) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    const parsed = parseIdNumber(clean(m[1]), false);
    if (!parsed) continue;
    push(m, { kind: "count", text: m[0].trim(), value: parsed.value, tolerance: 0 });
  }
  const percents: Claim[] = [];
  for (const m of text.matchAll(PERCENT_RE)) {
    const parsed = parseIdNumber(clean(m[1]), true);
    if (!parsed) continue;
    const direction = directionAt(text, m.index, false);
    const claim: Claim = { kind: "percent", text: m[0].trim(), value: parsed.value, tolerance: PERCENT_TOLERANCE };
    percents.push(direction ? { ...claim, direction } : claim);
    taken.push([m.index, m.index + m[0].length]);
  }
  for (const m of text.matchAll(PLAIN_RE)) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    // An undotted 4-digit figure in this range reads as a year ("2026"), not an amount.
    if (/^\d{4}$/.test(m[1]) && Number(m[1]) >= 1900 && Number(m[1]) <= 2100) continue;
    push(m, { kind: "number", text: m[1], value: Number(m[1].replace(/\./g, "")), tolerance: RUPIAH_TOLERANCE });
  }
  return [...claims, ...percents];
}

/** Keys that hold a percentage (`margin_pct`, `delta_pct`, `pct`). */
const PCT_KEY = /(^|_)pct$/;

/**
 * Every numeric leaf of the tool results, signed. Percent-keyed leaves go to
 * `percents` only; everything else (rupiah, quantities, counts) to `numbers`.
 * Sentences ("turun Rp77.340") count with the sign their words give.
 */
export function collectEvidence(...sources: unknown[]): Evidence {
  const numbers = new Set<number>();
  const percents = new Set<number>();
  const walk = (v: unknown, key: string) => {
    if (typeof v === "number" && Number.isFinite(v)) {
      (PCT_KEY.test(key) ? percents : numbers).add(v);
    } else if (typeof v === "bigint") {
      numbers.add(Number(v));
    } else if (typeof v === "string") {
      // Template sentences from the core already carry their numbers ("Rp1.250.000", "18%").
      for (const c of extractClaims(v)) {
        (c.kind === "percent" ? percents : numbers).add(c.direction === "down" ? -c.value : c.value);
      }
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
  /** Ungrounded claims whose number appears in the owner's question: echoed, not verified. */
  fromQuestion: Claim[];
  /** The answer was empty / whitespace. */
  empty: boolean;
}

function matches(c: Claim, e: number): boolean {
  if (Math.abs(Math.abs(e) - c.value) > c.tolerance) return false;
  if (c.direction === "up") return e > 0;
  if (c.direction === "down") return e < 0;
  return true;
}

/**
 * `question` is never evidence (the client sends it, and a leading question
 * would ground its own number); it only labels which wrong numbers came from it.
 */
export function checkGrounding(answer: string, evidence: Evidence, question?: string): GroundingResult {
  if (!answer.trim()) return { ok: false, claims: [], ungrounded: [], fromQuestion: [], empty: true };
  const claims = extractClaims(answer);
  const ungrounded = claims.filter((c) => {
    const pool = c.kind === "percent" ? evidence.percents : evidence.numbers;
    return !pool.some((e) => matches(c, e));
  });
  const asked = question ? extractClaims(question) : [];
  const fromQuestion = ungrounded.filter((c) => asked.some((q) => (q.kind === "percent") === (c.kind === "percent") && Math.abs(q.value - c.value) <= c.tolerance));
  return { ok: ungrounded.length === 0, claims, ungrounded, fromQuestion, empty: false };
}

/** The correction sent with the single regeneration. */
export function groundingFeedback(ungrounded: readonly Claim[], fromQuestion: readonly Claim[] = []): string {
  const quote = (cs: readonly Claim[]) => cs.map((c) => `"${c.text}"`).join(", ");
  const echoed = new Set(fromQuestion);
  const rest = ungrounded.filter((c) => !echoed.has(c));
  const lines: string[] = [];
  if (rest.length > 0) {
    lines.push(
      `Angka berikut tidak ada di hasil tool: ${quote(rest)}. Tulis ulang jawaban hanya dengan angka yang ` +
        `persis ada di hasil tool atau snapshot (jangan menghitung sendiri, jangan membulatkan berbeda, arah naik/turun harus sama).`,
    );
  }
  if (fromQuestion.length > 0) {
    lines.push(
      `Angka ${quote(fromQuestion)} hanya ada di pertanyaan, bukan di data toko: jangan dibenarkan. ` +
        `Jawab dengan angka dan arah (naik/turun) dari hasil tool.`,
    );
  }
  return lines.join("\n");
}

export const EMPTY_FEEDBACK = "Jawabanmu kosong. Tulis jawaban singkat (≤ 4 kalimat) dari hasil tool atau snapshot.";

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
  /** The owner's question: never evidence, only used to word the feedback. */
  question?: string;
  onReject?: (info: { attempt: number; ungrounded: Claim[] }) => void;
}): Promise<GroundedOutcome> {
  let feedback: string | undefined;
  let last: GroundingResult | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await opts.generate(feedback);
    last = checkGrounding(text, opts.evidence(), opts.question);
    if (last.ok) return { text, source: attempt === 1 ? "model" : "regenerated", attempts: attempt, rejected: [] };
    opts.onReject?.({ attempt, ungrounded: last.ungrounded });
    feedback = last.empty ? EMPTY_FEEDBACK : groundingFeedback(last.ungrounded, last.fromQuestion);
  }
  return { text: opts.template(), source: "template", attempts: 2, rejected: last?.ungrounded ?? [] };
}
