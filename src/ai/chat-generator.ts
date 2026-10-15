import type { Generate } from "@/core/chat/pipeline";
import type { Ai } from "./run";

/** The pipeline's `Generate` backed by `ai.run("chat_reply")` — LLM when allowed, offline engine otherwise. */
export function chatGenerator(ai: Pick<Ai, "run">): Generate {
  return async ({ question, context, feedback }) => {
    try {
      const result = await ai.run("chat_reply", { question, context, feedback });
      return { reply: result.output, engine: result.engine, model: result.model, error: result.error, meter: result.meter };
    } catch (e) {
      // No route answered: the pipeline escalates on a null reply.
      return { reply: null, engine: "offline", model: "none", error: e instanceof Error ? e.message : String(e) };
    }
  };
}
