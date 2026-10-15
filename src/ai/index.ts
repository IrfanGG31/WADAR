import "server-only";
import { CircuitBreaker } from "./breaker";
import { googleProvider } from "./providers/google";
import { createConsult, type Consult } from "./consult";
import { googleConsultModel } from "./providers/google-consult";
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

export type { Ai } from "./run";
export type { Consult } from "./consult";
