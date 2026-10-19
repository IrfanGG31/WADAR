import type { ChatContext } from "@/core/chat/context";
import { classifyIntentOffline, composeOfflineReply } from "@/core/chat/offline-reply";
import type { Engine, RunMeter } from "@/core/chat/pipeline";
import type { ChatIntent, ChatReply } from "@/core/chat/schema";
import { CircuitBreaker } from "./breaker";
import { meterFor, type Usage } from "./meter";
import { LLM_TIMEOUT_MS, modelIdOf, providerOf, ROUTES, type ChatTask, type ModelRef, type Task } from "./models";
import { normalizeSourceId } from "./prompts/chat_reply.v1";

/**
 * `run(task, input)` — the one entry point to a model (TECH-SPEC §6.1,
 * CLAUDE.md rule 5). Walks the task's route: a provider is skipped while its
 * circuit is open, a call that fails or takes > 8 s falls through to the next
 * route, and the deterministic offline engine is the last resort.
 *
 * Offline mode is explicit, never silent: with no GOOGLE_GENERATIVE_AI_API_KEY
 * or with DEMO_SAFE=1 every task answers from the offline engine, and the
 * result says `engine: "offline"`, `model: "offline:template-v1"` and why
 * (`meter.fallbackReason`). Callers show and log that.
 */
export interface JudgeVerdict {
  verdict: "correct" | "incorrect" | "unsafe";
  note: string;
}

export interface TaskIO {
  chat_reply: { input: { question: string; context: ChatContext; feedback?: string }; output: ChatReply | null };
  intent: { input: { text: string }; output: ChatIntent };
  embed: { input: { texts: string[]; purpose: "document" | "query" }; output: number[][] | null };
  judge: { input: { question: string; reply: string; context: string }; output: JudgeVerdict | null };
}

export type TaskInput<T extends ChatTask> = TaskIO[T]["input"];
export type TaskOutput<T extends ChatTask> = TaskIO[T]["output"];

export interface ProviderResult<T extends ChatTask> {
  output: TaskOutput<T>;
  usage: Usage;
}

/** A model provider (google). Throws on any failure, including unparseable output. */
export interface Provider {
  call<T extends ChatTask>(task: T, modelId: string, input: TaskInput<T>, signal: AbortSignal): Promise<ProviderResult<T>>;
}

export interface RunResult<T extends ChatTask> {
  output: TaskOutput<T>;
  engine: Engine;
  model: ModelRef;
  meter: RunMeter;
  /** The last provider error when a fallback answered. */
  error: string | null;
}

export type OfflineReason = "no_api_key" | "demo_safe";

export interface AiEnv {
  GOOGLE_GENERATIVE_AI_API_KEY?: string;
  DEMO_SAFE?: string;
  /** "1" when the shop has its own model configured (Pusat Koneksi › Otak AI). */
  CUSTOM_AI?: string;
}

/** Why the LLM is off for this deployment/shop, or null when it may be called. */
export function offlineReason(env: AiEnv): OfflineReason | null {
  if (env.DEMO_SAFE === "1") return "demo_safe";
  if (!env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() && env.CUSTOM_AI !== "1") return "no_api_key";
  return null;
}

const OFFLINE: { [T in ChatTask]: (input: TaskInput<T>) => TaskOutput<T> } = {
  chat_reply: ({ question, context }) => composeOfflineReply(question, context),
  intent: ({ text }) => classifyIntentOffline(text),
  // No vectors offline: retrieval runs on the tsvector side alone.
  embed: () => null,
  // Judging needs a model; evals are skipped offline.
  judge: () => null,
};

const NO_USAGE: Usage = { inputTokens: 0, cachedTokens: 0, outputTokens: 0 };

export class AiUnavailableError extends Error {
  constructor(task: ChatTask, reason: string | null, cause: string | null) {
    super(`ai.run(${task}): no route answered (${reason ?? "unknown"})${cause ? `: ${cause}` : ""}`);
  }
}

export interface AiDeps {
  env: AiEnv;
  providers: { google?: Provider; custom?: Provider };
  breakers?: { google?: CircuitBreaker; custom?: CircuitBreaker };
  /** Per-shop routing (routesWithCustom); defaults to ROUTES. */
  routes?: Record<Task, readonly ModelRef[]>;
  now?: () => number;
  timeoutMs?: number;
}

function errorText(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 500) : String(e).slice(0, 500);
}

function isTimeout(e: unknown): boolean {
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
}

/** Model output is trusted only after the same schema as offline output; ids lose any "[product:" tag. */
function cleanChatReply(reply: ChatReply | null): ChatReply | null {
  if (!reply) return null;
  return { ...reply, sources: reply.sources.map((s) => ({ ...s, id: normalizeSourceId(s.id) })) };
}

export function createAi({ env, providers, breakers = {}, routes = ROUTES, now = Date.now, timeoutMs = LLM_TIMEOUT_MS }: AiDeps) {
  const breaker = { google: breakers.google ?? new CircuitBreaker({ now }), custom: breakers.custom ?? new CircuitBreaker({ now }) };

  /** `opts.timeoutMs` can only shorten the model timeout (e.g. to what is left of a chat turn). */
  async function run<T extends ChatTask>(task: T, input: TaskInput<T>, opts: { timeoutMs?: number } = {}): Promise<RunResult<T>> {
    const started = now();
    const offline = offlineReason(env);
    let fallbackReason: string | null = offline;
    let lastError: string | null = null;

    for (const ref of routes[task]) {
      const provider = providerOf(ref);
      if (provider === "offline") {
        const output = OFFLINE[task](input);
        return {
          output,
          engine: "offline",
          model: ref,
          meter: meterFor(modelIdOf(ref), NO_USAGE, now() - started, fallbackReason ?? "provider_error"),
          error: lastError,
        };
      }
      if (offline) continue;
      const impl = providers[provider];
      if (!impl) {
        fallbackReason = "no_provider";
        continue;
      }
      if (!breaker[provider].allow()) {
        fallbackReason = "circuit_open";
        continue;
      }
      try {
        const result = await impl.call(task, modelIdOf(ref), input, AbortSignal.timeout(Math.max(0, Math.min(timeoutMs, opts.timeoutMs ?? timeoutMs))));
        breaker[provider].success();
        const output = (task === "chat_reply" ? cleanChatReply(result.output as ChatReply | null) : result.output) as TaskOutput<T>;
        return {
          output,
          engine: "llm",
          model: ref,
          meter: meterFor(modelIdOf(ref), result.usage, now() - started, null),
          error: null,
        };
      } catch (e) {
        breaker[provider].failure();
        fallbackReason = isTimeout(e) ? "timeout" : "provider_error";
        lastError = errorText(e);
      }
    }
    throw new AiUnavailableError(task, fallbackReason, lastError);
  }

  return { run, offlineReason: () => offlineReason(env) };
}

export type Ai = ReturnType<typeof createAi>;
