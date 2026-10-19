import "server-only";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { EMBEDDING_DIMENSIONS } from "../models";
import type { Provider } from "../run";
import { sdkProvider } from "./sdk";

/**
 * Google Gemini through the Vercel AI SDK. Only `src/ai/run.ts` calls this.
 * Thinking is set to minimal for chat/intent (TECH-SPEC §6.1: thinking tokens
 * bill as output). NOT verified live from the dev machine (no key there):
 * model ids, `thinkingLevel` and the usage fields need one real call.
 */
export function googleProvider(apiKey: string): Provider {
  const google = createGoogleGenerativeAI({ apiKey });
  return sdkProvider({
    model: (id) => google(id),
    embedding: (id) => google.embedding(id),
    fastOptions: { google: { thinkingConfig: { thinkingLevel: "minimal" } } },
    embedOptions: (purpose) => ({
      google: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: purpose === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
      },
    }),
  });
}
