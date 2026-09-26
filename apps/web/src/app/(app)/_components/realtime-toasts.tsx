"use client";

import type { RealtimePaymentReceived } from "@wadar/contracts/payments";
import { formatRupiah } from "@wadar/core/money";
import { Volume2, VolumeX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTenantEvent } from "../../../lib/realtime";
import { isTtsEnabled, setTtsEnabled, speak } from "../../../lib/tts";

interface Toast {
  id: string;
  text: string;
}

/** App-wide "Uang masuk Rp50.000 dari QRIS" toast + voice (PRD F1.2), with the per-device sound toggle. */
export function RealtimeToasts() {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sound, setSound] = useState(true);

  useEffect(() => setSound(isTtsEnabled()), []);

  useTenantEvent<RealtimePaymentReceived>("payment.received", (payment) => {
    const text = `Uang masuk ${formatRupiah(payment.amount)} dari ${payment.source}`;
    setToasts((current) => [...current.slice(-2), { id: payment.paymentId, text }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== payment.paymentId)), 6_000);
    speak(payment.speech);
    router.refresh();
  });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTtsEnabled(!sound);
          setSound(!sound);
        }}
        aria-label={sound ? "Matikan suara uang masuk" : "Nyalakan suara uang masuk"}
        aria-pressed={sound}
        className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
      >
        {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
      </button>
      <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 top-20 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div key={toast.id} role="status" className="rounded-xl bg-emerald-600 px-5 py-3 text-base font-semibold text-white shadow-lg">
            {toast.text}
          </div>
        ))}
      </div>
    </>
  );
}
