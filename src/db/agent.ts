import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_AGENT_SETTINGS,
  FAQ_WORTHY_CAUSES,
  planAgentTasks,
  staleTaskKeys,
  type AgentSettings,
  type AgentTaskKind,
  type PurchaseDraftSummary,
  type UnansweredQuestion,
} from "@/core/agent";
import { canAutoApprove, planPurchaseDrafts } from "@/core/purchasing";
import { needsRestock, type ForecastRow } from "@/core/stock-insight";
import { createClient } from "@/lib/supabase/server";
import { lastSuppliers, readPurchaseAgentSettings, variantsOnOrder } from "./purchasing";
import { isSchemaPending } from "./schema-pending";
import { listStockForecasts } from "./stock";

export interface AgentTaskRow {
  id: string;
  kind: AgentTaskKind;
  title: string;
  body: string;
  payload: Record<string, string | number | null>;
  created_at: string;
}

async function readSettings(db: SupabaseClient, tenantId: string): Promise<AgentSettings> {
  const { data, error } = await db
    .from("agent_settings")
    .select("enabled, auto_reorder, auto_faq, auto_reply")
    .eq("tenant_id", tenantId)
    .maybeSingle<AgentSettings>();
  if (error && !isSchemaPending(error)) throw error;
  return data ?? DEFAULT_AGENT_SETTINGS;
}

/** Owner's view (RLS). */
export async function getAgentSettings(tenantId: string): Promise<AgentSettings> {
  return readSettings(await createClient(), tenantId);
}

export async function listOpenAgentTasks(tenantId: string): Promise<AgentTaskRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_tasks")
    .select("id, kind, title, body, payload, created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error && !isSchemaPending(error)) throw error;
  return (data ?? []) as AgentTaskRow[];
}

/** Escalated chats the store data could not answer, with the buyer's last question (14 days). */
async function unansweredQuestions(db: SupabaseClient, tenantId: string): Promise<UnansweredQuestion[]> {
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: convs, error } = await db
    .from("conversations")
    .select("id, escalation_reason")
    .eq("tenant_id", tenantId)
    .eq("status", "escalated")
    .in("escalation_reason", [...FAQ_WORTHY_CAUSES])
    .gte("last_message_at", since)
    .order("last_message_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  if (!convs?.length) return [];
  const { data: msgs, error: me } = await db
    .from("messages")
    .select("conversation_id, content, created_at")
    .eq("tenant_id", tenantId)
    .eq("author", "customer")
    .in("conversation_id", convs.map((c) => c.id))
    .order("created_at", { ascending: false })
    .limit(300);
  if (me) throw me;
  const last = new Map<string, string>();
  for (const m of msgs ?? []) if (m.content && !last.has(m.conversation_id)) last.set(m.conversation_id, m.content);
  return convs.flatMap((c) => (last.has(c.id) ? [{ conversation_id: c.id, question: last.get(c.id) as string, cause: c.escalation_reason as string }] : []));
}

export interface AgentRunReport {
  created: number;
  closed: number;
  /** Open tasks after this run (new + still waiting). */
  open: number;
  /** Pembelian: draft orders made this run, and how many of them Autopilot approved within the limit. */
  purchaseDrafts?: number;
  autoOrdered?: number;
}

/**
 * Pembelian step (ADR-005): products that need restocking and are not on an open order yet become
 * draft orders, one per supplier; drafts within the owner's limit are approved at once (the
 * database checks the limit again). Returns the variants now on order (null = Pembelian not
 * installed) and the drafts that wait for the owner.
 */
