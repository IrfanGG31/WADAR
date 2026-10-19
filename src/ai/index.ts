import "server-only";
import { CircuitBreaker } from "./breaker";
import { googleProvider } from "./providers/google";
import { createConsult, type Consult } from "./consult";
import { routesWithCustom } from "./models";
import { fallbackConsultModel, googleConsultModel, sdkConsultModel } from "./providers/google-consult";
import { compatibleClient, openAiCompatibleProvider, type CustomAiConfig } from "./providers/openai-compatible";
import { createQueryEmbedder, type QueryEmbedder } from "./query-embedding";
import { createAi, offlineReason, type Ai } from "./run";

/**
 * The server's AI instance. Reads the key and DEMO_SAFE at first use; the
 * circuit breaker lives as long as the server instance (per serverless
 * instance on Vercel — good enough for the sprint, not a shared breaker).
 */
let instance: Ai | undefined;

export function getAi(): Ai {
  if (instance) return instance;
  const env = {
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    DEMO_SAFE: process.env.DEMO_SAFE,
  };
  const key = env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  instance = createAi({
    env,
    providers: offlineReason(env) === null && key ? { google: googleProvider(key) } : {},
    breakers: { google: new CircuitBreaker() },
  });
  return instance;
}

let queryEmbedder: QueryEmbedder | undefined;

/** Widget KB search vectors (cached per instance); null without a key, so retrieval stays keyword-only. */
export function getQueryEmbedder(): QueryEmbedder {
  queryEmbedder ??= createQueryEmbedder(getAi());
  return queryEmbedder;
}

let consultInstance: Consult | undefined;

/** The Konsultasi orchestrator: same env/breaker rules as getAi(), offline (and labelled so) without a key. */
export function getConsult(): Consult {
  if (consultInstance) return consultInstance;
  const env = {
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    DEMO_SAFE: process.env.DEMO_SAFE,
  };
  const key = env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  consultInstance = createConsult({
    env,
    model: offlineReason(env) === null && key ? googleConsultModel(key) : undefined,
    breaker: new CircuitBreaker(),
  });
  return consultInstance;
}

/* ─── Per shop: the shop's own model (Pusat Koneksi › Otak AI) ─────────────── */

function configKey(cfg: CustomAiConfig): string {
  return `${cfg.baseURL}|${cfg.chatModel}|${cfg.apiKey.slice(-6)}`;
}

const tenantAi = new Map<string, Ai>();
const tenantConsult = new Map<string, Consult>();

/** `getAi()` for one shop: its own model first, then Gemini, then the offline engine. Null config = the default instance. */
export function aiFor(cfg: CustomAiConfig | null): Ai {
  if (!cfg) return getAi();
  const key = configKey(cfg);
  const hit = tenantAi.get(key);
  if (hit) return hit;
  const env = {
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    DEMO_SAFE: process.env.DEMO_SAFE,
    CUSTOM_AI: "1",
  };
  const googleKey = env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  const ai = createAi({
    env,
    providers: { custom: openAiCompatibleProvider(cfg), ...(googleKey ? { google: googleProvider(googleKey) } : {}) },
    breakers: { custom: new CircuitBreaker(), google: new CircuitBreaker() },
    routes: routesWithCustom(cfg.chatModel),
  });
  tenantAi.set(key, ai);
  return ai;
}

/** `getConsult()` for one shop. */
export function consultFor(cfg: CustomAiConfig | null): Consult {
  if (!cfg) return getConsult();
  const key = configKey(cfg);
  const hit = tenantConsult.get(key);
  if (hit) return hit;
  const env = { GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY, DEMO_SAFE: process.env.DEMO_SAFE, CUSTOM_AI: "1" };
  const googleKey = env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  const client = compatibleClient(cfg);
  const consult = createConsult({
    env,
    model: fallbackConsultModel(
      { model: sdkConsultModel((id) => client(id)), modelId: cfg.chatModel },
      googleKey ? googleConsultModel(googleKey) : undefined,
    ),
    breaker: new CircuitBreaker(),
  });
  tenantConsult.set(key, consult);
  return consult;
}

export interface AiPingResult {
  ok: boolean;
  latencyMs: number;
  /** Plain-language reason for the owner; never the raw provider message (it can echo the key). */
  error: string | null;
}

/** Tes koneksi: one tiny completion against the shop's endpoint. */
export async function pingCustomAi(cfg: CustomAiConfig, timeoutMs = 15_000): Promise<AiPingResult> {
  const { generateText } = await import("ai");
  const started = Date.now();
  try {
    const result = await generateText({
      model: compatibleClient(cfg)(cfg.chatModel),
      prompt: "Balas hanya dengan kata: OK",
      maxOutputTokens: 5,
      temperature: 0,
      abortSignal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: result.text.trim().length > 0, latencyMs: Date.now() - started, error: result.text.trim() ? null : "Model membalas kosong." };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - started, error: describePingError(e) };
  }
}

function describePingError(e: unknown): string {
  const status = typeof e === "object" && e !== null && "statusCode" in e ? Number((e as { statusCode: unknown }).statusCode) : null;
  const name = e instanceof Error ? e.name : "";
  if (name === "TimeoutError" || name === "AbortError") return "Tidak ada jawaban dalam 15 detik. Cek base URL.";
  if (status === 401 || status === 403) return "API key ditolak (401/403). Cek lagi key-nya.";
  if (status === 404) return "Alamat atau nama model tidak ditemukan (404). Cek base URL dan nama model.";
  if (status === 429) return "Kuota atau batas pemakaian habis (429).";
  if (status && status >= 500) return `Server penyedia sedang bermasalah (${status}). Coba lagi nanti.`;
  return "Tidak bisa tersambung. Cek base URL (harus diawali https:// dan biasanya diakhiri /v1).";
}

export type { CustomAiConfig } from "./providers/openai-compatible";
export type { Ai } from "./run";
export type { Consult } from "./consult";
