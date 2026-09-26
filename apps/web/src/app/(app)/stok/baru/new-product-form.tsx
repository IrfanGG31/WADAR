"use client";

import { CreateProductBody } from "@wadar/contracts/catalog";
import { Button, Card, CardContent, Input, Label } from "@wadar/ui-web";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { RupiahInput } from "../../../../components/rupiah-input";
import { apiFetch } from "../../../../lib/api-client";
import { errorMessage } from "../../../../lib/errors";

interface VariantDraft {
  key: number;
  name: string;
  price: number | undefined;
  cost: number | undefined;
  stock: string;
  sku: string;
  barcode: string;
}

let nextKey = 1;
const emptyVariant = (): VariantDraft => ({ key: nextKey++, name: "", price: undefined, cost: undefined, stock: "", sku: "", barcode: "" });

export function NewProductForm({ outletId }: { outletId: string }) {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState<VariantDraft[]>([emptyVariant()]);
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<{ productId: string; name: string }>();

  function update(key: number, patch: Partial<VariantDraft>) {
    setVariants((current) => current.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    const parsed = CreateProductBody.safeParse({
      name,
      category: category || undefined,
      outletId,
      variants: variants.map((v) => ({
        name: hasVariants ? v.name : "",
        price: v.price ?? Number.NaN,
        cost: v.cost,
        initialStock: v.stock === "" ? undefined : Number(v.stock),
        sku: v.sku || undefined,
        barcode: v.barcode || undefined,
      })),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = String(issue?.path.at(-1) ?? "");
      setError(field === "price" ? "Harga jual wajib diisi." : (issue?.message ?? "Data belum lengkap."));
      return;
    }
    if (hasVariants && variants.some((v) => !v.name.trim())) {
      setError("Isi nama setiap varian (mis. M, L, Merah).");
      return;
    }
    setSaving(true);
    try {
      const result = await apiFetch<{ productId: string }>("/v1/products", {
        method: "POST",
        body: parsed.data,
        idempotencyKey: crypto.randomUUID(),
      });
      setSaved({ productId: result.productId, name });
      setName("");
      setCategory("");
      setHasVariants(false);
      setVariants([emptyVariant()]);
      router.refresh();
      nameRef.current?.focus();
    } catch (err) {
      setError(errorMessage(err, "Gagal menyimpan produk."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
      {saved && (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">&quot;{saved.name}&quot; tersimpan.</p>
            <p>
              Tambah produk berikutnya di bawah, atau{" "}
              <Link href={`/stok/${saved.productId}`} className="font-medium underline">
                lihat produknya
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nama produk</Label>
        <Input id="name" ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Serum Vit C 20ml" autoFocus required />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={hasVariants} onChange={(e) => setHasVariants(e.target.checked)} className="h-4 w-4" />
        Produk ini punya varian (ukuran, warna, dll.)
      </label>

      {variants.map((variant, index) => (
        <Card key={variant.key}>
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
            {hasVariants && (
              <div className="flex items-end gap-2 sm:col-span-2">
                <div className="flex flex-1 flex-col gap-2">
                  <Label htmlFor={`vname-${variant.key}`}>Nama varian</Label>
                  <Input id={`vname-${variant.key}`} value={variant.name} onChange={(e) => update(variant.key, { name: e.target.value })} placeholder="M / Merah / 50ml" />
                </div>
                {variants.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" aria-label={`Hapus varian ${index + 1}`} onClick={() => setVariants((c) => c.filter((v) => v.key !== variant.key))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor={`price-${variant.key}`}>Harga jual</Label>
              <RupiahInput id={`price-${variant.key}`} value={variant.price} onValueChange={(price) => update(variant.key, { price })} placeholder="0" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`cost-${variant.key}`}>
                Modal / HPP <span className="font-normal text-muted-foreground">(untuk hitung untung)</span>
              </Label>
              <RupiahInput id={`cost-${variant.key}`} value={variant.cost} onValueChange={(cost) => update(variant.key, { cost })} placeholder="0" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`stock-${variant.key}`}>Stok awal</Label>
              <Input id={`stock-${variant.key}`} inputMode="numeric" value={variant.stock} onChange={(e) => update(variant.key, { stock: e.target.value.replace(/\D/g, "") })} placeholder="0" />
            </div>
            {showMore && (
              <>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`sku-${variant.key}`}>SKU</Label>
                  <Input id={`sku-${variant.key}`} value={variant.sku} onChange={(e) => update(variant.key, { sku: e.target.value })} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`barcode-${variant.key}`}>Barcode</Label>
                  <Input id={`barcode-${variant.key}`} inputMode="numeric" value={variant.barcode} onChange={(e) => update(variant.key, { barcode: e.target.value })} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ))}

      {hasVariants && (
        <Button type="button" variant="outline" onClick={() => setVariants((c) => [...c, emptyVariant()])} className="self-start">
          <Plus className="mr-2 h-4 w-4" /> Tambah varian
        </Button>
      )}

      {showMore ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="category">Kategori</Label>
          <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Skincare" />
        </div>
      ) : (
        <button type="button" onClick={() => setShowMore(true)} className="self-start text-sm font-medium text-primary underline">
          + Kategori, SKU &amp; barcode
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={saving || !name.trim()}>
        {saving ? "Menyimpan..." : "Simpan produk"}
      </Button>
    </form>
  );
}
