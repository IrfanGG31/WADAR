"use client";

import { Loader2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VOID_REASON_MAX } from "@/core/sale-void";
import { voidSale } from "../actions";

/** Batalkan transaksi (POS-5): two steps — open, then confirm with an optional reason. */
export function VoidSaleButton({ slug, saleId }: { slug: string; saleId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ error?: string; note?: string }>();
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    setMessage(undefined);
    startTransition(async () => {
      const result = await voidSale(slug, { sale_id: saleId, reason });
      setMessage(result);
      if (!result.error) {
        setOpen(false);
        router.refresh();
      }
    });
  };

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button type="button" variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={() => setOpen(true)}>
          <Undo2 className="h-3.5 w-3.5" />
          Batalkan
        </Button>
        {message?.note && <span className="text-xs text-muted-foreground">{message.note}</span>}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-sm">Batalkan transaksi ini? Stok dikembalikan dan transaksi tidak dihitung di laporan. Tidak bisa diurungkan.</p>
      <Input
        aria-label="Alasan pembatalan (opsional)"
        placeholder="Alasan (opsional), mis. salah input jumlah"
        value={reason}
        maxLength={VOID_REASON_MAX}
        onChange={(e) => setReason(e.target.value)}
        autoComplete="off"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={confirm}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Ya, batalkan transaksi
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setOpen(false)}>
          Tidak jadi
        </Button>
      </div>
      {message?.error && (
        <p role="alert" className="text-sm text-destructive">
          {message.error}
        </p>
      )}
    </div>
  );
}
