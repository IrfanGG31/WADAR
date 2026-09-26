"use client";

import { Button, Input, Label } from "@wadar/ui-web";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RupiahInput } from "../../../../components/rupiah-input";
import { apiFetch } from "../../../../lib/api-client";
import { errorMessage } from "../../../../lib/errors";

type Mode = "receive" | "set";

export function AdjustStockForm({
  variantId,
  outletId,
  outletName,
  currentOnHand,
}: {
  variantId: string;
  outletId: string;
  outletName: string;
  currentOnHand: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState<number | undefined>();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  if (mode === null) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setMode("receive")}>Barang masuk</Button>
        <Button size="sm" variant="outline" onClick={() => { setMode("set"); setQuantity(String(currentOnHand)); }}>
          Hitung ulang stok
        </Button>
      </div>
    );
  }

  async function save() {
    const qty = Number(quantity);
    if (quantity === "" || !Number.isInteger(qty) || (mode === "receive" && qty <= 0)) {
      setError(mode === "receive" ? "Isi jumlah barang yang masuk." : "Isi jumlah stok yang ada sekarang.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await apiFetch("/v1/stock/adjustments", {
        method: "POST",
        idempotencyKey: crypto.randomUUID(),
        body:
          mode === "receive"
            ? { mode, outletId, variantId, quantity: qty, unitCost, note: note || undefined }
            : { mode, outletId, variantId, quantity: qty, note: note || undefined },
      });
      setMode(null);
      setQuantity("");
      setUnitCost(undefined);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Gagal menyimpan stok."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
      <p className="text-sm font-medium sm:col-span-2">
        {mode === "receive" ? `Barang masuk ke ${outletName}` : `Stok sebenarnya di ${outletName} (sekarang tercatat ${currentOnHand})`}
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`q-${variantId}`}>{mode === "receive" ? "Jumlah masuk" : "Jumlah di rak"}</Label>
        <Input id={`q-${variantId}`} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d-]/g, ""))} autoFocus />
      </div>
      {mode === "receive" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`uc-${variantId}`}>Harga beli per barang</Label>
          <RupiahInput id={`uc-${variantId}`} value={unitCost} onValueChange={setUnitCost} placeholder="opsional" />
        </div>
      )}
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={`n-${variantId}`}>Catatan</Label>
        <Input id={`n-${variantId}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "set" ? "mis. 2 rusak" : "mis. dari Supplier A"} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
        <Button size="sm" variant="ghost" onClick={() => setMode(null)}>Batal</Button>
      </div>
    </div>
  );
}
