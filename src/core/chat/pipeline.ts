import type { ChatContext } from "./context";
import { checkReply, isSafeOutgoing, type GuardResult } from "./guardrails";
import { preRoute, type PreRoute } from "./prerouter";
import type { ChatReply, EscalationCause } from "./schema";
import { DEFAULT_HOLDING_MESSAGE, holdingMessage } from "./store-policies";

/**
 * One customer turn, TECH-SPEC §7.3 steps 1–7, independent of where the model
 * runs: mode check → pre-router → generate → guardrails (→ one regeneration
 * with feedback) → send or escalate with the holding message. The caller
 * supplies the context (retrieval) and the generator (LLM or offline), and
 * persists the outcome.
 */
export type Engine = "llm" | "offline";

export interface GenerateRequest {
  question: string;
  context: ChatContext;
  /** Guardrail feedback for the regeneration attempt. */
  feedback?: string;
  attempt: number;
  /** What is left of the turn budget for this call; the generator should give up (or fall back) before it. */
  timeoutMs?: number;
}

/** Usage and cost of one model call, as written to `ai_runs` (TECH-SPEC §6.3). */
export interface RunMeter {
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  /** numeric(12,2) as a string, computed in whole sen — never a float. */
  costIdr: string;
  latencyMs: number;
  /** Why the offline engine answered instead of the LLM (no_api_key, demo_safe, timeout, …). */
  fallbackReason: string | null;
}

export interface GenerateResult {
  /** null when the model output could not be parsed into `ChatReply`. */
  reply: ChatReply | null;
  engine: Engine;
  model: string;
  /** `ai_runs.id` of this call, when it was logged. */
  runId?: string | null;
  error?: string | null;
  meter?: RunMeter;
}

export type Generate = (request: GenerateRequest) => Promise<GenerateResult>;

export interface AttemptLog {
  engine: Engine;
  model: string;
  runId: string | null;
  reply: ChatReply | null;
  guard: GuardResult | null;
  error: string | null;
  meter: RunMeter | null;
}

export interface TurnInput {
  text: string;
  hasMedia?: boolean;
  /** `conversations.mode`: in human mode the AI only stores the message. */
  mode: "ai" | "human";
  context: ChatContext;
}

export type TurnOutcome =
  | { action: "store_only"; attempts: [] }
  | { action: "reply"; text: string; reply: ChatReply; engine: Engine; attempts: AttemptLog[] }
  | {
      action: "escalate";
      /** The holding message sent to the buyer. */
      text: string;
      cause: EscalationCause;
      unsafe: boolean;
      preRoute: PreRoute | null;
      attempts: AttemptLog[];
    };

export const MAX_ATTEMPTS = 2;

/**
 * "Waktu balas < 10 detik per pesan" (PDF §C.3): one budget for the whole turn,
 * not per attempt (2 × the 8 s model timeout would be 16 s). ~1 s of the 10 s
 * is left for retrieval before and saving after.
 */
export const TURN_BUDGET_MS = 9_000;
/** A regeneration is only started with at least this much budget left; otherwise the holding message goes. */
export const MIN_ATTEMPT_MS = 3_000;
/** Told to the generator below the hard cap, so its own fallback (offline template) still lands in time. */
export const GENERATE_MARGIN_MS = 250;

export interface TurnOptions {
  budgetMs?: number;
  now?: () => number;
}

const TURN_TIMEOUT = "turn_timeout";

/** `promise`, or a timeout result once `ms` has passed — the turn never waits past its budget. */
function withDeadline(promise: Promise<GenerateResult>, ms: number): Promise<GenerateResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<GenerateResult>((resolve) => {
    timer = setTimeout(() => resolve({ reply: null, engine: "offline", model: "none", error: TURN_TIMEOUT }), Math.max(0, ms));
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function runTurn(input: TurnInput, generate: Generate, opts: TurnOptions = {}): Promise<TurnOutcome> {
  if (input.mode === "human") return { action: "store_only", attempts: [] };

  const hold = safeHolding(holdingMessage(input.context.persona));
  const routed = preRoute({ text: input.text, hasMedia: input.hasMedia });
  if (routed) return { action: "escalate", text: hold, cause: routed, unsafe: false, preRoute: routed, attempts: [] };

  const now = opts.now ?? Date.now;
  const deadline = now() + (opts.budgetMs ?? TURN_BUDGET_MS);
  const attempts: AttemptLog[] = [];
  let feedback: string | undefined;
  let unsafe = false;
  let lastCause: EscalationCause | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const left = deadline - now();
    // Not enough time for another model call: hold instead of answering late.
    if (attempt > 0 && left < MIN_ATTEMPT_MS) break;
    // A throwing generator must end in the holding message, never in an unguarded reply.
    const call = Promise.resolve()
      .then(() => generate({ question: input.text, context: input.context, feedback, attempt, timeoutMs: Math.max(0, left - GENERATE_MARGIN_MS) }))
      .catch(
        (err: unknown): GenerateResult => ({
          reply: null,
          engine: "offline",
          model: "error",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    const result = await withDeadline(call, left);
    const log: AttemptLog = {
      engine: result.engine,
      model: result.model,
      runId: result.runId ?? null,
      reply: result.reply,
      guard: null,
      error: result.error ?? null,
      meter: result.meter ?? null,
    };
    attempts.push(log);
    if (!result.reply) {
      return { action: "escalate", text: hold, cause: "other", unsafe: false, preRoute: null, attempts };
    }

    const guard = checkReply(result.reply, input.context, attempt);
    log.guard = guard;
    unsafe ||= guard.unsafe;
    if (guard.verdict === "pass") {
      // Defence in depth: never let a forbidden word through, whatever the checks above decided.
      if (!isSafeOutgoing(result.reply.reply)) {
        unsafe = true;
        break;
      }
      return { action: "reply", text: result.reply.reply, reply: result.reply, engine: result.engine, attempts };
    }
    if (guard.verdict === "escalate") {
      return { action: "escalate", text: hold, cause: guard.cause ?? "other", unsafe, preRoute: null, attempts };
    }
    feedback = guard.feedback;
    // If the regeneration never runs (no time left), escalate for what this reply got wrong.
    lastCause = checkReply(result.reply, input.context, MAX_ATTEMPTS - 1).cause;
  }
  return { action: "escalate", text: hold, cause: unsafe ? "unsafe" : (lastCause ?? "other"), unsafe, preRoute: null, attempts };
}

/** A holding message an owner wrote is validated on save; this keeps an old/bad row from reaching a buyer. */
function safeHolding(message: string): string {
  return isSafeOutgoing(message) ? message : DEFAULT_HOLDING_MESSAGE;
}
