"use server";

import { revalidatePath } from "next/cache";
import { ExpenseInput, expenseDateProblem } from "@/core/expense";
import { isoDateInZone } from "@/core/period";
import { permissionDenied } from "@/db/access";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";

export interface ExpenseActionResult {
  error?: string;
}

/** FIN-1: record one operating expense (owner). Same idempotency key twice = one row. */
export async function addExpense(slug: string, input: unknown): Promise<ExpenseActionResult> {
  const parsed = ExpenseInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum lengkap." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "finance");
  if (denied) return { error: denied };
  const dateProblem = expenseDateProblem(parsed.data.occurred_on, isoDateInZone(new Date(), shop.timezone));
  if (dateProblem) return { error: dateProblem };

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    tenant_id: shop.id,
    category: parsed.data.category,
    amount: parsed.data.amount,
    occurred_at: parsed.data.occurred_on,
    note: parsed.data.note || null,
    idempotency_key: parsed.data.idempotency_key,
  });
  if (error && error.code !== "23505") return { error: "Pengeluaran belum tercatat. Coba lagi sebentar." };
  revalidatePath(shopPath(slug, "keuangan"), "layout");
  return {};
}

/** Expenses are never edited or deleted; a wrong one is voided (owner) and stays visible, struck through. */
export async function voidExpense(slug: string, expenseId: string, reason: string): Promise<ExpenseActionResult> {
  if (!/^[0-9a-f-]{36}$/i.test(expenseId)) return { error: "Pengeluaran tidak ditemukan." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "finance");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_expense", { p_expense_id: expenseId, p_reason: reason.trim().slice(0, 200) || null });
  if (error) return { error: error.code === "42501" ? "Hanya pemilik yang bisa membatalkan pengeluaran." : "Belum bisa dibatalkan. Coba lagi sebentar." };
  revalidatePath(shopPath(slug, "keuangan"), "layout");
  return {};
}
