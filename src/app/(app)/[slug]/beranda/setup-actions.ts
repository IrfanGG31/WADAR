"use server";

import { revalidatePath } from "next/cache";
import { permissionDenied } from "@/db/access";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

/** ONB-2: the owner hides "Siapkan tokomu" (the steps stay reachable from their own pages). */
export async function hideSetupChecklist(slug: string): Promise<{ error?: string }> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .update({ onboarding_done_at: new Date().toISOString() })
    .eq("id", shop.id)
    .select("id");
  if (error || !data?.length) return { error: "Belum bisa disembunyikan. Coba lagi sebentar." };
  revalidatePath(shopPath(slug, "beranda"));
  return {};
}
