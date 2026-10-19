"use server";

import { revalidatePath } from "next/cache";
import { canDeactivate, ChannelFeeInput, NewChannelInput } from "@/core/channel-settings";
import { permissionDenied } from "@/db/access";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export interface ChannelActionResult {
  error?: string;
}

/** FIN-2: the owner's own commission replaces the estimate; changes land in the audit log (trigger). */
export async function updateChannel(slug: string, channelId: string, input: unknown): Promise<ChannelActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(channelId)) return { error: "Kanal tidak ditemukan." };
  const parsed = ChannelFeeInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum benar." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const current = await supabase.from("channels").select("kind, fee_pct, fee_fixed").eq("tenant_id", shop.id).eq("id", channelId).maybeSingle();
  if (current.error || !current.data) return { error: "Kanal tidak ditemukan." };
  if (!parsed.data.is_active && !canDeactivate(current.data.kind)) return { error: "Kanal kasir tidak bisa dimatikan." };
  const feeChanged = Number(current.data.fee_pct) !== parsed.data.fee_pct || Number(current.data.fee_fixed) !== parsed.data.fee_fixed;
  const { error } = await supabase
    .from("channels")
    .update({ ...parsed.data, ...(feeChanged ? { fee_is_default: false } : {}) })
    .eq("tenant_id", shop.id)
    .eq("id", channelId);
  if (error) return { error: "Kanal belum tersimpan. Coba lagi sebentar." };
  revalidatePath(shopPath(slug, "pengaturan/kanal"));
  return {};
}

export async function addChannel(slug: string, input: unknown): Promise<ChannelActionResult> {
  const parsed = NewChannelInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum benar." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.from("channels").insert({ tenant_id: shop.id, ...parsed.data, fee_is_default: false });
  if (error) return { error: "Kanal belum tersimpan. Coba lagi sebentar." };
  revalidatePath(shopPath(slug, "pengaturan/kanal"));
  return {};
}
