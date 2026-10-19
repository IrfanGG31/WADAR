import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { itemTitle } from "@/core/stock-insight";
import {
  OPEN_PURCHASE_STATUSES,
  outstandingAmount,
  type PurchaseStatus,
  type SupplierChoice,
} from "@/core/purchasing";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "./paginate";
import { isSchemaPending } from "./schema-pending";

export interface SupplierRow {
  id: string;
  name: string;
  phone_e164: string | null;
  note: string | null;
}

export interface PurchaseOrderRow {
  id: string;
  number: string;
  status: PurchaseStatus;
  source: "manual" | "autopilot";
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_phone: string | null;
  total: number;
  received_total: number;
  paid_total: number;
  outstanding: number;
  note: string | null;
  line_count: number;
  created_at: string;
  ordered_at: string | null;
  received_at: string | null;
}

export interface PurchaseLineRow {
  id: string;
  variant_id: string;
  title: string;
  unit: string;
  qty: number;
  unit_cost: number;
  received_qty: number;
}

export interface PurchasePaymentRow {
  id: string;
  amount: number;
  method: string;
  paid_at: string;
}

const ORDER_COLUMNS =
  "id, number, status, source, supplier_id, total, received_total, paid_total, note, created_at, ordered_at, received_at, " +
  "suppliers(name, phone_e164), purchase_order_lines(count)";

interface OrderDbRow {
  id: string;
  number: string;
  status: PurchaseStatus;
  source: "manual" | "autopilot";
  supplier_id: string | null;
  total: number | string;
  received_total: number | string;
  paid_total: number | string;
  note: string | null;
  created_at: string;
  ordered_at: string | null;
  received_at: string | null;
  suppliers: { name: string; phone_e164: string | null } | null;
  purchase_order_lines: { count: number }[];
}

function toOrder(r: OrderDbRow): PurchaseOrderRow {
  const money = { status: r.status, total: Number(r.total), received_total: Number(r.received_total), paid_total: Number(r.paid_total) };
  return {
    id: r.id,
    number: r.number,
    source: r.source,
    supplier_id: r.supplier_id,
    supplier_name: r.suppliers?.name ?? null,
    supplier_phone: r.suppliers?.phone_e164 ?? null,
    ...money,
    outstanding: outstandingAmount(money),
    note: r.note,
    line_count: r.purchase_order_lines?.[0]?.count ?? 0,
    created_at: r.created_at,
    ordered_at: r.ordered_at,
    received_at: r.received_at,
  };
}

/** Pembelian is installed (migration purchasing) — false shows a notice instead of an error. */
export async function listPurchaseOrders(tenantId: string): Promise<{ installed: boolean; orders: PurchaseOrderRow[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(ORDER_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isSchemaPending(error)) return { installed: false, orders: [] };
    throw error;
  }
  return { installed: true, orders: ((data ?? []) as unknown as OrderDbRow[]).map(toOrder) };
}

export async function getPurchaseOrder(
  tenantId: string,
  id: string,
): Promise<{ order: PurchaseOrderRow; lines: PurchaseLineRow[]; payments: PurchasePaymentRow[] } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("purchase_orders").select(ORDER_COLUMNS).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) {
    if (isSchemaPending(error) || error.code === "22P02") return null;
    throw error;
  }
  if (!data) return null;
  const [{ data: lines, error: le }, { data: payments }] = await Promise.all([
    supabase
      .from("purchase_order_lines")
      .select("id, variant_id, qty, unit_cost, received_qty, variants(option_label, products(name, unit))")
      .eq("po_id", id)
      .order("id"),
    // Payments are owner-only (RLS): a cashier simply gets none.
    supabase.from("purchase_payments").select("id, amount, method, paid_at").eq("po_id", id).order("paid_at"),
  ]);
  if (le) throw le;
  return {
    order: toOrder(data as unknown as OrderDbRow),
    lines: (lines ?? []).map((l) => {
      const v = l.variants as unknown as { option_label: string | null; products: { name: string; unit: string } | null } | null;
      return {
        id: l.id as string,
        variant_id: l.variant_id as string,
        title: itemTitle({ product_name: v?.products?.name ?? "Produk", option_label: v?.option_label ?? null }),
        unit: v?.products?.unit ?? "pcs",
        qty: Number(l.qty),
        unit_cost: Number(l.unit_cost),
        received_qty: Number(l.received_qty),
      };
    }),
    payments: (payments ?? []).map((p) => ({ id: p.id as string, amount: Number(p.amount), method: p.method as string, paid_at: p.paid_at as string })),
  };
}

