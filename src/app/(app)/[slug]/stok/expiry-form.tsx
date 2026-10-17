"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setVariantExpiry } from "./actions";

export interface ExpiryFormVariant {
  id: string;
  label: string;
  expiresOn: string | null;
}

/** Tanggal kedaluwarsa per varian (STK-5): optional; the Stok screens warn 30 days ahead. */
export function ExpiryForm({ slug, variants }: { slug: string; variants: ExpiryFormVariant[] }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border p-4" aria-labelledby="kedaluwarsa-title">
      <div className="flex flex-col gap-1">
        <h2 id="kedaluwarsa-title" className="text-lg font-semibold">Tanggal kedaluwarsa</h2>
        <p className="text-sm text-muted-foreground">
          Opsional. Isi tanggal terdekat dari stok yang ada sekarang; menu Stok akan mengingatkan 30 hari sebelumnya.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {variants.map((v) => (
          <ExpiryRow key={v.id} slug={slug} variant={v} />
        ))}
      </ul>
    </section>
  );
}

function ExpiryRow({ slug, variant }: { slug: string; variant: ExpiryFormVariant }) {
  const router = useRouter();
  const [value, setValue] = useState(variant.expiresOn ?? "");
  // A stock-in on the same page can change the saved date: follow it after the refresh.
  const [shown, setShown] = useState(variant.expiresOn);
  if (shown !== variant.expiresOn) {
    setShown(variant.expiresOn);
    setValue(variant.expiresOn ?? "");
  }
  const [message, setMessage] = useState<{ error?: string; ok?: string }>();
  const [pending, startTransition] = useTransition();
  const id = `exp-${variant.id}`;

  const save = (next: string | null) => {
    setMessage(undefined);
    startTransition(async () => {
      const result = await setVariantExpiry(slug, variant.id, next);
      if (result.error) {
        setMessage({ error: result.error });
        return;
      }
      setValue(next ?? "");
      setMessage({ ok: next ? "Tersimpan." : "Tanggal dihapus." });
      router.refresh();
    });
  };

  return (
    <li className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{variant.label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input id={id} type="date" value={value} onChange={(e) => setValue(e.target.value)} className="w-auto" />
        <Button type="button" variant="outline" onClick={() => save(value || null)} disabled={pending || value === (variant.expiresOn ?? "")}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Simpan
        </Button>
        {variant.expiresOn && (
          <Button type="button" variant="ghost" onClick={() => save(null)} disabled={pending}>
            Hapus tanggal
          </Button>
        )}
      </div>
      {message?.error && <p role="alert" className="text-sm text-red-800">{message.error}</p>}
      {message?.ok && <p role="status" className="text-sm text-muted-foreground">{message.ok}</p>}
    </li>
  );
}
