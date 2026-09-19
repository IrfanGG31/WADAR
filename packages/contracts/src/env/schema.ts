import { z } from "zod";

/**
 * Base env vars every app (api, worker) needs. Apps compose this with their own
 * additions (e.g. API_PORT) rather than redefining DATABASE_URL/REDIS_URL themselves.
 * Fail-fast: apps call `parseEnv` at boot and crash immediately on an invalid env,
 * instead of falling back to silent defaults.
 */
export const BaseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),
  SENTRY_DSN: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
});

export type BaseEnv = z.infer<typeof BaseEnvSchema>;

export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    console.error("Invalid environment configuration:", z.prettifyError(result.error));
    process.exit(1);
  }
  return result.data;
}
