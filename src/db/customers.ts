import "server-only";
import type { CustomerListRow } from "@/core/customers";
import { isoDateInZone } from "@/core/period";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "./paginate";
import type { Shop } from "./shop";

const COLUMNS = "id, name, phone_e164, total_spent, orders_count, created_at, last_order_at";

interface CustomerDbRow {
  id: string;
  name: string | null;
  phone_e164: string | null;
  total_spent: number;
  orders_count: number;
  created_at: string;
  last_order_at: string | null;
}

function toRow(c: CustomerDbRow, timeZone: string): CustomerListRow {
  return {
    id: c.id,
    name: c.name,
    phone_e164: c.phone_e164,
    total_spent: Number(c.total_spent),
    orders_count: Number(c.orders_count),
    first_day: isoDateInZone(new Date(c.created_at), timeZone),
    last_order_day: c.last_order_at ? isoDateInZone(new Date(c.last_order_at), timeZone) : null,
  };
}

/** Every customer of the shop (Pelanggan, Konsultasi), as the signed-in owner (RLS applies). */
export async function listCustomers(shop: Pick<Shop, "id" | "timezone">, db?: SupabaseClient): Promise<CustomerListRow[]> {
  const supabase = db ?? (await createClient());
  const rows = await fetchAllRows<CustomerDbRow>((from, to) =>
    supabase.from("customers").select(COLUMNS).eq("tenant_id", shop.id).order("id").range(from, to),
  );
  return rows.map((c) => toRow(c, shop.timezone));
}

/** One customer of the shop, or null (unknown id, other tenant). */
export async function getCustomer(shop: Pick<Shop, "id" | "timezone">, id: string): Promise<CustomerListRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").select(COLUMNS).eq("tenant_id", shop.id).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toRow(data as CustomerDbRow, shop.timezone) : null;
}

/** CRM-2: the shop's own notes and labels on a buyer. */
export async function getCustomerNotes(tenantId: string, id: string): Promise<{ notes: string | null; tags: string[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("customers").select("notes, tags").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (error) throw error;
  return { notes: (data?.notes as string | null) ?? null, tags: (data?.tags as string[] | null) ?? [] };
}
