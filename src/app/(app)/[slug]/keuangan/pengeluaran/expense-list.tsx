"use client";

import { Ban } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ExpenseRow } from "@/core/expense";
import { formatRupiah } from "@/core/money";
import { formatIsoDate } from "@/lib/format-date";
import { voidExpense } from "./actions";

/** Newest first; a voided expense stays listed, struck through, and no longer counts. */
export function ExpenseList({ rows }: { rows: ExpenseRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
        Belum ada pengeluaran 30 hari terakhir. Catat sewa, gaji, iklan, atau ongkir supaya untung bersih akurat.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {rows.map((r) => (
        <ExpenseItem key={r.id} row={r} />
      ))}
    </ul>
  );
}

function ExpenseItem({ row }: { row: ExpenseRow }) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const voided = row.voided_at !== null;

  return (
    <li className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className={voided ? "min-w-0 text-muted-foreground line-through" : "min-w-0"}>
          <p className="font-medium">{row.category}</p>
          <p className="text-sm text-muted-foreground">
            {formatIsoDate(row.occurred_at)}
            {row.note ? ` · ${row.note}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={voided ? "tabular-nums text-muted-foreground line-through" : "font-semibold tabular-nums"}>
            {formatRupiah(row.amount)}
          </span>
          {!voided && !asking && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(true)} aria-label={`Batalkan ${row.category}`}>
              <Ban className="h-4 w-4" aria-hidden />
            </Button>
          )}
        </div>
      </div>
      {voided && <p className="text-xs text-muted-foreground">Dibatalkan, tidak dihitung.</p>}
      {asking && (
        <div className="flex flex-col gap-2 rounded-lg bg-muted p-3 sm:flex-row sm:items-center">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan (mis. salah nominal)" maxLength={200} />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await voidExpense(slug, row.id, reason);
                  if (result.error) return setError(result.error);
                  setAsking(false);
                  router.refresh();
                })
              }
            >
              Batalkan
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
              Tidak jadi
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </li>
  );
}
