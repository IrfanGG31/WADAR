import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_AGENT_SETTINGS,
  FAQ_WORTHY_CAUSES,
  planAgentTasks,
  staleTaskKeys,
  type AgentSettings,
  type AgentTaskKind,
  type UnansweredQuestion,
} from "@/core/agent";
import { createClient } from "@/lib/supabase/server";
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
  const planned = planAgentTasks(settings, { forecasts, unanswered });

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
  return { created, closed: stale.length, open: openKeys.size + created - stale.length };
}