export async function listSuppliers(tenantId: string): Promise<SupplierRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name, phone_e164, note")
    .eq("tenant_id", tenantId)
    .is("archived_at", null)
    .order("name");
  if (error) {
    if (isSchemaPending(error)) return [];
    throw error;
  }
  return (data ?? []) as SupplierRow[];
}

export interface PurchasableVariant {
  id: string;
  title: string;
  unit: string;
  on_hand: number;
  avg_cost: number;
  /** Last price per supplier id (learned from receipts). */
  supplier_costs: Record<string, number>;
}

/** Every active product variant for the order form, with what each supplier last charged. */
export async function listPurchasableVariants(tenantId: string): Promise<PurchasableVariant[]> {
  const supabase = await createClient();
  const [variants, costs] = await Promise.all([
    fetchAllRows<{ id: string; on_hand: number; avg_cost: number; option_label: string | null; products: { name: string; unit: string } | null }>(
      (from, to) =>
        supabase
          .from("variants")
          .select("id, on_hand, avg_cost, option_label, products:products!inner(name, unit, is_active, deleted_at)")
          .eq("tenant_id", tenantId)
          .is("products.deleted_at", null)
          .eq("products.is_active", true)
          .order("id")
          .range(from, to),
    ),
    supabase.from("supplier_products").select("variant_id, supplier_id, last_unit_cost").eq("tenant_id", tenantId),
  ]);
  const bySupplier = new Map<string, Record<string, number>>();
  for (const c of costs.data ?? []) {
    const m = bySupplier.get(c.variant_id as string) ?? {};
    m[c.supplier_id as string] = Number(c.last_unit_cost);
    bySupplier.set(c.variant_id as string, m);
  }
  return variants
    .map((v) => ({
      id: v.id,
      title: itemTitle({ product_name: v.products?.name ?? "Produk", option_label: v.option_label }),
      unit: v.products?.unit ?? "pcs",
      on_hand: Number(v.on_hand),
      avg_cost: Number(v.avg_cost),
      supplier_costs: bySupplier.get(v.id) ?? {},
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "id"));
}

// ── Autopilot (service role) ────────────────────────────────────────────────

/** Variants already in an order that is not finished: restocking them again would double-order. */
export async function variantsOnOrder(db: SupabaseClient, tenantId: string): Promise<Set<string> | null> {
  const { data, error } = await db
    .from("purchase_order_lines")
    .select("variant_id, purchase_orders!inner(status)")
    .eq("tenant_id", tenantId)
    .in("purchase_orders.status", [...OPEN_PURCHASE_STATUSES]);
  if (error) {
    if (isSchemaPending(error)) return null;
    throw error;
  }
  return new Set((data ?? []).map((r) => r.variant_id as string));
}

/** For each variant, the supplier it was bought from most recently, at that price. */
export async function lastSuppliers(db: SupabaseClient, tenantId: string): Promise<Map<string, SupplierChoice>> {
  const { data, error } = await db
    .from("supplier_products")
    .select("variant_id, supplier_id, last_unit_cost, last_bought_at, suppliers!inner(archived_at)")
    .eq("tenant_id", tenantId)
    .is("suppliers.archived_at", null)
    .order("last_bought_at", { ascending: false });
  if (error) throw error;
  const out = new Map<string, SupplierChoice>();
  for (const r of data ?? []) {
    if (!out.has(r.variant_id as string)) out.set(r.variant_id as string, { supplier_id: r.supplier_id as string, last_unit_cost: Number(r.last_unit_cost) });
  }
  return out;
}

export interface PurchaseAgentSettings {
  auto_po: boolean;
  po_auto_limit: number;
}

/** Read apart from the other Autopilot settings: its columns come with migration purchasing. */
export async function readPurchaseAgentSettings(db: SupabaseClient, tenantId: string): Promise<PurchaseAgentSettings | null> {
  const { data, error } = await db.from("agent_settings").select("auto_po, po_auto_limit").eq("tenant_id", tenantId).maybeSingle();
  if (error) {
    if (isSchemaPending(error)) return null;
    throw error;
  }
  return { auto_po: data ? Boolean(data.auto_po) : true, po_auto_limit: data ? Number(data.po_auto_limit) : 0 };
}

export async function getPurchaseAgentSettings(tenantId: string): Promise<PurchaseAgentSettings | null> {
  return readPurchaseAgentSettings(await createClient(), tenantId);
}
