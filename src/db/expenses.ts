import "server-only";
import type { ExpenseRow } from "@/core/expense";
import type { PeriodWindow } from "@/core/period";
import { createClient } from "@/lib/supabase/server";
import { fetchAllRows } from "./paginate";

/** Expenses in a window, newest first, voided ones included (shown struck through). */
export async function listExpenses(tenantId: string, window: PeriodWindow): Promise<ExpenseRow[]> {
  const supabase = await createClient();
  const rows = await fetchAllRows<ExpenseRow>((from, to) =>
    supabase
      .from("expenses")
      .select("id, category, amount, occurred_at, note, voided_at")
      .eq("tenant_id", tenantId)
      .gte("occurred_at", window.from)
      .lte("occurred_at", window.to)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to),
  );
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}
