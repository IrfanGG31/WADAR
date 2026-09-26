"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "../../../lib/api-client";
import { errorMessage } from "../../../lib/errors";

export function VoidExpenseButton({ expenseId }: { expenseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function voidIt() {
    const reason = window.prompt("Batalkan pengeluaran ini? Tulis alasannya:");
    if (!reason || reason.trim().length < 3) return;
    setBusy(true);
    try {
      await apiFetch(`/v1/finance/expenses/${expenseId}/void`, { method: "POST", body: { reason: reason.trim() } });
      router.refresh();
    } catch (err) {
      window.alert(errorMessage(err, "Gagal membatalkan."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={voidIt} disabled={busy} aria-label="Batalkan pengeluaran" className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-destructive">
      <X className="h-4 w-4" />
    </button>
  );
}
