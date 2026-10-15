import {
  collectEvidence,
  groundAnswer,
  type Claim,
  type Evidence,
  type GroundedSource,
} from "@/core/consult/grounding";
import { narrateInsights, narrationText, type InsightCandidate } from "@/core/consult/insights";
import {
  answerOffline,
  chooseTier,
  detectRemember,
  runPlan,
  templateFromRuns,
  type RememberIntent,
  type Tier,
  type ToolRun,
} from "@/core/consult/question";
import { callTool, getBusinessSnapshot, type ConsultData, type ToolName } from "@/core/consult/tools";
import { CircuitBreaker } from "./breaker";
import { meterFor, type Usage } from "./meter";
import { LLM_TIMEOUT_MS, MAX_OUTPUT_TOKENS, modelIdOf, providerOf, ROUTES } from "./models";
import { consultSystem, narrateSystem } from "./prompts/consult.v1";
import { offlineReason, type AiEnv } from "./run";
import type { RunMeter } from "@/core/chat/pipeline";

/**
 * Konsultasi orchestration (TECH-SPEC §7.4) behind `/api/consult`. One draft
 * per attempt from a `ConsultModel`, checked by the grounding module; a draft
 * that fails twice is replaced by a template from the tool results. Without a
 * key (or with DEMO_SAFE=1, an open circuit, a timeout) the answer is the
 * offline template and the result says `engine: "offline"` and why — it never
 * pretends a model answered. The model is injected so tests run offline.
 */
export interface ConsultTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ConsultModelCall {
  modelId: string;
  system: string;
  messages: ConsultTurn[];
  /** Tool names the model may call (empty = plain text, used by narrate). */
  tools: readonly ToolName[];
  maxSteps: number;
  maxOutputTokens: number;
  runTool: (name: ToolName, args: unknown) => unknown;
  onDelta?: (text: string) => void;
  signal: AbortSignal;
}

export interface ConsultModel {
  generate(call: ConsultModelCall): Promise<{ text: string; usage: Usage }>;
}

export type ConsultEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "final"; outcome: ConsultOutcome };

export interface ConsultAttempt {
  model: string;
  tier: Tier | "narrate";
  meter: RunMeter | null;
  error: string | null;
  /** Claims the grounding check rejected on this attempt. */
  rejected: Claim[];
}

export interface ConsultOutcome {
  kind: "answer" | "remember";
  text: string;
  remember: RememberIntent | null;
  engine: "llm" | "offline";
  model: string;
  tier: Tier | "narrate";
  tierReason: string;
  /** model = first draft passed; regenerated = second; template = replaced by tool summary. */
  source: GroundedSource | "offline";
  fallbackReason: string | null;
  toolsUsed: ToolName[];
  attempts: ConsultAttempt[];
}

export interface ConsultDeps {
  env: AiEnv;
  model?: ConsultModel;
  breaker?: CircuitBreaker;
  now?: () => number;
  timeoutMs?: number;
}

export interface AskRequest {
  question: string;
  history: ConsultTurn[];
  data: ConsultData;
  deepRequested: boolean;
  usage: { total: number; deep: number };
}

const HISTORY_TURNS = 8;
const MAX_STEPS = 4;

function errorText(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 500) : String(e).slice(0, 500);
}

