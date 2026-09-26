"use client";

import { Button, Input } from "@wadar/ui-web";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "../../../../lib/api-client";
import { errorMessage } from "../../../../lib/errors";

export function VoidOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} className="text-destructive">
        Batalkan pesanan
      </Button>
    );
  }

  async function confirm() {
    setBusy(true);
    setError(undefined);
    try {
      await apiFetch(`/v1/orders/${orderId}/void`, { method: "POST", body: { reason } });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Gagal membatalkan."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-destructive/30 p-4">
      <p className="text-sm font-medium">Batalkan pesanan ini? Stok dikembalikan dan pembukuan dikoreksi otomatis. Tercatat di riwayat.</p>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan, mis. salah input" aria-label="Alasan pembatalan" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button variant="destructive" size="sm" disabled={busy || reason.trim().length < 3} onClick={confirm}>
          {busy ? "Membatalkan..." : "Ya, batalkan"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Tidak jadi
        </Button>
      </div>
    </div>
  );
}
