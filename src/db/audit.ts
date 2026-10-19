import "server-only";
import type { AuditEntry } from "@/core/audit";
import { createClient } from "@/lib/supabase/server";

export type AppAuditAction = "data.exported" | "report.exported";

/**
 * POS-5: note an action that happens in the app (DB-side changes audit themselves via triggers).
 * Best effort — a failed log never blocks the download the owner asked for.
 */
export async function logAudit(tenantId: string, action: AppAuditAction, detail: Record<string, unknown> = {}): Promise<void> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("log_audit", { p_tenant_id: tenantId, p_action: action, p_detail: detail });
    if (error) console.error("audit log failed", action, error.message);
  } catch (e) {
    console.error("audit log failed", action, e);
  }
}

export interface AuditView extends AuditEntry {
  /** Product/variant name or member email the entry is about, when it still exists. */
  subject: string | null;
  /** Email of who did it; null when the account left the shop or it was the system. */
  actor: string | null;
}

/** Newest audit entries of a shop (owner-only via RLS), with names resolved for display. */
export async function listAudit(tenantId: string, limit = 100): Promise<AuditView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, action, entity, entity_id, actor_id, detail, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }) // UUIDv7: same-transaction entries keep their order
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as (AuditEntry & { entity: string | null })[];

  const variantIds = [...new Set(rows.filter((r) => r.entity === "variant" && r.entity_id).map((r) => r.entity_id as string))];
  const [variants, members] = await Promise.all([
    variantIds.length
      ? supabase.from("variants").select("id, option_label, products(name)").eq("tenant_id", tenantId).in("id", variantIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc("list_shop_members", { p_tenant_id: tenantId }),
  ]);
  const variantName = new Map<string, string>();
  for (const v of (variants.data ?? []) as unknown as { id: string; option_label: string | null; products: { name: string } | null }[]) {
    const name = v.products?.name ?? "Produk";
    variantName.set(v.id, v.option_label ? `${name} — ${v.option_label}` : name);
  }
  const email = new Map<string, string>();
  for (const m of (members.data ?? []) as { user_id: string; email: string | null }[]) if (m.email) email.set(m.user_id, m.email);

  return rows.map(({ entity, ...r }) => ({
    ...r,
    detail: r.detail ?? {},
    subject: entity === "variant" ? (variantName.get(r.entity_id ?? "") ?? null) : entity === "user" ? (email.get(r.entity_id ?? "") ?? null) : null,
    actor: r.actor_id ? (email.get(r.actor_id) ?? null) : null,
  }));
}
