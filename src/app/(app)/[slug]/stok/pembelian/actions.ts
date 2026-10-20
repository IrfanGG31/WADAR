"use server";

import { revalidatePath } from "next/cache";
import { PaymentInput, PurchaseOrderInput, ReceiveInput, SupplierInput } from "@/core/purchasing";
import { formatRupiah } from "@/core/money";
import { permissionDenied } from "@/db/access";
import { isSchemaPending, SCHEMA_PENDING_MESSAGE } from "@/db/schema-pending";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import { scheduleWebhookDispatch } from "@/lib/webhook-dispatch";

export interface PurchaseActionResult {
  error?: string;
  note?: string;
  /** The order created or saved. */
  id?: string;
}

const firstIssue = (e: { issues: { message: string }[] }) => e.issues[0]?.message ?? "Isian belum lengkap.";

/** The database's own Indonesian messages (22023 invalid value, P0002 not found) are shown as is. */
function rpcError(error: { code?: string; message?: string }, fallback: string): string {
  if (isSchemaPending(error)) return SCHEMA_PENDING_MESSAGE;
  if ((error.code === "22023" || error.code === "P0002") && error.message) return error.message;
  if (error.code === "42501") return "Akunmu tidak bisa melakukan ini. Minta pemilik toko.";
  return fallback;
}

const refresh = (slug: string, id?: string) => {
  revalidatePath(shopPath(slug, "stok/pembelian"));
  if (id) revalidatePath(shopPath(slug, `stok/pembelian/${id}`));
};

// ── Suppliers ───────────────────────────────────────────────────────────────

export async function saveSupplier(slug: string, id: string | null, input: unknown): Promise<PurchaseActionResult> {
  const parsed = SupplierInput.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "purchase");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_supplier", {
    p_tenant_id: shop.id,
    p_id: id,
    p_name: parsed.data.name,
    p_phone: parsed.data.phone,
    p_note: parsed.data.note,
  });
  if (error) return { error: error.code === "23505" ? "Pemasok dengan nama itu sudah ada." : rpcError(error, "Pemasok belum tersimpan. Coba lagi sebentar.") };
  revalidatePath(shopPath(slug, "stok/pembelian/pemasok"));
  return { id: data as string, note: id ? "Tersimpan." : `${parsed.data.name} ditambahkan.` };
}

export async function archiveSupplier(slug: string, id: string): Promise<PurchaseActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "purchase");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_supplier", { p_id: id });
  if (error) return { error: rpcError(error, "Belum bisa dihapus. Coba lagi sebentar.") };
  revalidatePath(shopPath(slug, "stok/pembelian/pemasok"));
  return { note: "Pemasok disembunyikan. Riwayat pesanannya tetap ada." };
}

// ── Orders ──────────────────────────────────────────────────────────────────

export async function createPurchaseOrder(slug: string, input: unknown): Promise<PurchaseActionResult> {
  const parsed = PurchaseOrderInput.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "purchase");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_purchase_order", {
    p_tenant_id: shop.id,
    p_supplier_id: parsed.data.supplier_id,
    p_lines: parsed.data.lines,
    p_note: parsed.data.note,
    p_source: "manual",
  });
  if (error) return { error: rpcError(error, "Pesanan belum tersimpan. Coba lagi sebentar.") };
  const po = data as { id: string; number: string; total: number } | null;
  refresh(slug);
  if (!po) return { error: "Pesanan belum tersimpan. Coba lagi sebentar." };
  return { id: po.id, note: `${po.number} tersimpan sebagai draf (${formatRupiah(Number(po.total))}).` };
}

export async function updatePurchaseOrder(slug: string, id: string, input: unknown): Promise<PurchaseActionResult> {
  const parsed = PurchaseOrderInput.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "purchase");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_purchase_order", {
    p_po_id: id,
    p_supplier_id: parsed.data.supplier_id,
    p_lines: parsed.data.lines,
    p_note: parsed.data.note,
  });
  if (error) return { error: rpcError(error, "Perubahan belum tersimpan. Coba lagi sebentar.") };
  refresh(slug, id);
  return { id, note: "Draf diperbarui." };
}

/** Setujui & pesan: the draft becomes an order to the supplier (the WhatsApp text is on the page). */
export async function orderPurchaseOrder(slug: string, id: string): Promise<PurchaseActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "purchase");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("order_purchase_order", { p_po_id: id });
  if (error) return { error: rpcError(error, "Belum bisa disetujui. Coba lagi sebentar.") };
  refresh(slug, id);
  return { note: "Disetujui. Kirim pesanannya ke pemasok lewat WhatsApp." };
}

export async function cancelPurchaseOrder(slug: string, id: string): Promise<PurchaseActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "purchase");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_purchase_order", { p_po_id: id });
  if (error) return { error: rpcError(error, "Belum bisa dibatalkan. Coba lagi sebentar.") };
  refresh(slug, id);
  return { note: "Pesanan dibatalkan." };
}

/** Terima barang (owner or cashier, like Stok masuk): stock and average cost update at once. */
export async function receivePurchaseOrder(slug: string, id: string, input: unknown): Promise<PurchaseActionResult> {
  const parsed = ReceiveInput.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "stock_in");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receive_purchase_order", {
    p_po_id: id,
    p_lines: parsed.data.lines.filter((l) => l.qty > 0),
    p_idempotency_key: parsed.data.idempotency_key,
  });
  if (error) return { error: rpcError(error, "Penerimaan belum tercatat. Coba lagi sebentar.") };
  const r = (data ?? { total: 0, status: "partial" }) as { total: number; status: string };
  scheduleWebhookDispatch(shop.id);
  refresh(slug, id);
  revalidatePath(shopPath(slug, "stok"));
  return {
    note:
      r.status === "received"
        ? `Barang diterima semua (${formatRupiah(Number(r.total))}). Stok dan HPP sudah diperbarui.`
        : `Tercatat ${formatRupiah(Number(r.total))}. Sisanya ditunggu; terima lagi saat datang.`,
  };
}

export async function payPurchaseOrder(slug: string, id: string, input: unknown): Promise<PurchaseActionResult> {
  const parsed = PaymentInput.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "purchase");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_purchase_order", {
    p_po_id: id,
    p_amount: parsed.data.amount,
    p_method: parsed.data.method,
    p_idempotency_key: parsed.data.idempotency_key,
  });
  if (error) return { error: rpcError(error, "Pembayaran belum tercatat. Coba lagi sebentar.") };
  refresh(slug, id);
  return { note: `Pembayaran ${formatRupiah(parsed.data.amount)} tercatat.` };
}
