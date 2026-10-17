"use client";

import { Loader2, PackagePlus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { RupiahInput } from "@/components/rupiah-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/core/money";
import { formatCount } from "@/core/number-format";
import { stockIn } from "./actions";

export interface StockInVariant {
  id: string;
  label: string;
  unit: string;
  avgCost: number;
  costIsSet: boolean;
  packSize: number;
}

/** Stok masuk (STK-0): qty + unit cost per batch; HPP becomes the weighted average. */
export function StockInForm({ variants }: { variants: StockInVariant[] }) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const [qty, setQty] = useState(variant?.packSize ?? 1);
  const [unitCost, setUnitCost] = useState<number | undefined>(variant?.costIsSet ? variant.avgCost : undefined);
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();

  if (!variant) return null;

  function pick(id: string) {
    const next = variants.find((v) => v.id === id);
    setVariantId(id);
    if (next) {
      setQty(next.packSize);
      setUnitCost(next.costIsSet ? next.avgCost : undefined);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(undefined);
    startTransition(async () => {
      const result = await stockIn(slug, { variant_id: variant.id, qty, unit_cost: unitCost });
      if (result.error) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      setMessage({
        ok: true,
        text: `Tercatat. Stok sekarang ${formatCount(result.onHand ?? 0)} ${variant.unit}, HPP rata-rata ${formatRupiah(result.avgCost ?? 0)}.`,
      });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <PackagePlus className="h-5 w-5 text-primary" aria-hidden />
        Stok masuk
      </h2>
      {variants.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stock-in-variant">Varian</Label>
          <select
            id="stock-in-variant"
            value={variant.id}
            onChange={(e) => pick(e.target.value)}
            className="h-11 rounded-md border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary md:text-sm"
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stock-in-qty">Jumlah ({variant.unit})</Label>
          <Input
            id="stock-in-qty"
            inputMode="numeric"
            value={String(qty)}
            onChange={(e) => setQty(Number(e.target.value.replace(/\D/g, "").slice(0, 7) || 0))}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="stock-in-cost">Modal per {variant.unit}</Label>
          <RupiahInput id="stock-in-cost" value={unitCost} onValueChange={setUnitCost} required />
        </div>
      </div>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-emerald-700" : "text-sm text-red-800"}>
          {message.text}
        </p>
      )}
      <Button type="submit" variant="outline" disabled={pending || qty < 1}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Catat stok masuk
      </Button>
    </form>
  );
}
