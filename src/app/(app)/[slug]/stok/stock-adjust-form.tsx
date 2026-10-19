"use client";

import { ClipboardCheck, Loader2, PackageMinus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADJUST_REASON_KEYS, ADJUST_REASONS, type AdjustReason, signedAdjustQty } from "@/core/audit";
import { formatCount } from "@/core/number-format";
import { cn } from "@/lib/utils";
import { adjustStock, countStock } from "./actions";

export interface AdjustVariant {
  id: string;
  label: string;
  unit: string;
  onHand: number;
}

type Mode = "adjust" | "opname";

/**
 * STK-0b: everything that changes stock besides a sale or a purchase — damaged, lost, expired,
 * returned to the supplier, found, corrected — plus a physical count (opname). Each one is a
 * stock movement with a reason and lands in Riwayat aktivitas.
 */
export function StockAdjustForm({ variants }: { variants: AdjustVariant[] }) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [mode, setMode] = useState<Mode>("adjust");
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const [reason, setReason] = useState<AdjustReason>("rusak");
  const [qtyText, setQtyText] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string }>();
  const [pending, startTransition] = useTransition();

  if (!variant) return null;
  const qty = qtyText.trim() === "" ? NaN : Number(qtyText.replace(/[^\d-]/g, ""));
  const valid = Number.isInteger(qty) && (mode === "opname" ? qty >= 0 : qty !== 0);
  const after = !valid ? null : mode === "opname" ? qty : variant.onHand + signedAdjustQty(reason, qty);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || !variant) return;
    setMessage(undefined);
    startTransition(async () => {
      const result =
        mode === "opname"
          ? await countStock(slug, { variant_id: variant.id, counted: qty, note })
          : await adjustStock(slug, { variant_id: variant.id, reason, qty, note });
      if (result.error) return setMessage({ ok: false, text: result.error });
      const tail = mode === "opname" && result.diff === 0 ? " Cocok dengan catatan, tidak ada selisih." : "";
      setMessage({ ok: true, text: `Tercatat. Stok sekarang ${formatCount(result.onHand ?? 0)} ${variant.unit}.${tail}` });
      setQtyText("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {mode === "opname" ? <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden /> : <PackageMinus className="h-5 w-5 text-primary" aria-hidden />}
        {mode === "opname" ? "Stok opname" : "Penyesuaian stok"}
      </h2>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Jenis perubahan">
        {(
          [
            ["adjust", "Rusak / retur"],
            ["opname", "Opname"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => {
              setMode(m);
              setMessage(undefined);
            }}
            className={cn(
              "min-h-11 rounded-md border px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              mode === m ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {variants.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="adjust-variant">Varian</Label>
          <select
            id="adjust-variant"
            value={variant.id}
            onChange={(e) => setVariantId(e.target.value)}
            className="min-h-11 rounded-md border border-input bg-background px-3 text-sm"
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} · stok {formatCount(v.onHand)}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Stok tercatat sekarang: <span className="font-medium text-foreground tabular-nums">{formatCount(variant.onHand)} {variant.unit}</span>
      </p>
      {mode === "adjust" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Alasan</legend>
          <div className="flex flex-wrap gap-2">
            {ADJUST_REASON_KEYS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={reason === r}
                onClick={() => setReason(r)}
                className={cn(
                  "min-h-11 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  reason === r ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                )}
              >
                {ADJUST_REASONS[r].label}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="adjust-qty">
            {mode === "opname"
              ? `Hasil hitung (${variant.unit})`
              : ADJUST_REASONS[reason].sign === 0
                ? `Jumlah (+ tambah, − kurangi)`
                : ADJUST_REASONS[reason].sign < 0
                  ? `Jumlah berkurang (${variant.unit})`
                  : `Jumlah bertambah (${variant.unit})`}
          </Label>
          <Input
            id="adjust-qty"
            inputMode={mode === "adjust" && ADJUST_REASONS[reason].sign === 0 ? "text" : "numeric"}
            value={qtyText}
            onChange={(e) => setQtyText(e.target.value)}
            placeholder={mode === "opname" ? String(variant.onHand) : "0"}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="adjust-note">Catatan (opsional)</Label>
          <Input
            id="adjust-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder={mode === "opname" ? "mis. Opname akhir bulan" : "mis. Botol pecah saat bongkar"}
          />
        </div>
      </div>
      {after !== null && (
        <p className={cn("text-sm", after < 0 ? "text-destructive" : "text-muted-foreground")}>
          Stok jadi <span className="font-medium tabular-nums">{formatCount(after)} {variant.unit}</span>
          {mode === "opname" && after !== variant.onHand && ` (selisih ${after > variant.onHand ? "+" : "−"}${formatCount(Math.abs(after - variant.onHand))})`}
          {after < 0 && " — lebih kecil dari nol, cek lagi jumlahnya."}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending || !valid}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {mode === "opname" ? "Simpan hasil hitung" : "Catat penyesuaian"}
      </Button>
      {message && (
        <p role="status" className={cn("text-sm", message.ok ? "text-emerald-700" : "text-destructive")}>
          {message.text}
        </p>
      )}
    </form>
  );
}
