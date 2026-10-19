"use server";

import { redirect } from "next/navigation";
import { buildExportEntries, exportFileName, zipStore } from "@/core/export";
import { confirmsSlug, deletionError, deletionStage } from "@/core/shop-deletion";
import { loadExportData } from "@/db/export";
import { permissionDenied } from "@/db/access";
import { logAudit } from "@/db/audit";
import { getShop, getShopDeletion } from "@/db/shop";
import { formatDateTime } from "@/lib/format-date";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./actions";

/** Data & privasi (GAP #6, PDF §C.3 Tabel 10 "bisa diekspor/dihapus", UU PDP). */

export type ExportResult = { filename: string; base64: string } | { error: string };

/** Every table of the shop as CSV files in one ZIP; the browser saves it (base64 over the action). */
export async function exportShopData(slug: string): Promise<ExportResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "shop_data");
  if (denied) return { error: denied };
  const supabase = await createClient();
  try {
    const data = await loadExportData(supabase, shop.id);
    const now = new Date();
    const zip = zipStore(buildExportEntries(data), now);
    await logAudit(shop.id, "data.exported");
    return { filename: exportFileName(shop.slug, now), base64: Buffer.from(zip).toString("base64") };
  } catch (e) {
    console.error("shop export failed", e);
    return { error: "Ekspor belum berhasil. Coba lagi sebentar." };
  }
}

/** Stage 1: soft-delete — closed for buyers, purged after the grace period unless cancelled. */
export async function requestShopDeletion(slug: string, typedSlug: string): Promise<ActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "shop_data");
  if (denied) return { error: denied };
  if (!confirmsSlug(shop.slug, typedSlug)) return { error: deletionError({ code: "22023" }) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_shop_deletion", { p_tenant_id: shop.id, p_confirm_slug: typedSlug.trim().toLowerCase() });
  if (error) return { error: deletionError(error) };
  return { note: `Toko dijadwalkan dihapus permanen pada ${formatDateTime(String(data), "Asia/Jakarta")}. Kamu masih bisa membatalkan.` };
}

export async function cancelShopDeletion(slug: string): Promise<ActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "shop_data");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_shop_deletion", { p_tenant_id: shop.id });
  return error ? { error: deletionError(error) } : { note: "Penghapusan dibatalkan. Toko aktif lagi." };
}

/** Stage 2: permanent — every row of the shop is deleted (SQL cascade). Only after stage 1. */
export async function purgeShop(slug: string, typedSlug: string): Promise<ActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "shop_data");
  if (denied) return { error: denied };
  if (!confirmsSlug(shop.slug, typedSlug)) return { error: deletionError({ code: "22023" }) };
  if (deletionStage(await getShopDeletion(shop.id)).stage !== "scheduled") return { error: deletionError({ code: "55000" }) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("purge_shop", { p_tenant_id: shop.id, p_confirm_slug: typedSlug.trim().toLowerCase() });
  if (error) return { error: deletionError(error) };
  redirect("/mulai");
}
