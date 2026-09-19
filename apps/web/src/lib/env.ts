import { z } from "zod";

/**
 * `NEXT_PUBLIC_*` vars are inlined into the client bundle at build time by
 * Next.js — this schema exists to fail fast with a clear error instead of
 * a confusing runtime "supabaseUrl is required" from deep inside a library.
 */
const WebEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_API_URL: z.url(),
});

export type WebEnv = z.infer<typeof WebEnvSchema>;

let cached: WebEnv | undefined;

export function getWebEnv(): WebEnv {
  if (cached) return cached;
  const result = WebEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  });
  if (!result.success) {
    throw new Error(
      `Invalid apps/web environment configuration: ${z.prettifyError(result.error)}`,
    );
  }
  cached = result.data;
  return cached;
}
