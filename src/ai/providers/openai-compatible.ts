import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { Provider } from "../run";
import { sdkProvider } from "./sdk";

/**
 * The shop's own model behind any OpenAI-compatible endpoint (OpenAI, OpenRouter, Groq, DeepSeek,
 * Together, Gemini's OpenAI endpoint, a self-hosted vLLM/LiteLLM…). Chat tasks only: embeddings stay
 * on Gemini because `kb_chunks.embedding` is fixed at 768 dimensions and mixing vector spaces would
 * silently break retrieval.
 */
export interface CustomAiConfig {
  baseURL: string;
  apiKey: string;
  chatModel: string;
}

export function compatibleClient(cfg: CustomAiConfig) {
  return createOpenAICompatible({ name: "custom", baseURL: cfg.baseURL.replace(/\/+$/, ""), apiKey: cfg.apiKey, supportsStructuredOutputs: false });
}

export function openAiCompatibleProvider(cfg: CustomAiConfig): Provider {
  const client = compatibleClient(cfg);
  return sdkProvider({ model: (id) => client(id) });
}
