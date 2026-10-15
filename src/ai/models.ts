/**
 * Model routing per task (TECH-SPEC §6.1, BR-10). Features call
 * `run(task, input)` and never a provider SDK; the list order is the fallback
 * order. The sprint has one provider (Google Gemini); the last resort for
 * chat and intent is the deterministic offline engine, which is labelled as
 * such everywhere it answers.
 *
 * Model ids follow the spec and are NOT verified against the live API from
 * this machine (no key here) — check them in Google AI Studio before D8.
 */
export type Task = "chat_reply" | "intent" | "narrate" | "consult_fast" | "consult_deep" | "embed" | "judge";

/** Tasks the chat pipeline runs through `run()`. consult_fast / consult_deep / narrate run through `createConsult` (src/ai/consult.ts). */
export type ChatTask = Extract<Task, "chat_reply" | "intent" | "embed" | "judge">;

export type ModelRef = `google:${string}` | "offline:template-v1";

export const OFFLINE_MODEL: ModelRef = "offline:template-v1";

export const ROUTES: Record<Task, readonly ModelRef[]> = {
  chat_reply: ["google:gemini-3.1-flash-lite", OFFLINE_MODEL],
  intent: ["google:gemini-3.1-flash-lite", OFFLINE_MODEL],
  narrate: ["google:gemini-3.1-flash-lite"],
  consult_fast: ["google:gemini-3.1-flash-lite"],
  consult_deep: ["google:gemini-3-flash"],
  embed: ["google:gemini-embedding-001", OFFLINE_MODEL],
  judge: ["google:gemini-3-flash", OFFLINE_MODEL],
};

/** Embedding size of `kb_chunks.embedding vector(768)`. */
export const EMBEDDING_DIMENSIONS = 768;

/** TECH-SPEC §6.2 output caps. chat_reply gets JSON headroom over the 220-token reply budget. */
export const MAX_OUTPUT_TOKENS: Partial<Record<Task, number>> = {
  chat_reply: 300,
  intent: 20,
  judge: 200,
  consult_fast: 400,
  consult_deep: 700,
  narrate: 150,
};

/** SPRINT-8D §5: an LLM slower than this is abandoned and the fallback answers. */
export const LLM_TIMEOUT_MS = 8_000;

export function providerOf(ref: ModelRef): "google" | "offline" {
  return ref.startsWith("google:") ? "google" : "offline";
}

export function modelIdOf(ref: ModelRef): string {
  return ref.slice(ref.indexOf(":") + 1);
}
