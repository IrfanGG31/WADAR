/**
 * Question handling that needs no model: "ingat ya…" detection (CON-4), the
 * deep-analysis gate (§7.4) and the offline router that maps a question to
 * tools and renders their results with templates. Used as the answer when no
 * LLM is available (and says so) and as the grounding fallback.
 */
import { callTool, renderToolResult, type ConsultData, type PeriodArg, type ToolName } from "./tools";

/* ─── "Ingat ya…" ──────────────────────────────────────────────────────────── */

export interface RememberIntent {
  kind: "preference" | "fact" | "decision";
  /** The sentence to store, without the leading "ingat ya,". */
  content: string;
}

const REMEMBER_RE = /\b(ingat(?:\s+ya)?|catat\s+bahwa|jangan\s+pernah|selalu)\b/i;

/** Returns what to remember when the message is an instruction to remember, else null. */
export function detectRemember(text: string): RememberIntent | null {
  const t = text.trim();
  if (t.length < 8 || t.endsWith("?")) return null;
  const m = REMEMBER_RE.exec(t);
  if (!m) return null;
  const lead = m[1].toLowerCase();
  // "jangan pernah …" / "selalu …" are rules and keep their leading words; "ingat ya, X" stores X.
  const stripped = /^(ingat|catat)/.test(lead)
    ? t.slice(m.index + m[0].length).replace(/^[\s,:;-]+/, "").replace(/^bahwa\s+/i, "")
    : t.slice(m.index);
  const content = stripped.trim().replace(/[.\s]+$/, "");
  if (content.length < 3) return null;
  const kind = /^(jangan|selalu)/i.test(content) ? "preference" : /\b(keputusan|memutuskan|sepakat)\b/i.test(content) ? "decision" : "fact";
  return { kind, content: content.slice(0, 280) };
}

/* ─── Deep analysis gate ───────────────────────────────────────────────────── */

const DEEP_RE = /\b(kenapa|mengapa|strategi|sebaiknya|saran|bagaimana\s+cara|apa\s+yang\s+harus)\b/i;

/** The question calls for reasoning, so the "Analisis mendalam" button is offered. */
export function isDeepQuestion(question: string): boolean {
  return DEEP_RE.test(question);
}

/** TECH-SPEC §6.2: deep is ≤ 20% of a tenant's consult calls per month (the first one is allowed). */
export function deepQuotaLeft(totalThisMonth: number, deepThisMonth: number): boolean {
  return deepThisMonth < Math.ceil((totalThisMonth + 1) * 0.2);
}

export type Tier = "consult_fast" | "consult_deep";

/** Deep only when the user pressed the button, the question warrants it and quota remains — never automatic. */
export function chooseTier(opts: { question: string; deepRequested: boolean; totalThisMonth: number; deepThisMonth: number }): {
  tier: Tier;
  reason: "fast" | "deep" | "deep_not_applicable" | "deep_quota_exhausted";
} {
  if (!opts.deepRequested) return { tier: "consult_fast", reason: "fast" };
  if (!isDeepQuestion(opts.question)) return { tier: "consult_fast", reason: "deep_not_applicable" };
  if (!deepQuotaLeft(opts.totalThisMonth, opts.deepThisMonth)) return { tier: "consult_fast", reason: "deep_quota_exhausted" };
  return { tier: "consult_deep", reason: "deep" };
}

/* ─── Offline router ───────────────────────────────────────────────────────── */

export interface ToolCall {
  name: ToolName;
  args: Record<string, unknown>;
}

interface Rule {
  test: RegExp;
  calls: (q: string) => ToolCall[];
}

/** Period words in the question → a PeriodArg. */
export function periodFromQuestion(q: string, fallback: PeriodArg = "7d"): PeriodArg {
  const t = q.toLowerCase();
  if (/\bhari ini\b/.test(t)) return "today";
  if (/\bkemarin\b/.test(t)) return "yesterday";
  if (/\bbulan lalu\b/.test(t)) return "last_month";
  if (/\bbulan ini\b/.test(t)) return "this_month";
  if (/\b(30 hari|sebulan)\b/.test(t)) return "30d";
  if (/\b(minggu ini|7 hari|seminggu|pekan ini)\b/.test(t)) return "7d";
  return fallback;
}

