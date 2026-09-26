"use client";

import type { VariantView } from "@wadar/contracts/catalog";
import { Button, Input, Label } from "@wadar/ui-web";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RupiahInput } from "../../../../components/rupiah-input";
import { apiFetch } from "../../../../lib/api-client";
import { errorMessage } from "../../../../lib/errors";

export function EditVariantForm({ variant }: { variant: VariantView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState<number | undefined>(variant.price);
  const [cost, setCost] = useState<number | undefined>(variant.cost ?? undefined);
  const [sku, setSku] = useState(variant.sku ?? "");
  const [barcode, setBarcode] = useState(variant.barcode ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  if (!open) {
    return (
      <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        Ubah harga, modal, SKU
      </Button>
    );
  }

  async function save() {
    if (price === undefined) {
      setError("Harga jual wajib diisi.");
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await apiFetch(`/v1/variants/${variant.id}`, {
        method: "PATCH",
        body: { price, cost: cost ?? null, sku: sku.trim() || null, barcode: barcode.trim() || null },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Gagal menyimpan."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`p-${variant.id}`}>Harga jual</Label>
        <RupiahInput id={`p-${variant.id}`} value={price} onValueChange={setPrice} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`c-${variant.id}`}>Modal / HPP</Label>
        <RupiahInput id={`c-${variant.id}`} value={cost} onValueChange={setCost} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`s-${variant.id}`}>SKU</Label>
        <Input id={`s-${variant.id}`} value={sku} onChange={(e) => setSku(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`b-${variant.id}`}>Barcode</Label>
        <Input id={`b-${variant.id}`} inputMode="numeric" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "Menyimpan..." : "Simpan"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Batal
        </Button>
      </div>
    </div>
  );
}
