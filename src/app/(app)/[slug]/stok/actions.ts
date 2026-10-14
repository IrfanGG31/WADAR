"use server";

import { redirect } from "next/navigation";
import { ProductInput, StockInInput } from "@/core/catalog-schema";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
}

function firstIssue(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? "Isian belum lengkap.";
}

/** Create (productId null) or edit a product with its variants; opening stock is booked as a purchase. */
export async function saveProduct(slug: string, productId: string | null, input: unknown): Promise<ActionResult> {
  const parsed = ProductInput.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const shop = await getShop(slug);
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_product", {
    p_tenant_id: shop.id,
    p_product_id: productId,
    p_product: parsed.data,
  });
  if (error) {
    if (error.code === "23505") return { error: "SKU itu sudah dipakai produk lain." };
    return { error: "Produk belum tersimpan. Coba lagi sebentar." };
  }
  redirect(shopPath(slug, "stok"));
}

/** Hide a product from the catalog and the cashier; its sales history stays. */
export async function archiveProduct(slug: string, productId: string): Promise<ActionResult> {
  const shop = await getShop(slug);
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq("tenant_id", shop.id)
    .eq("id", productId);
  if (error) return { error: "Produk belum bisa diarsipkan. Coba lagi sebentar." };
  redirect(shopPath(slug, "stok"));
}

export interface StockInResult extends ActionResult {
  onHand?: number;
  avgCost?: number;
}

/** Stok masuk (STK-0): adds stock and updates the weighted-average HPP. */
export async function stockIn(input: unknown): Promise<StockInResult> {
  const parsed = StockInInput.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("stock_in", {
      p_variant_id: parsed.data.variant_id,
      p_qty: parsed.data.qty,
      p_unit_cost: parsed.data.unit_cost,
      p_note: parsed.data.note || null,
    })
    .single<{ on_hand: number; avg_cost: number }>();
  if (error || !data) return { error: "Stok masuk belum tercatat. Coba lagi sebentar." };
  return { onHand: data.on_hand, avgCost: data.avg_cost };
}