// First match wins, so the more specific intents come first.
const RULES: Rule[] = [
  { test: /\b(kenapa|mengapa)\b.*\b(untung\w*|laba|profit)\b|\b(untung\w*|laba)\b.*\b(turun|naik|berubah)\b/, calls: () => [{ name: "explain_profit_change", args: {} }] },
  { test: /\bmargin\b.*\b(tipis|kecil|rendah|terendah)\b|\b(kanal|channel|marketplace)\b.*\b(margin|untung)\b|\bperingatan\b/, calls: (q) => [{ name: "get_profit_breakdown", args: { period: periodFromQuestion(q), by: "channel" } }, { name: "get_business_snapshot", args: {} }] },
  { test: /\b(lambat laku|tidak laku|modal tertahan|menumpuk|slow)\b/, calls: () => [{ name: "get_slow_movers", args: {} }] },
  { test: /\b(pesan ulang|restock|dipesan|kulakan|beli stok)\b/, calls: () => [{ name: "get_reorder_suggestions", args: {} }] },
  { test: /\b(stok|persediaan|habis)\b/, calls: () => [{ name: "get_stock_status", args: {} }] },
  { test: /\b(pelanggan|customer|langganan)\b/, calls: (q) => [{ name: "get_customer_stats", args: { period: periodFromQuestion(q, "30d") } }] },
  { test: /\b(untung\w*|laba|profit|margin)\b/, calls: (q) => [{ name: "get_profit_breakdown", args: { period: periodFromQuestion(q), by: "product" } }] },
  { test: /\b(laris|laku|terlaris|terbanyak|paling banyak|best ?seller)\b/, calls: (q) => [{ name: "get_sales_summary", args: { period: periodFromQuestion(q, "30d"), group_by: "product" } }] },
  { test: /\b(per kanal|kanal|channel)\b/, calls: (q) => [{ name: "get_sales_summary", args: { period: periodFromQuestion(q), group_by: "channel" } }] },
  { test: /\b(insight|ingatan|preferensi)\b/, calls: () => [{ name: "list_insights", args: {} }, { name: "get_preferences", args: {} }] },
  { test: /\b(penjualan|omzet|omset|pendapatan|jualan|terjual)\b/, calls: (q) => { const p = periodFromQuestion(q, "today"); return p === "today" ? [{ name: "get_business_snapshot", args: {} }] : [{ name: "get_sales_summary", args: { period: p, group_by: "day" } }]; } },
];

/** Tools to run for a question; the business snapshot when nothing matches. */
export function planTools(question: string): ToolCall[] {
  const q = question.toLowerCase();
  for (const r of RULES) if (r.test.test(q)) return r.calls(q);
  return [{ name: "get_business_snapshot", args: {} }];
}

export interface ToolRun {
  name: ToolName;
  args: Record<string, unknown>;
  result: unknown;
}

export function runPlan(calls: readonly ToolCall[], d: ConsultData): ToolRun[] {
  return calls.map((c) => ({ ...c, result: callTool(c.name, c.args, d) }));
}

/** The template answer: one rendered sentence group per tool run. */
export function templateFromRuns(runs: readonly ToolRun[]): string {
  if (runs.length === 0) return "Belum ada data untuk menjawab pertanyaan ini.";
  return runs.map((r) => renderToolResult(r.name, r.result)).join("\n");
}

/** Offline answer: plan → run → template. Returns the runs too, as grounding evidence. */
export function answerOffline(question: string, d: ConsultData): { text: string; runs: ToolRun[] } {
  const runs = runPlan(planTools(question), d);
  return { text: templateFromRuns(runs), runs };
}
