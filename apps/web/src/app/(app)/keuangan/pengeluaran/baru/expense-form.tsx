"use client";

import { EXPENSE_CATEGORY_LABEL, type CategorySuggestion, type ExpenseCategory, type WalletView } from "@wadar/contracts/finance";
import { formatRupiah } from "@wadar/core/money";
import { Button, Input, Label } from "@wadar/ui-web";
import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { RupiahInput } from "../../../../../components/rupiah-input";
import { apiFetch } from "../../../../../lib/api-client";
import { errorMessage } from "../../../../../lib/errors";

const CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABEL) as Array<[ExpenseCategory, string]>;

/** PRD F2.2: nominal, catatan (kategori ditebak), dompet — 3 fields, category confirmed with one tap. */
export function ExpenseForm({ wallets }: { wallets: WalletView[] }) {
  const router = useRouter();
  const [amount, setAmount] = useState<number | undefined>();
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("exp_other");
  const [touchedCategory, setTouchedCategory] = useState(false);
  const [walletId, setWalletId] = useState(wallets.find((w) => w.defaultFor === "cash")?.id ?? wallets[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const amountRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (touchedCategory || note.trim().length < 3) return;
    const timer = setTimeout(async () => {
      try {
        const suggestion = await apiFetch<CategorySuggestion>(`/v1/finance/expense-category-suggestion?note=${encodeURIComponent(note)}`);
        setCategory(suggestion.category);
      } catch {
        // a suggestion is a nicety; the user can still pick
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [note, touchedCategory]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!amount) {
      setError("Isi nominalnya dulu.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await apiFetch("/v1/finance/expenses", {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
        body: { amount, category, walletId, note: note.trim() || undefined },
      });
      setSaved(`${formatRupiah(amount)} — ${EXPENSE_CATEGORY_LABEL[category]}`);
      setAmount(undefined);
      setNote("");
      setTouchedCategory(false);
      setCategory("exp_other");
      router.refresh();
      amountRef.current?.focus();
    } catch (err) {
      setError(errorMessage(err, "Gagal menyimpan pengeluaran."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
      {saved && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4" /> Tercatat: {saved}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="amount">Nominal</Label>
        <RupiahInput id="amount" ref={amountRef} value={amount} onValueChange={setAmount} autoFocus className="h-12 text-lg" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="note">Untuk apa?</Label>
        <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. token listrik, plastik, gaji Rina" />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Kategori</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={category === key}
              onClick={() => {
                setCategory(key);
                setTouchedCategory(true);
              }}
              className={`rounded-full border px-3 py-1.5 text-sm ${category === key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor="wallet">Dibayar dari</Label>
        <select id="wallet" value={walletId} onChange={(e) => setWalletId(e.target.value)} className="h-10 rounded-md border border-border bg-background px-3 text-base md:text-sm">
          {wallets.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} ({formatRupiah(w.balance)})
            </option>
          ))}
        </select>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" disabled={saving}>
        {saving ? "Menyimpan..." : "Simpan pengeluaran"}
      </Button>
    </form>
  );
}
