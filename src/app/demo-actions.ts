"use server";

import { redirect } from "next/navigation";
import { shopPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * "Coba demo" (ONB-3): signs the visitor in anonymously if needed, then builds a
 * fresh demo shop with 90 days of data for them (create_demo_shop, ~1 s) and
 * opens its Beranda. Every visitor gets their own copy, so demos never collide.
 */
export async function startDemo(formData: FormData): Promise<void> {
  const profile = formData.get("profile") === "kopi" ? "kopi" : "skincare";
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
