"use server";

import { revalidatePath } from "next/cache";
import { CustomerProfileInput } from "@/core/customer-profile";
import { permissionDenied } from "@/db/access";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
}

/** CRM-2: name, labels, and notes on one buyer (owner and cashier — the people who serve buyers). */
export async function updateCustomerProfile(slug: string, customerId: string, input: unknown): Promise<ActionResult> {
  const parsed = CustomerProfileInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum lengkap." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "sell");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .update({ name: parsed.data.name, notes: parsed.data.notes, tags: parsed.data.tags })
    .eq("tenant_id", shop.id)
    .eq("id", customerId)
    .select("id");
  if (error || !data?.length) return { error: "Catatan pelanggan belum tersimpan. Coba lagi sebentar." };
  revalidatePath(shopPath(slug, `pelanggan/${customerId}`));
  return {};
}
