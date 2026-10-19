"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RupiahInput } from "@/components/rupiah-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/core/money";
import { formatCount } from "@/core/number-format";
import { sumLines } from "@/core/purchasing";
import { shopPath } from "@/lib/routes";
import { createPurchaseOrder, saveSupplier, updatePurchaseOrder } from "./actions";

export interface FormVariant {
  id: string;
  title: string;
  unit: string;
  on_hand: number;
  avg_cost: number;
  supplier_costs: Record<string, number>;
}

interface Row {
  variant_id: string;
  qty: number;
  unit_cost: number | undefined;
}

const selectClass =
  "h-11 w-full rounded-md border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary md:text-sm";

/** New order or a draft being edited: supplier, products with qty and cost, live total. */
export function PurchaseForm({
  suppliers: initialSuppliers,
  variants,
  initial,
  poId,
}: {
  suppliers: { id: string; name: string }[];
  variants: FormVariant[];
  initial?: { supplier_id: string | null; lines: { variant_id: string; qty: number; unit_cost: number }[]; note: string };
  poId?: string;
}) {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierId, setSupplierId] = useState<string>(initial?.supplier_id ?? "");
  const [rows, setRows] = useState<Row[]>(initial?.lines ?? []);
  const [note, setNote] = useState(initial?.note ?? "");
  const [newSupplier, setNewSupplier] = useState<{ name: string; phone: string } | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const byId = new Map(variants.map((v) => [v.id, v]));
  const priceFor = (v: FormVariant, supplier: string) => v.supplier_costs[supplier] ?? v.avg_cost;
  const total = sumLines(rows.map((r) => ({ qty: r.qty, unit_cost: r.unit_cost ?? 0 })));
  const free = variants.filter((v) => !rows.some((r) => r.variant_id === v.id));

  function addVariant(id: string) {
    const v = byId.get(id);
    if (!v) return;
    setRows((prev) => [...prev, { variant_id: id, qty: 1, unit_cost: priceFor(v, supplierId) || undefined }]);
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function addSupplier() {
    if (!newSupplier?.name.trim()) return;
    setError(undefined);
    startTransition(async () => {
      const r = await saveSupplier(slug, null, newSupplier);
      if (r.error || !r.id) {
        setError(r.error ?? "Pemasok belum tersimpan.");
        return;
      }
      setSuppliers((prev) => [...prev, { id: r.id as string, name: newSupplier.name.trim() }].sort((a, b) => a.name.localeCompare(b.name, "id")));
      setSupplierId(r.id);
      setNewSupplier(null);
    });
  }

  function submit() {
    setError(undefined);
    const input = {
      supplier_id: supplierId || null,
      lines: rows.map((r) => ({ variant_id: r.variant_id, qty: r.qty, unit_cost: r.unit_cost ?? 0 })),
      note,
    };
    startTransition(async () => {
      const r = poId ? await updatePurchaseOrder(slug, poId, input) : await createPurchaseOrder(slug, input);
      if (r.error || !r.id) {
        setError(r.error ?? "Belum tersimpan.");
        return;
      }
      router.push(shopPath(slug, `stok/pembelian/${r.id}`));
    });
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="po-supplier">Pemasok</Label>
        {newSupplier ? (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="po-new-name" className="text-xs">
                Nama pemasok baru
              </Label>
              <Input id="po-new-name" value={newSupplier.name} onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })} autoFocus />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="po-new-phone" className="text-xs">
                No. WhatsApp (opsional)
              </Label>
              <Input id="po-new-phone" inputMode="tel" value={newSupplier.phone} onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={addSupplier} disabled={pending || !newSupplier.name.trim()}>
                Simpan
              </Button>
              <Button type="button" variant="ghost" onClick={() => setNewSupplier(null)}>
                Batal
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <select id="po-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={selectClass}>
              <option value="">Pilih nanti</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" className="shrink-0" onClick={() => setNewSupplier({ name: "", phone: "" })}>
              <Plus className="h-4 w-4" aria-hidden /> Pemasok baru
            </Button>
          </div>
        )}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-sm font-medium">Barang</legend>
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Belum ada barang. Pilih dari daftar di bawah.</p>}
        {rows.map((r, i) => {
          const v = byId.get(r.variant_id);
          return (
            <div key={r.variant_id} className="flex flex-col gap-2 rounded-xl border border-border p-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <p className="font-medium [overflow-wrap:anywhere]">{v?.title ?? "Produk"}</p>
                <p className="text-xs text-muted-foreground">
                  Stok sekarang {formatCount(v?.on_hand ?? 0)} {v?.unit ?? ""}
                </p>
              </div>
              <div className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[6rem_10rem_auto]">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`qty-${i}`} className="text-xs">
                    Jumlah ({v?.unit ?? "pcs"})
                  </Label>
                  <Input
                    id={`qty-${i}`}
                    inputMode="numeric"
                    value={String(r.qty)}
                    onChange={(e) => update(i, { qty: Number(e.target.value.replace(/\D/g, "").slice(0, 7) || 0) })}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`cost-${i}`} className="text-xs">
                    Modal / {v?.unit ?? "pcs"}
                  </Label>
                  <RupiahInput id={`cost-${i}`} value={r.unit_cost} onValueChange={(c) => update(i, { unit_cost: c })} />
                </div>
                <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={`Hapus ${v?.title ?? "barang"}`} onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          );
        })}
        {free.length > 0 && (
          <select
            aria-label="Tambah barang"
            value=""
            onChange={(e) => {
              addVariant(e.target.value);
              e.currentTarget.value = "";
            }}
            className={selectClass}
          >
            <option value="">+ Tambah barang…</option>
            {free.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title} (stok {formatCount(v.on_hand)})
              </option>
            ))}
          </select>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="po-note">Catatan untuk pemasok (opsional)</Label>
        <Input id="po-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: kirim sebelum Jumat" />
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Total pesanan <span className="block text-2xl font-semibold tabular-nums text-navy">{formatRupiah(total)}</span>
        </p>
        <Button type="submit" size="lg" disabled={pending || rows.length === 0 || rows.some((r) => r.qty < 1)}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {poId ? "Simpan perubahan" : "Simpan sebagai draf"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
