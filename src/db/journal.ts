import "server-only";
import type { AccountBalanceRow } from "@/core/ledger";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "./paginate";
import { isSchemaPending } from "./schema-pending";

export interface JournalEntryRow {
  id: string;
  entry_date: string;
  source_type: string;
  memo: string;
  lines: { account_code: string; debit: number; credit: number }[];
}

export interface JournalView {
  installed: boolean;
  /** Entries this load posted (documents that were not in the ledger yet). */
  posted: number;
  balances: AccountBalanceRow[];
  recent: JournalEntryRow[];
  shelf: { on_hand: number; avg_cost: number }[];
}

const EMPTY: JournalView = { installed: false, posted: 0, balances: [], recent: [], shelf: [] };

/**
 * The owner's ledger (RLS: owner only). Posting runs first, so the page always shows every sale,
 * expense and receipt so far — posting is idempotent and only adds what is new.
 */
export async function getJournalView(tenantId: string, from: string, to: string): Promise<JournalView> {
  const supabase = await createClient();
  const { data: posted, error: pe } = await supabase.rpc("post_journal", { p_tenant_id: tenantId });
  if (pe) {
    if (isSchemaPending(pe)) return EMPTY;
    throw pe;
  }
  const [balances, recent, shelf] = await Promise.all([
    supabase.rpc("journal_balances", { p_tenant_id: tenantId, p_from: from, p_to: to }),
    supabase
      .from("journal_entries")
      .select("id, entry_date, source_type, memo, journal_lines(account_code, debit, credit)")
      .eq("tenant_id", tenantId)
      .order("entry_date", { ascending: false })
      .order("posted_at", { ascending: false })
      .limit(20),
    fetchAllRows<{ on_hand: number; avg_cost: number }>((f, t) =>
      supabase.from("variants").select("on_hand, avg_cost").eq("tenant_id", tenantId).order("id").range(f, t),
    ),
  ]);
  if (balances.error) throw balances.error;
  if (recent.error) throw recent.error;
  return {
    installed: true,
    posted: Number(posted ?? 0),
    balances: (balances.data ?? []).map((r: Record<string, unknown>) => ({
      account_code: r.account_code as string,
      name: r.name as string,
      type: r.type as AccountBalanceRow["type"],
      period_debit: Number(r.period_debit),
      period_credit: Number(r.period_credit),
      closing_debit: Number(r.closing_debit),
      closing_credit: Number(r.closing_credit),
    })),
    recent: (recent.data ?? []).map((e) => ({
      id: e.id as string,
      entry_date: e.entry_date as string,
      source_type: e.source_type as string,
      memo: e.memo as string,
      lines: ((e.journal_lines ?? []) as { account_code: string; debit: number; credit: number }[]).map((l) => ({
        account_code: l.account_code,
        debit: Number(l.debit),
        credit: Number(l.credit),
      })),
    })),
    shelf: shelf.map((v) => ({ on_hand: Number(v.on_hand), avg_cost: Number(v.avg_cost) })),
  };
}
