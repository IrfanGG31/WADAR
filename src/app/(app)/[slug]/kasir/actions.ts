"use server";

import { resolveOccurredAt } from "@/core/offline-sales";
import { normalizePhone } from "@/core/phone";
import { receiptLinkError, receiptPath } from "@/core/receipt";
import { SaleInput } from "@/core/sale-schema";
import { VoidSaleInput, voidResultNote, voidSaleError } from "@/core/sale-void";
import { permissionDenied } from "@/db/access";
import { getShop } from "@/db/shop";
import { createClient } from "@/lib/supabase/server";

export interface RecordSaleResult {
  error?: string;
  saleId?: string;
  total?: number;
  duplicate?: boolean;
  /** Temporary failure: an offline-queued sale stays queued (POS-6). */
  retryable?: boolean;
}

/**
 * Bayar (POS-1): one atomic, idempotent public.record_sale call. Also the
 * resend target of the offline queue (POS-6): the same idempotency key
 * returns the sale already stored, so a resend never records it twice.
 */
export async function recordSale(slug: string, input: unknown): Promise<RecordSaleResult> {
  const parsed = SaleInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Data transaksi belum lengkap." };
  const sale = parsed.data;

  let phone: string | null = null;
  if (sale.customer_phone) {
    phone = normalizePhone(sale.customer_phone);
    if (!phone) return { error: "Nomor HP pelanggan belum benar. Contoh: 0812-3456-7890." };
  }

  const shop = await getShop(slug);

  const denied = await permissionDenied(shop.id, "sell");

  if (denied) return { error: denied };
  const when = resolveOccurredAt(sale.occurred_at, new Date());
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_sale", {
    p_tenant_id: shop.id,
    p_channel_id: sale.channel_id,
    p_items: sale.items,
    p_idempotency_key: sale.idempotency_key,
    p_order_discount: sale.order_discount,
    p_payment_method: sale.payment_method,
    p_customer_phone: phone,
    p_customer_name: sale.customer_name || null,
    ...(when.occurredAt ? { p_occurred_at: when.occurredAt } : {}),
    ...(when.note ? { p_note: when.note } : {}),
  });
  if (error) {
    // Business rule messages from the function are written for the cashier ("Stok Serum tinggal 2").
    if (error.code === "P0001" || error.code === "22023" || error.code === "P0002") return { error: error.message };
    return { error: "Transaksi belum tersimpan. Coba tekan Bayar lagi; tidak akan tercatat dobel.", retryable: true };
  }
  const result = data as { sale_id: string; total: number; duplicate: boolean };
  return { saleId: result.sale_id, total: Number(result.total), duplicate: result.duplicate };
}

export interface VoidSaleResult {
  error?: string;
  note?: string;
}

/** Batalkan transaksi (POS-5): owner only; the sale row stays, stock comes back, reports drop it. */
export async function voidSale(slug: string, input: unknown): Promise<VoidSaleResult> {
  const parsed = VoidSaleInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Transaksi tidak ditemukan." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "void_sale");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("void_sale", { p_sale_id: parsed.data.sale_id, p_reason: parsed.data.reason || null });
  if (error) return { error: voidSaleError(error) };
  return { note: voidResultNote((data ?? {}) as { already_void?: boolean; restocked?: number }) };
}

export interface ReceiptLinkResult {
  error?: string;
  /** Site-relative; the client prefixes its own origin. */
  path?: string;
}

/** Struk publik (POS-3): the sale's random receipt token as a shareable path (staff who can sell). */
export async function getReceiptLink(slug: string, saleId: string): Promise<ReceiptLinkResult> {
  if (!/^[0-9a-f-]{36}$/i.test(saleId)) return { error: "Transaksi tidak ditemukan." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "sell");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sales")
    .select("receipt_token")
    .eq("tenant_id", shop.id)
    .eq("id", saleId)
    .maybeSingle();
  if (error) return { error: receiptLinkError(error) };
  const token = (data as { receipt_token?: string } | null)?.receipt_token;
  if (!token) return { error: "Transaksi tidak ditemukan." };
  return { path: receiptPath(token) };
}
