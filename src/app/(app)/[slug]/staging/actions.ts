"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { permissionDenied } from "@/db/access";
import { getStoreProfile } from "@/db/kb";
import { getShop } from "@/db/shop";
import { createClient } from "@/lib/supabase/server";

const ShopIdentityInput = z.object({
  name: z.string().trim().min(2, "Nama usaha minimal 2 huruf.").max(60, "Nama usaha maksimal 60 huruf."),
  owner: z.string().trim().min(1, "Isi nama pemilik/asisten.").max(30, "Nama maksimal 30 huruf."),
  address: z.string().trim().max(300).default(""),
});

export interface IdentityResult {
  error?: string;
  note?: string;
}

/** Ruang Demo › Sesuaikan toko: shop name (tenants.name), the assistant's name and the address (store_profile). */
export async function saveShopIdentity(slug: string, input: unknown): Promise<IdentityResult> {
  const parsed = ShopIdentityInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum benar." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };

  const v = parsed.data;
  const supabase = await createClient();
  const { error: nameError } = await supabase.from("tenants").update({ name: v.name }).eq("id", shop.id);
  if (nameError) return { error: "Nama belum tersimpan. Coba lagi sebentar." };

  const profile = await getStoreProfile(shop.id);
  const { error } = await supabase
    .from("store_profile")
    .update({ persona: { ...profile.persona, name: v.owner }, policies: { ...profile.policies, address: v.address } })
    .eq("tenant_id", shop.id);
  if (error) return { error: "Nama usaha tersimpan, tapi nama asisten/alamat belum. Coba lagi." };

  revalidatePath(`/${encodeURIComponent(slug)}`, "layout");
  return { note: `Tersimpan. Sekarang tokonya bernama "${v.name}".` };
}
