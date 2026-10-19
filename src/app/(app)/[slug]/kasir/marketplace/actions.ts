"use server";

import { revalidatePath } from "next/cache";
import { MarketplaceImportInput } from "@/core/marketplace-import";
import { permissionDenied } from "@/db/access";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export type MarketplaceImportResult =
  | { error: string }
  | { created: number; duplicate: number; canceled: number; failed: number; errors: { order: string; error: string }[] };

/**
 * IMP-1..3: book parsed + matched marketplace orders (owner). One order = one sale with its real
 * commission (or the channel's estimate), stock out for completed orders; re-importing the same
 * file only reports duplicates.
 */
export async function importMarketplaceOrders(slug: string, input: unknown): Promise<MarketplaceImportResult> {
  const parsed = MarketplaceImportInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isi file belum bisa dibaca." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "finance");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_marketplace_orders", {
    p_tenant_id: shop.id,
    p_channel_id: parsed.data.channel_id,
    p_marketplace: parsed.data.marketplace,
    p_file_name: parsed.data.file_name,
    p_orders: parsed.data.orders,
  });
  if (error) {
    if (error.code === "42501") return { error: "Hanya pemilik toko yang bisa mengimpor pesanan." };
    if (error.code === "P0002") return { error: "Kanal tidak ditemukan. Muat ulang halaman." };
    console.error("marketplace import failed", error.code);
    return { error: "Impor belum berhasil. Coba lagi sebentar." };
  }
  revalidatePath(shopPath(slug, "kasir"), "layout");
  const r = data as { created: number; duplicate: number; canceled: number; failed: number; errors: { order: string; error: string }[] };
  return { created: r.created, duplicate: r.duplicate, canceled: r.canceled, failed: r.failed, errors: r.errors ?? [] };
}