async function draftPurchaseOrders(
  db: SupabaseClient,
  tenantId: string,
  forecasts: readonly ForecastRow[],
): Promise<{ onOrder: Set<string>; drafts: PurchaseDraftSummary[]; created: number; ordered: number } | null> {
  const purchase = await readPurchaseAgentSettings(db, tenantId);
  if (!purchase?.auto_po) return null;
  const onOrder = await variantsOnOrder(db, tenantId);
  if (!onOrder) return null;

  const needs = forecasts
    .filter((r) => needsRestock(r) && r.reorder_qty > 0 && !onOrder.has(r.variant_id))
    .map((r) => ({ variant_id: r.variant_id, title: r.title, unit: r.unit, qty: r.reorder_qty, avg_cost: r.avg_cost ?? 0 }));
  let created = 0;
  let ordered = 0;
  if (needs.length) {
    const suppliers = await lastSuppliers(db, tenantId);
    for (const plan of planPurchaseDrafts(needs, (id) => suppliers.get(id))) {
      const { data, error } = await db.rpc("create_purchase_order", {
        p_tenant_id: tenantId,
        p_supplier_id: plan.supplier_id,
        p_lines: plan.lines,
        p_note: null,
        p_source: "autopilot",
      });
      if (error) throw error;
      created += 1;
      for (const l of plan.lines) onOrder.add(l.variant_id);
      if (canAutoApprove(plan, purchase.po_auto_limit)) {
        const { error: oe } = await db.rpc("order_purchase_order", { p_po_id: (data as { id: string }).id });
        if (!oe) ordered += 1;
        else if (oe.code !== "42501") throw oe;
      }
    }
  }

  const { data: drafts, error } = await db
    .from("purchase_orders")
    .select("id, number, total, suppliers(name), purchase_order_lines(count)")
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .eq("source", "autopilot")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return {
    onOrder,
    created,
    ordered,
    drafts: (drafts ?? []).map((d) => ({
      id: d.id as string,
      number: d.number as string,
      supplier_name: (d.suppliers as unknown as { name: string } | null)?.name ?? null,
      line_count: (d.purchase_order_lines as unknown as { count: number }[])?.[0]?.count ?? 0,
      total: Number(d.total),
    })),
  };
}

/**
 * One Autopilot pass for one shop (service role): plan from current data, add new drafts (one
 * open task per subject), close drafts whose reason is gone. Safe to re-run any time.
 */
export async function runAgentForShop(db: SupabaseClient, tenantId: string): Promise<AgentRunReport> {
  const settings = await readSettings(db, tenantId);
  const [forecasts, unanswered, open] = await Promise.all([
    settings.enabled && settings.auto_reorder ? listStockForecasts(tenantId, db) : Promise.resolve([]),
    settings.enabled && settings.auto_faq ? unansweredQuestions(db, tenantId) : Promise.resolve([]),
    db.from("agent_tasks").select("dedupe_key, kind").eq("tenant_id", tenantId).eq("status", "open"),
  ]);
  if (open.error) {
    if (isSchemaPending(open.error)) return { created: 0, closed: 0, open: 0 };
    throw open.error;
  }
  const purchasing = settings.enabled && settings.auto_reorder ? await draftPurchaseOrders(db, tenantId, forecasts) : null;
  const planned = planAgentTasks(settings, {
    // Products already on an order are not suggested again; the order's draft is the task.
    forecasts: purchasing ? forecasts.filter((r) => !purchasing.onOrder.has(r.variant_id)) : forecasts,
    unanswered,
    purchaseDrafts: purchasing?.drafts,
  });

  const openKeys = new Set((open.data ?? []).map((t) => t.dedupe_key));
  let created = 0;
  for (const t of planned) {
    if (openKeys.has(t.dedupe_key)) continue;
    const { error } = await db.from("agent_tasks").insert({ tenant_id: tenantId, ...t });
    if (error && error.code !== "23505") throw error;
    if (!error) created += 1;
  }

  const kinds: AgentTaskKind[] = [];
  if (!settings.enabled || settings.auto_reorder) kinds.push("reorder");
  if (!settings.enabled || settings.auto_faq) kinds.push("faq");
  const stale = staleTaskKeys((open.data ?? []) as { dedupe_key: string; kind: AgentTaskKind }[], planned, kinds);
  if (stale.length) {
    const { error } = await db
      .from("agent_tasks")
      .update({ status: "done", decided_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("status", "open")
      .in("dedupe_key", stale);
    if (error) throw error;
  }
  return {
    created,
    closed: stale.length,
    open: openKeys.size + created - stale.length,
    ...(purchasing ? { purchaseDrafts: purchasing.created, autoOrdered: purchasing.ordered } : {}),
  };
}
