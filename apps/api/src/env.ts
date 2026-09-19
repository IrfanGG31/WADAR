import { BaseEnvSchema, parseEnv } from "@wadar/contracts";
import { z } from "zod";

export const ApiEnvSchema = BaseEnvSchema.extend({
  API_PORT: z.coerce.number().int().positive().default(3001),
  // Supabase JWT verification (modules/identity SupabaseJwtGuard) — mode is
  // per-project, must be checked against the real instance, not assumed
  // (see .env.example). jwksUrl required for "jwks", hs256Secret for
  // "hs256" — validated with .refine below rather than a discriminated
  // union so an operator gets one clear message instead of a Zod union
  // mismatch error.
  SUPABASE_JWT_MODE: z.enum(["jwks", "hs256"]).default("jwks"),
  SUPABASE_JWKS_URL: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),
}).refine(
  (env) =>
    env.SUPABASE_JWT_MODE === "jwks" ? Boolean(env.SUPABASE_JWKS_URL) : Boolean(env.SUPABASE_JWT_SECRET),
  {
    message:
      "SUPABASE_JWKS_URL is required when SUPABASE_JWT_MODE=jwks, SUPABASE_JWT_SECRET when SUPABASE_JWT_MODE=hs256",
  },
);

export type ApiEnv = z.infer<typeof ApiEnvSchema>;

export function loadApiEnv(): ApiEnv {
  return parseEnv(ApiEnvSchema);
}
