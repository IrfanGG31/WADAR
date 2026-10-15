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
}

export interface GenerateResult {
  /** null when the model output could not be parsed into `ChatReply`. */
  reply: ChatReply | null;
  engine: Engine;
  model: string;
  /** `ai_runs.id` of this call, when it was logged. */
  runId?: string | null;
  error?: string | null;
}

export type Generate = (request: GenerateRequest) => Promise<GenerateResult>;

export interface AttemptLog {
  engine: Engine;
  model: string;
  runId: string | null;
  reply: ChatReply | null;
  guard: GuardResult | null;
  error: string | null;
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

export async function runTurn(input: TurnInput, generate: Generate): Promise<TurnOutcome> {
  if (input.mode === "human") return { action: "store_only", attempts: [] };

  const hold = safeHolding(holdingMessage(input.context.persona));
  const routed = preRoute({ text: input.text, hasMedia: input.hasMedia });
  if (routed) return { action: "escalate", text: hold, cause: routed, unsafe: false, preRoute: routed, attempts: [] };

  const attempts: AttemptLog[] = [];
  let feedback: string | undefined;
  let unsafe = false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = await generate({ question: input.text, context: input.context, feedback, attempt });
    const log: AttemptLog = {
      engine: result.engine,
      model: result.model,
      runId: result.runId ?? null,
      reply: result.reply,
      guard: null,
      error: result.error ?? null,
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
  }
  return { action: "escalate", text: hold, cause: unsafe ? "unsafe" : "other", unsafe, preRoute: null, attempts };
}

/** A holding message an owner wrote is validated on save; this keeps an old/bad row from reaching a buyer. */
function safeHolding(message: string): string {
  return isSafeOutgoing(message) ? message : DEFAULT_HOLDING_MESSAGE;
}
