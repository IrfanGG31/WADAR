"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resetDemoShop } from "./actions";

/** Hidden behind `?reset-demo=1`: puts the demo shop back to its seed data before the next run-through. */
export function ResetDemo({ slug }: { slug: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-dashed border-warning/60 p-4">
      <h2 className="text-lg font-semibold">Reset data demo</h2>
      <p className="text-sm text-muted-foreground">
        Mengembalikan toko contoh ke kondisi awal (90 hari data, cerita demo). Penjualan, stok, dan percakapan yang kamu tambahkan setelahnya
        diarsipkan, bukan dihapus.
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Kembalikan toko demo ke data awal?")) return;
          setError(undefined);
          startTransition(async () => {
            // On success the action redirects to Beranda; it only returns when something went wrong.
            const result = await resetDemoShop(slug);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        {pending ? "Mengatur ulang…" : "Reset ke data awal"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
