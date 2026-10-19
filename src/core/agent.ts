import { formatRupiah } from "./money";
import { formatCount } from "./number-format";
import { needsRestock, sortByUrgency, type ForecastRow } from "./stock-insight";

/**
 * Autopilot (ADR-003): what the agent prepares for the owner, decided by rules over data the shop
 * already has — no LLM, so no invented quantities or money. Every task is a draft the owner can
 * finish in one tap; tasks whose reason is gone (stock arrived, FAQ added) close themselves.
 */
export interface AgentSettings {
  enabled: boolean;
  auto_reorder: boolean;
  auto_faq: boolean;
  auto_reply: boolean;
}

/** A shop without a saved row gets everything on: drafts only, nothing is sent or booked by itself. */
export const DEFAULT_AGENT_SETTINGS: AgentSettings = { enabled: true, auto_reorder: true, auto_faq: true, auto_reply: true };

export type AgentTaskKind = "reorder" | "faq";

export interface AgentTaskDraft {
  kind: AgentTaskKind;
  dedupe_key: string;
  title: string;
  body: string;
  payload: Record<string, string | number | null>;
}

export interface UnansweredQuestion {
  conversation_id: string;
  question: string;
  cause: string;
}

/** Escalation causes that mean "the store data had no answer" — a FAQ would have answered them. */
export const FAQ_WORTHY_CAUSES = new Set(["not_in_store_data", "low_confidence", "out_of_scope"]);

export const MAX_REORDER_TASKS = 20;
export const MAX_FAQ_TASKS = 10;

/** A draft purchase order Autopilot prepared (Pembelian, ADR-005) that waits for the owner. */
export interface PurchaseDraftSummary {
  id: string;
  number: string;
  supplier_name: string | null;
  line_count: number;
  total: number;
}

export function planAgentTasks(
  settings: AgentSettings,
  data: { forecasts: readonly ForecastRow[]; unanswered: readonly UnansweredQuestion[]; purchaseDrafts?: readonly PurchaseDraftSummary[] },
): AgentTaskDraft[] {
  if (!settings.enabled) return [];
  const tasks: AgentTaskDraft[] = [];
  if (settings.auto_reorder) {
    // With Pembelian, restocking becomes draft orders per supplier: one task per draft to approve.
    for (const d of data.purchaseDrafts ?? []) {
      tasks.push({
        kind: "reorder",
        dedupe_key: `po:${d.id}`,
        title: d.supplier_name ? `Setujui pesanan ke ${d.supplier_name}` : `Pilih pemasok untuk ${d.number}`,
        body: `${d.number}: ${formatCount(d.line_count)} barang, total ${formatRupiah(d.total)}.`,
        payload: { po_id: d.id, number: d.number, total: d.total, supplier: d.supplier_name },
      });
    }
    for (const r of sortByUrgency(data.forecasts.filter(needsRestock)).slice(0, MAX_REORDER_TASKS)) {
      if (r.reorder_qty <= 0) continue;
      tasks.push({
        kind: "reorder",
        dedupe_key: `reorder:${r.variant_id}`,
        title: `Pesan ulang ${r.title}`,
        body: `${r.narrative} Sisa ${formatCount(r.on_hand)} ${r.unit}.`,
        payload: { variant_id: r.variant_id, product_id: r.product_id, item: r.title, qty: r.reorder_qty, unit: r.unit, status: r.status },
      });
    }
  }
  if (settings.auto_faq) {
    const seen = new Set<string>();
    for (const q of data.unanswered) {
      if (!FAQ_WORTHY_CAUSES.has(q.cause)) continue;
      const normalized = q.question.trim().toLowerCase().replace(/\s+/g, " ");
      if (normalized.length < 5 || seen.has(normalized)) continue;
      seen.add(normalized);
      tasks.push({
        kind: "faq",
        dedupe_key: `faq:${q.conversation_id}`,
        title: "Pertanyaan pembeli belum ada jawabannya",
        body: q.question.trim().slice(0, 300),
        payload: { conversation_id: q.conversation_id, question: q.question.trim().slice(0, 200) },
      });
      if (seen.size >= MAX_FAQ_TASKS) break;
    }
  }
  return tasks;
}

/** Open tasks whose subject no longer appears in this run's plan: their reason is gone. */
export function staleTaskKeys(open: readonly { dedupe_key: string; kind: AgentTaskKind }[], planned: readonly AgentTaskDraft[], kinds: readonly AgentTaskKind[]): string[] {
  const now = new Set(planned.map((t) => t.dedupe_key));
  return open.filter((t) => kinds.includes(t.kind) && !now.has(t.dedupe_key)).map((t) => t.dedupe_key);
}

/** One WhatsApp-ready message to the supplier for several reorder tasks. */
export function supplierMessage(shopName: string, items: readonly { item: string; qty: number; unit: string }[]): string {
  const lines = items.map((i) => `- ${i.item}: ${formatCount(i.qty)} ${i.unit}`);
  return [`Halo, saya dari ${shopName}. Mau pesan ulang:`, ...lines, "", "Mohon info total dan estimasi kirimnya. Terima kasih."].join("\n");
}
