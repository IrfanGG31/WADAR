import type { RunMeter } from "@/core/chat/pipeline";

/**
 * Cost meter (TECH-SPEC §6.3):
 *   cost_idr = ((in − cached) × P_in + cached × P_cached + out × P_out) / 1e6 × KURS × 1.11 × 1.2
 * Prices live here only. They are USD per 1M tokens written ×1000 (milli-USD)
 * so the whole computation is integer (bigint) and ends in whole sen, stored
 * as numeric(12,2) — no float anywhere.
 *
 * gemini-3.1-flash-lite = $0.25 in / $0.025 cached / $1.50 out: the rates
 * that make TECH-SPEC §6.2's own sanity check (2,37 jt in / 0,19 jt out ≈
 * US$0,88) come out. The other two are estimates. All three: check against
 * the official price list before relying on the totals.
 */
export interface ModelPrice {
  inMilliUsd: bigint;
  cachedMilliUsd: bigint;
  outMilliUsd: bigint;
}

export const PRICES: Record<string, ModelPrice> = {
  "gemini-3.1-flash-lite": { inMilliUsd: 250n, cachedMilliUsd: 25n, outMilliUsd: 1500n },
  "gemini-3-flash": { inMilliUsd: 500n, cachedMilliUsd: 50n, outMilliUsd: 3000n },
  "gemini-embedding-001": { inMilliUsd: 150n, cachedMilliUsd: 150n, outMilliUsd: 0n },
};

const FREE: ModelPrice = { inMilliUsd: 0n, cachedMilliUsd: 0n, outMilliUsd: 0n };

/** Rp per US$ (§6.3), PPN 1,11 and buffer 1,2 — as integers: × 18000 × 111/100 × 12/10. */
export const KURS_IDR = 18_000n;

export interface Usage {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
}

/** Cost of one call in whole sen (1/100 rupiah), rounded half up. */
export function costSen(usage: Usage, price: ModelPrice): bigint {
  const cached = BigInt(Math.max(0, Math.min(usage.cachedTokens, usage.inputTokens)));
  const fresh = BigInt(Math.max(0, usage.inputTokens)) - cached;
  const out = BigInt(Math.max(0, usage.outputTokens));
  const milliUsdPerMillion = fresh * price.inMilliUsd + cached * price.cachedMilliUsd + out * price.outMilliUsd;
  // milli-USD per 1M tokens → USD: / 1e9. → sen: × KURS × 1.11 × 1.2 × 100.
  const numerator = milliUsdPerMillion * KURS_IDR * 111n * 12n * 100n;
  const denominator = 1_000_000_000n * 100n * 10n;
  return (numerator + denominator / 2n) / denominator;
}

/** "17.38" — the numeric(12,2) text for `ai_runs.cost_idr`. */
export function senToNumeric(sen: bigint): string {
  const sign = sen < 0n ? "-" : "";
  const abs = sen < 0n ? -sen : sen;
  return `${sign}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}

export function priceFor(modelId: string): ModelPrice {
  return PRICES[modelId] ?? FREE;
}

export function meterFor(
  modelId: string,
  usage: Usage,
  latencyMs: number,
  fallbackReason: string | null,
): RunMeter {
  return {
    ...usage,
    costIdr: senToNumeric(costSen(usage, priceFor(modelId))),
    latencyMs,
    fallbackReason,
  };
}
