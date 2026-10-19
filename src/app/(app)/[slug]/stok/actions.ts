"use server";

import { redirect } from "next/navigation";
import { signedAdjustQty } from "@/core/audit";
import { ProductInput, StockAdjustInput, StockInInput, StockOpnameInput } from "@/core/catalog-schema";
import { expiryAfterStockIn, isIsoDay } from "@/core/expiry";
import { permissionDenied } from "@/db/access";
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

  const denied = await permissionDenied(shop.id, "catalog");

  if (denied) return { error: denied };
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
  const denied = await permissionDenied(shop.id, "catalog");
  if (denied) return { error: denied };
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
  /** Stock was booked but the expiry date was not saved. */
  expiryError?: string;
}

/**
 * Stok masuk (STK-0): adds stock and updates the weighted-average HPP. An
 * optional batch expiry date (STK-5) is a catalog edit (owner): checked before
 * anything is booked, then kept as the nearest date for the stock on hand.
 */
export async function stockIn(slug: string, input: unknown): Promise<StockInResult> {
  const parsed = StockInInput.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "stock_in");
  if (denied) return { error: denied };
  const supabase = await createClient();

  const incoming = parsed.data.expires_on;
  let before: { on_hand: number; expires_on: string | null } | null = null;
  if (incoming) {
    if (!isIsoDay(incoming)) return { error: "Tanggal kedaluwarsa belum benar." };
    const expiryDenied = await permissionDenied(shop.id, "catalog");
    if (expiryDenied) return { error: expiryDenied };
    const current = await supabase
      .from("variants")
      .select("on_hand, expires_on")
      .eq("tenant_id", shop.id)
      .eq("id", parsed.data.variant_id)
      .maybeSingle<{ on_hand: number; expires_on: string | null }>();
    if (current.error) {
      if (current.error.code === "42703") return { error: "Tanggal kedaluwarsa belum aktif di server. Kosongkan tanggalnya lalu catat lagi." };
      return { error: "Stok masuk belum tercatat. Coba lagi sebentar." };
    }
    if (!current.data) return { error: "Varian tidak ditemukan." };
    before = current.data;
  }

  const { data, error } = await supabase
    .rpc("stock_in", {
      p_variant_id: parsed.data.variant_id,
      p_qty: parsed.data.qty,
      p_unit_cost: parsed.data.unit_cost,
      p_note: parsed.data.note || null,
    })
    .single<{ on_hand: number; avg_cost: number }>();
  if (error || !data) return { error: "Stok masuk belum tercatat. Coba lagi sebentar." };
  const result: StockInResult = { onHand: data.on_hand, avgCost: data.avg_cost };

  if (before) {
    const next = expiryAfterStockIn(before.expires_on, Number(before.on_hand), incoming);
    if (next !== before.expires_on) {
      const saved = await supabase
        .from("variants")
        .update({ expires_on: next })
        .eq("tenant_id", shop.id)
        .eq("id", parsed.data.variant_id)
        .select("id");
      if (saved.error || !saved.data?.length) {
        result.expiryError = "Stok sudah tercatat, tapi tanggal kedaluwarsa belum tersimpan. Isi lagi di bagian Tanggal kedaluwarsa.";
      }
    }
  }
  return result;
}

/** Risiko kedaluwarsa (STK-5): set or clear one variant's expiry date (owner, like the rest of the catalog). */
export async function setVariantExpiry(slug: string, variantId: string, expiresOn: string | null): Promise<ActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(variantId)) return { error: "Varian tidak ditemukan." };
  if (expiresOn !== null && !isIsoDay(expiresOn)) return { error: "Tanggal kedaluwarsa belum benar." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "catalog");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("variants")
    .update({ expires_on: expiresOn })
    .eq("tenant_id", shop.id)
    .eq("id", variantId)
    .select("id");
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") return { error: "Tanggal kedaluwarsa belum aktif di server." };
    return { error: "Tanggal kedaluwarsa belum tersimpan. Coba lagi sebentar." };
  }
  if (!data || data.length === 0) return { error: "Varian tidak ditemukan." };
  return {};
}

export interface StockChangeResult extends ActionResult {
  onHand?: number;
  diff?: number;
}

function stockRpcError(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return "Hanya pemilik toko yang bisa menyesuaikan stok.";
  if (error.code === "P0002") return "Produk tidak ditemukan.";
  if (error.code === "22023") return error.message ?? "Isian belum benar.";
  return "Perubahan stok belum tercatat. Coba lagi sebentar.";
}

/** Penyesuaian & retur ke pemasok (STK-0b): one signed movement with a reason, audited (owner). */
export async function adjustStock(slug: string, input: unknown): Promise<StockChangeResult> {
  const parsed = StockAdjustInput.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "catalog");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("adjust_stock", {
    p_variant_id: parsed.data.variant_id,
    p_qty: signedAdjustQty(parsed.data.reason, parsed.data.qty),
    p_reason: parsed.data.reason,
    p_note: parsed.data.note || null,
  });
  if (error) return { error: stockRpcError(error) };
  return { onHand: Number((data as { on_hand: number }).on_hand) };
}

/** Stok opname (STK-0b): set the counted figure; the difference is booked and audited (owner). */
export async function countStock(slug: string, input: unknown): Promise<StockChangeResult> {
  const parsed = StockOpnameInput.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "catalog");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("stock_opname", {
    p_variant_id: parsed.data.variant_id,
    p_counted: parsed.data.counted,
    p_note: parsed.data.note || null,
  });
  if (error) return { error: stockRpcError(error) };
  const result = data as { counted: number; diff: number };
  return { onHand: Number(result.counted), diff: Number(result.diff) };
}
