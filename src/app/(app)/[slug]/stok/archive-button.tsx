"use client";

import { Archive, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { archiveProduct } from "./actions";

export function ArchiveButton({ slug, productId }: { slug: string; productId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="ghost"
        className="text-destructive"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Arsipkan produk ini? Produk hilang dari kasir dan daftar stok, riwayat penjualan tetap ada.")) return;
          startTransition(async () => {
            const result = await archiveProduct(slug, productId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
        Arsipkan produk
      </Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
