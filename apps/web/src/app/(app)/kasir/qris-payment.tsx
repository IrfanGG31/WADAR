"use client";

import type { PaymentIntentView, RealtimePaymentReceived } from "@wadar/contracts/payments";
import type { OrderView } from "@wadar/contracts/sales";
import { formatRupiah } from "@wadar/core/money";
import { Button } from "@wadar/ui-web";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { renderSVG } from "uqr";
import { apiFetch } from "../../../lib/api-client";
import { errorMessage } from "../../../lib/errors";
import { useTenantEvent } from "../../../lib/realtime";
import { speak } from "../../../lib/tts";

/**
 * QRIS at the counter (PRD F1.1, O2.2 acceptance: "kasir melihat status
 * LUNAS tanpa refresh"): realtime push first, 3-second polling as the
 * fallback when the stream is down (ARCHITECTURE §8).
 */
export function QrisPayment({ order, onPaid, onClose }: { order: OrderView; onPaid: (order: OrderView) => void; onClose: () => void }) {
  const [intent, setIntent] = useState<PaymentIntentView>();
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(() => Date.now());
  const [simulating, setSimulating] = useState(false);

  const createIntent = useCallback(async () => {
    setError(undefined);
    try {
      setIntent(
        await apiFetch<PaymentIntentView>("/v1/payments/qris", {
          method: "POST",
          body: { orderId: order.id },
          idempotencyKey: crypto.randomUUID(),
        }),
      );
    } catch (err) {
      setError(errorMessage(err, "QRIS belum bisa dibuat."));
    }
  }, [order.id]);

  useEffect(() => {
    void createIntent();
  }, [createIntent]);

  const finish = useCallback(async () => {
    const paid = await apiFetch<OrderView>(`/v1/orders/${order.id}`).catch(() => ({ ...order, paymentStatus: "paid" as const, paid: order.net }));
    onPaid(paid);
  }, [order, onPaid]);

  const { connected } = useTenantEvent<RealtimePaymentReceived>("payment.received", (payment) => {
    if (payment.orderId === order.id) void finish();
  });

  useEffect(() => {
    if (!intent || intent.status !== "pending") return;
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    const poll = setInterval(async () => {
      const latest = await apiFetch<PaymentIntentView>(`/v1/payments/intents/${intent.id}`).catch(() => undefined);
      if (!latest) return;
      setIntent(latest);
      if (latest.status === "paid") {
        speak(`Uang masuk, pesanan ${order.orderNumber} lunas`);
        void finish();
      }
    }, connected ? 10_000 : 3_000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [intent, connected, finish, order.orderNumber]);

  const svg = useMemo(() => (intent ? renderSVG(intent.qrString, { border: 2 }) : ""), [intent]);
  const secondsLeft = intent ? Math.max(0, Math.floor((new Date(intent.expiresAt).getTime() - now) / 1000)) : 0;
  const expired = intent?.status === "expired" || (intent !== undefined && secondsLeft === 0);

  return (
    <div role="dialog" aria-modal="true" aria-label="Bayar QRIS" className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <p className="text-sm text-muted-foreground">Pesanan #{order.orderNumber} · scan untuk bayar</p>
      <p className="text-4xl font-bold">{formatRupiah(order.net - order.paid)}</p>
      {intent ? (
        <div className="w-64 max-w-full rounded-xl border border-border bg-white p-2" aria-label="Kode QRIS" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        !error && <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
      )}
      {intent && !expired && (
        <p className="flex items-center gap-2 text-sm font-medium" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" /> Menunggu pembayaran… {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
        </p>
      )}
      {expired && <p className="text-sm font-medium text-destructive">QR sudah kedaluwarsa.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex w-full max-w-xs flex-col gap-2">
        {(expired || error) && <Button onClick={createIntent}>Buat QR baru</Button>}
        {intent?.simulated && !expired && (
          <Button
            variant="outline"
            disabled={simulating}
            onClick={async () => {
              setSimulating(true);
              await apiFetch(`/v1/payments/intents/${intent.id}/simulate-paid`, { method: "POST" }).catch((err) => setError(errorMessage(err)));
              setSimulating(false);
            }}
          >
            Simulasikan bayar (mode uji)
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Tutup — pesanan tetap tercatat belum lunas
        </Button>
      </div>
    </div>
  );
}
