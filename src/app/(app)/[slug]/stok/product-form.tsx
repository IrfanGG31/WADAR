"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState, useTransition } from "react";
import { RupiahInput } from "@/components/rupiah-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveProduct } from "./actions";
import { newVariant, type ProductDraft, type VariantDraft } from "./product-draft";

function IntField({ id, label, value, onChange, hint }: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "").slice(0, 7) || 0))}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Create/edit a product with its variants (CAT-1). HPP must be entered; 0 means "belum diisi". */
export function ProductForm({ slug, productId, initial, categories }: {
  slug: string;
  productId: string | null;
  initial: ProductDraft;
  categories: string[];
}) {
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const setVariant = (key: string, patch: Partial<VariantDraft>) =>
    setDraft((d) => ({ ...d, variants: d.variants.map((v) => (v.key === key ? { ...v, ...patch } : v)) }));

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    const payload = {
      ...draft,
      variants: draft.variants.map((v) => ({
        id: v.id,
        option_label: v.option_label,
        sku: v.sku,
        price: v.price,
        cost: v.cost,
        min_stock: v.min_stock,
        lead_time_days: v.lead_time_days,
        pack_size: v.pack_size,
        ...(v.id ? {} : { initial_qty: v.initial_qty }),
      })),
    };
    startTransition(async () => {
      const result = await saveProduct(slug, productId, payload);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border border-border p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama produk</Label>
          <Input id="name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required maxLength={120} placeholder="Serum Vitamin C" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="category">Kategori</Label>
            <Input id="category" list="categories" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} maxLength={60} placeholder="Serum" />
            <datalist id="categories">
              {categories.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="unit">Satuan</Label>
            <Input id="unit" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} required maxLength={20} placeholder="pcs" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Deskripsi (dipakai Chat AI untuk menjawab pembeli)</Label>
          <textarea
            id="description"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            maxLength={1000}
            rows={3}
            className="rounded-md border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary md:text-sm"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Varian &amp; harga</h2>
        {draft.variants.map((v, index) => (
          <fieldset key={v.key} aria-label={`Varian ${index + 1}`} className="flex flex-col gap-4 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">Varian {index + 1}</span>
              {!v.id && draft.variants.length > 1 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDraft((d) => ({ ...d, variants: d.variants.filter((x) => x.key !== v.key) }))}>
                  <Trash2 className="h-4 w-4" />
                  Hapus
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${v.key}-label`}>Nama varian</Label>
                <Input id={`${v.key}-label`} value={v.option_label} onChange={(e) => setVariant(v.key, { option_label: e.target.value })} maxLength={60} placeholder="20 ml (boleh kosong)" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${v.key}-sku`}>SKU</Label>
                <Input id={`${v.key}-sku`} value={v.sku} onChange={(e) => setVariant(v.key, { sku: e.target.value })} maxLength={40} placeholder="Opsional" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${v.key}-price`}>Harga jual</Label>
                <RupiahInput id={`${v.key}-price`} value={v.price} onValueChange={(price) => setVariant(v.key, { price })} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${v.key}-cost`}>HPP (modal per {draft.unit || "pcs"})</Label>
                <RupiahInput id={`${v.key}-cost`} value={v.cost} onValueChange={(cost) => setVariant(v.key, { cost })} required />
                {v.cost === 0 && <p className="text-xs text-warning">HPP belum diisi: untung tidak bisa dihitung tepat.</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {v.id ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Stok sekarang</span>
                  <span className="flex h-11 items-center text-lg font-semibold tabular-nums">{v.on_hand ?? 0}</span>
                </div>
              ) : (
                <IntField id={`${v.key}-qty`} label="Stok awal" value={v.initial_qty} onChange={(initial_qty) => setVariant(v.key, { initial_qty })} />
              )}
              <IntField id={`${v.key}-min`} label="Stok minimum" value={v.min_stock} onChange={(min_stock) => setVariant(v.key, { min_stock })} />
              <IntField id={`${v.key}-lead`} label="Waktu tunggu (hari)" value={v.lead_time_days} onChange={(lead_time_days) => setVariant(v.key, { lead_time_days })} hint="Lama barang datang dari pemasok" />
              <IntField id={`${v.key}-pack`} label="Kelipatan pesan" value={v.pack_size} onChange={(pack_size) => setVariant(v.key, { pack_size: Math.max(1, pack_size) })} hint="Isi per dus/pak" />
            </div>
          </fieldset>
        ))}
        <Button type="button" variant="outline" onClick={() => setDraft((d) => ({ ...d, variants: [...d.variants, newVariant(crypto.randomUUID())] }))} disabled={draft.variants.length >= 50}>
          <Plus className="h-4 w-4" />
          Tambah varian
        </Button>
      </section>

      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? "Menyimpan..." : "Simpan produk"}
      </Button>
    </form>
  );
}
