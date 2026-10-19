import { z } from "zod";

/**
 * Pusat Koneksi › Otak AI: any OpenAI-compatible endpoint. Presets only fill the base URL and say
 * where the key lives — model names change too often to hard-code, so the owner copies one from
 * the provider's model list.
 */
export interface AiPreset {
  key: string;
  name: string;
  baseUrl: string;
  keyUrl: string;
  modelHint: string;
}

export const AI_PRESETS: readonly AiPreset[] = [
  { key: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", keyUrl: "https://platform.openai.com/api-keys", modelHint: "nama model dari platform.openai.com/docs/models" },
  { key: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", keyUrl: "https://openrouter.ai/keys", modelHint: "mis. penyedia/nama-model dari openrouter.ai/models" },
  { key: "gemini", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyUrl: "https://aistudio.google.com/apikey", modelHint: "nama model Gemini dari ai.google.dev" },
  { key: "groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", keyUrl: "https://console.groq.com/keys", modelHint: "nama model dari console.groq.com/docs/models" },
  { key: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", keyUrl: "https://platform.deepseek.com/api_keys", modelHint: "nama model dari api-docs.deepseek.com" },
  { key: "custom", name: "Lainnya / server sendiri", baseUrl: "", keyUrl: "", modelHint: "nama model persis seperti di dokumentasi penyedia" },
];

const PRIVATE_HOST = [
  /^localhost$/i,
  /\.(local|internal|localhost)$/i,
  /^\d{1,3}(\.\d{1,3}){3}$/, // any IPv4 literal (private ranges included) — use a hostname
  /^\[?[0-9a-f:]+\]?$/i, // any IPv6 literal
];

/** Problem with a base URL the server would call, or null. Blocks internal addresses (SSRF). */
export function baseUrlProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "Base URL belum benar. Contoh: https://api.openai.com/v1";
  }
  if (url.protocol !== "https:") return "Base URL harus diawali https://";
  if (url.username || url.password) return "Jangan taruh kata sandi di base URL; isi API key di kolomnya.";
  if (PRIVATE_HOST.some((re) => re.test(url.hostname))) return "Alamat internal/IP tidak diizinkan. Pakai nama domain penyedia.";
  if (url.search || url.hash) return "Base URL tanpa ?… atau #…";
  return null;
}

export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export const AiProviderInput = z
  .object({
    base_url: z.string().trim().min(1, "Isi base URL.").max(300),
    chat_model: z
      .string()
      .trim()
      .min(1, "Isi nama model.")
      .max(120)
      .regex(/^[A-Za-z0-9._:/@-]+$/, "Nama model hanya huruf, angka, dan . _ : / @ -"),
    /** Empty = keep the stored key. */
    api_key: z.string().trim().max(400).optional().default(""),
  })
  .superRefine((v, ctx) => {
    const problem = baseUrlProblem(v.base_url);
    if (problem) ctx.addIssue({ code: "custom", path: ["base_url"], message: problem });
  })
  .transform((v) => ({ ...v, base_url: normalizeBaseUrl(v.base_url) }));
export type AiProviderInput = z.infer<typeof AiProviderInput>;