export function createConsult({ env, model, breaker = new CircuitBreaker(), now = Date.now, timeoutMs = LLM_TIMEOUT_MS }: ConsultDeps) {
  /** First reason the LLM can't answer, or null. */
  function unavailable(): string | null {
    const off = offlineReason(env);
    if (off) return off;
    if (!model) return "no_provider";
    if (!breaker.allow()) return "circuit_open";
    return null;
  }

  /** Draft → grounding → regenerate → template, shared by `ask` and `narrate`. */
  async function groundedRun(opts: {
    task: Tier | "narrate";
    system: string;
    messages: ConsultTurn[];
    tools: readonly ToolName[];
    data: ConsultData;
    evidence: unknown[];
    template: (runs: ToolRun[]) => string;
    emit: (e: ConsultEvent) => void;
  }) {
    const ref = ROUTES[opts.task][0];
    const modelId = modelIdOf(ref);
    const runs: ToolRun[] = [];
    const attempts: ConsultAttempt[] = [];
    const callTool_ = (name: ToolName, args: unknown) => {
      const result = callTool(name, args, opts.data);
      runs.push({ name, args: (args ?? {}) as Record<string, unknown>, result });
      return result;
    };
    const evidence = (): Evidence => collectEvidence(opts.evidence, runs.map((r) => r.result));
    let draft = 0;

    const outcome = await groundAnswer({
      generate: async (feedback) => {
        draft += 1;
        const started = now();
        const messages = feedback ? [...opts.messages, { role: "user" as const, content: feedback }] : opts.messages;
        try {
          const res = await model!.generate({
            modelId,
            system: opts.system,
            messages,
            tools: opts.tools,
            maxSteps: MAX_STEPS,
            maxOutputTokens: MAX_OUTPUT_TOKENS[opts.task] ?? 400,
            runTool: callTool_,
            onDelta: draft === 1 ? (text) => opts.emit({ type: "delta", text }) : undefined,
            signal: AbortSignal.timeout(timeoutMs * 2),
          });
          breaker.success();
          attempts.push({ model: modelId, tier: opts.task, meter: meterFor(modelId, res.usage, now() - started, null), error: null, rejected: [] });
          return res.text;
        } catch (e) {
          breaker.failure();
          attempts.push({ model: modelId, tier: opts.task, meter: null, error: errorText(e), rejected: [] });
          throw e;
        }
      },
      evidence,
      template: () => opts.template(runs),
      onReject: ({ ungrounded }) => {
        const last = attempts[attempts.length - 1];
        if (last) last.rejected = ungrounded;
      },
    });
    return { outcome, runs, attempts, modelId };
  }

  async function ask(req: AskRequest, emit: (e: ConsultEvent) => void = () => {}): Promise<ConsultOutcome> {
    const remember = detectRemember(req.question);
    if (remember) {
      return {
        kind: "remember",
        text: `Mau kuingat: "${remember.content}"? Tekan Simpan untuk mengonfirmasi.`,
        remember,
        engine: "offline",
        model: "none",
        tier: "consult_fast",
        tierReason: "remember",
        source: "offline",
        fallbackReason: null,
        toolsUsed: [],
        attempts: [],
      };
    }

    const { tier, reason } = chooseTier({
      question: req.question,
      deepRequested: req.deepRequested,
      totalThisMonth: req.usage.total,
      deepThisMonth: req.usage.deep,
    });

    const why = unavailable();
    const offline = (fallbackReason: string, error: string | null = null): ConsultOutcome => {
      const { text, runs } = answerOffline(req.question, req.data);
      return {
        kind: "answer",
        text,
        remember: null,
        engine: "offline",
        model: "offline:template-v1",
        tier,
        tierReason: reason,
        source: "offline",
        fallbackReason,
        toolsUsed: runs.map((r) => r.name),
        attempts: [{ model: "offline:template-v1", tier, meter: meterFor("offline", { inputTokens: 0, cachedTokens: 0, outputTokens: 0 }, 0, fallbackReason), error, rejected: [] }],
      };
    };
    if (why) return offline(why);

    emit({ type: "status", text: "Membaca data tokomu…" });
    const snapshot = getBusinessSnapshot(req.data);
    const messages: ConsultTurn[] = [...req.history.slice(-HISTORY_TURNS), { role: "user", content: req.question }];
    try {
      const { outcome, runs, attempts, modelId } = await groundedRun({
        task: tier,
        system: consultSystem(snapshot, req.data.memory),
        messages,
        tools: [
          "get_business_snapshot",
          "get_sales_summary",
          "get_profit_breakdown",
          "explain_profit_change",
          "get_stock_status",
          "get_reorder_suggestions",
          "get_slow_movers",
          "get_customer_stats",
          "list_insights",
          "get_preferences",
        ],
        data: req.data,
        evidence: [snapshot, messages.map((m) => m.content)],
        template: (r) => templateFromRuns(r.length ? r : runPlan([{ name: "get_business_snapshot", args: {} }], req.data)),
        emit,
      });
      return {
        kind: "answer",
        text: outcome.text,
        remember: null,
        engine: "llm",
        model: modelId,
        tier,
        tierReason: reason,
        source: outcome.source,
        fallbackReason: null,
        toolsUsed: [...new Set(runs.map((r) => r.name))],
        attempts,
      };
    } catch (e) {
      return offline(/timeout|abort/i.test(errorText(e)) ? "timeout" : "provider_error", errorText(e));
    }
  }

  /** Narrates the weekly top-3 (task `narrate`); same grounding, template fallback. */
  async function narrateWeekly(
    selected: readonly InsightCandidate[],
    data: ConsultData,
    emit: (e: ConsultEvent) => void = () => {},
  ): Promise<{ text: string; engine: "llm" | "offline"; model: string; source: GroundedSource | "offline"; fallbackReason: string | null; attempts: ConsultAttempt[] }> {
    const template = () => narrationText(narrateInsights(selected));
    const why = unavailable();
    if (why || selected.length === 0) {
      return { text: template(), engine: "offline", model: "offline:template-v1", source: "offline", fallbackReason: why ?? "nothing_to_narrate", attempts: [] };
    }
    try {
      // total_impact is precomputed so the model never has to add the impacts itself.
      const evidence = {
        insights: selected.map((c) => ({ title: c.title, text: c.text, impact: c.impact, evidence: c.evidence })),
        total_impact: selected.reduce((s, c) => s + c.impact, 0),
      };
      const { outcome, attempts, modelId } = await groundedRun({
        task: "narrate",
        system: narrateSystem(),
        messages: [{ role: "user", content: `EVIDENCE:\n${JSON.stringify(evidence)}` }],
        tools: [],
        data,
        evidence: [evidence],
        template,
        emit,
      });
      return { text: outcome.text, engine: "llm", model: modelId, source: outcome.source, fallbackReason: null, attempts };
    } catch (e) {
      return { text: template(), engine: "offline", model: "offline:template-v1", source: "offline", fallbackReason: /timeout|abort/i.test(errorText(e)) ? "timeout" : "provider_error", attempts: [] };
    }
  }

  return { ask, narrateWeekly, unavailable, providerOfTier: (t: Tier) => providerOf(ROUTES[t][0]) };
}

export type Consult = ReturnType<typeof createConsult>;
