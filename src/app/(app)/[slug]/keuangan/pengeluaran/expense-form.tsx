"use client";

import { Loader2, ReceiptText } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { RupiahInput } from "@/components/rupiah-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EXPENSE_CATEGORIES } from "@/core/expense";
import { formatRupiah } from "@/core/money";
import { cn } from "@/lib/utils";
import { addExpense } from "./actions";

function newKey() {
  return `exp-${crypto.randomUUID()}`;
}

/** FIN-1: nominal, kategori, tanggal (+ catatan opsional). */
export function ExpenseForm({ today }: { today: string }) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [amount, setAmount] = useState<number>();
  const [category, setCategory] = useState<string>("");
  const [custom, setCustom] = useState("");
  const [day, setDay] = useState(today);
  const [note, setNote] = useState("");
  const [key, setKey] = useState(newKey);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();
  const finalCategory = category === "__other" ? custom.trim() : category;

  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(undefined);
    startTransition(async () => {
      const result = await addExpense(slug, { amount, category: finalCategory, occurred_on: day, note, idempotency_key: key });
      if (result.error) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      setMessage({ ok: true, text: `Tercatat: ${finalCategory} ${formatRupiah(amount ?? 0)}.` });
      setAmount(undefined);
      setNote("");
      setKey(newKey());
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <ReceiptText className="h-5 w-5 text-primary" aria-hidden />
        Catat pengeluaran
      </h2>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="expense-amount">Nominal</Label>
        <RupiahInput id="expense-amount" value={amount} onValueChange={setAmount} placeholder="0" required />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">Kategori</legend>
        <div className="flex flex-wrap gap-2">
          {[...EXPENSE_CATEGORIES, "__other"].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                category === c ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
              )}
            >
              {c === "__other" ? "Kategori lain…" : c}
            </button>
          ))}
        </div>
        {category === "__other" && (
          <Input aria-label="Nama kategori" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="mis. Perbaikan alat" maxLength={40} />
        )}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expense-day">Tanggal</Label>
          <Input id="expense-day" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="expense-note">Catatan (opsional)</Label>
          <Input id="expense-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="mis. Iklan TikTok minggu ini" />
        </div>
      </div>
      <Button type="submit" size="lg" disabled={pending || !amount || !finalCategory}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Simpan pengeluaran
      </Button>
      {message && (
        <p role="status" className={cn("text-sm", message.ok ? "text-emerald-700" : "text-destructive")}>
          {message.text}
        </p>
      )}
    </form>
  );
}
