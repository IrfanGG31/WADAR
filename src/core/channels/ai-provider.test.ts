import { describe, expect, it } from "vitest";
import { AI_PRESETS, AiProviderInput, baseUrlProblem } from "./ai-provider";

describe("baseUrlProblem (SSRF guard)", () => {
  it("accepts public https endpoints", () => {
    for (const p of AI_PRESETS.filter((p) => p.baseUrl)) expect(baseUrlProblem(p.baseUrl)).toBeNull();
  });

  it("refuses http, internal hosts, IP literals, credentials and query strings", () => {
    expect(baseUrlProblem("http://api.openai.com/v1")).toMatch(/https/);
    expect(baseUrlProblem("https://localhost:11434/v1")).toMatch(/internal/);
    expect(baseUrlProblem("https://db.internal/v1")).toMatch(/internal/);
    expect(baseUrlProblem("https://169.254.169.254/latest")).toMatch(/internal/);
    expect(baseUrlProblem("https://[::1]/v1")).toMatch(/internal/);
    expect(baseUrlProblem("https://user:pass@api.example.com/v1")).toMatch(/sandi/);
    expect(baseUrlProblem("https://api.example.com/v1?x=1")).toMatch(/\?/);
    expect(baseUrlProblem("bukan url")).toMatch(/belum benar/);
  });
});

describe("AiProviderInput", () => {
  it("trims the trailing slash and keeps an empty key as 'keep stored'", () => {
    expect(AiProviderInput.parse({ base_url: "https://openrouter.ai/api/v1/", chat_model: "vendor/model-x" })).toEqual({
      base_url: "https://openrouter.ai/api/v1",
      chat_model: "vendor/model-x",
      api_key: "",
    });
  });

  it("rejects odd model names", () => {
    expect(AiProviderInput.safeParse({ base_url: "https://api.example.com/v1", chat_model: "model x; drop" }).success).toBe(false);
  });
});
