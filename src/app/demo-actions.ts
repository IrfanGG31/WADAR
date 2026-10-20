"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseDemoProfile } from "@/core/demo-profiles";
import { clientIp, DEMO_IP_LIMIT, DEMO_WINDOW_MS } from "@/core/rate-limit";
import { sharedRateLimiter } from "@/db/rate-limit";
import { shopPath } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function adminOrNull() {
  try {
    return createAdminClient();
  } catch {
    return null; // no service-role key on this deployment: per-instance limit only
  }
}

/**
 * "Coba demo" (ONB-3): signs the visitor in anonymously if needed, then builds a
 * fresh demo shop with 90 days of data for them (create_demo_shop, ~1 s) and
 * opens its Beranda. Every visitor gets their own copy, so demos never collide.
 * Each copy costs real database work, so: at most DEMO_IP_LIMIT per client IP
 * per hour (checked here, before signing in), and one active demo per user
 * (`create_demo_shop` reopens it instead of building another).
 */
export async function startDemo(formData: FormData): Promise<void> {
  const profile = parseDemoProfile(formData.get("profile"));
  const ip = clientIp(await headers()) ?? "unknown";
  const limit = await sharedRateLimiter(adminOrNull(), DEMO_WINDOW_MS)
    .hit([{ key: `demo:ip:${ip}`, limit: DEMO_IP_LIMIT }], Date.now())
    .catch(() => ({ limited: false, retryAfterSeconds: 0 })); // a limiter outage must not break the demo button
  if (limit.limited) redirect("/masuk?error=demo_busy");
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) redirect("/masuk?error=demo_unavailable");
  }

  const { data: slug, error } = await supabase.rpc("create_demo_shop", { p_profile: profile });
  if (error || typeof slug !== "string") redirect("/masuk?error=demo_failed");
  redirect(shopPath(slug, "beranda"));
}
