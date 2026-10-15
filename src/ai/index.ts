import "server-only";
import { CircuitBreaker } from "./breaker";
import { googleProvider } from "./providers/google";
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

export type { Ai } from "./run";
