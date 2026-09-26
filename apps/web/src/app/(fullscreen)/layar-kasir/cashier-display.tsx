"use client";

import type { IncomingPaymentView, RealtimePaymentReceived } from "@wadar/contracts/payments";
import { formatTimeId } from "@wadar/core/date";
import { formatRupiah } from "@wadar/core/money";
import { ArrowLeft, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTenantEvent } from "../../../lib/realtime";
import { isTtsEnabled, setTtsEnabled, speak } from "../../../lib/tts";

/**
 * Mode "Layar Kasir" (PRD F1.5 — P0 since v1.1/R1): a screen facing the
 * counter that shows the last money in, big, and says it out loud.
 */
export function CashierDisplay({
  initial,
  storeName,
  outletName,
  timezone,
}: {
  initial: IncomingPaymentView[];
  storeName: string;
  outletName: string;
  timezone: string;
}) {
  const [payments, setPayments] = useState(initial);
  const [sound, setSound] = useState(true);
  const [flash, setFlash] = useState(false);
  const [clock, setClock] = useState<string>("");

  useEffect(() => {
    setSound(isTtsEnabled());
    const update = () => setClock(formatTimeId(new Date(), timezone));
    update();
    const timer = setInterval(update, 15_000);
    return () => clearInterval(timer);
  }, [timezone]);

  const { connected } = useTenantEvent<RealtimePaymentReceived>("payment.received", (payment) => {
    setPayments((current) =>
      [
        {
          id: payment.paymentId,
          amount: payment.amount,
          source: payment.source,
          method: "qris" as const,
          orderId: payment.orderId,
          orderNumber: null,
          reference: null,
          receivedAt: payment.receivedAt,
        },
        ...current.filter((p) => p.id !== payment.paymentId),
      ].slice(0, 6),
    );
    setFlash(true);
    setTimeout(() => setFlash(false), 4_000);
    speak(payment.speech);
  });

  const [latest, ...rest] = payments;

  return (
    <main className={`flex min-h-dvh flex-col transition-colors duration-700 ${flash ? "bg-emerald-600 text-white" : "bg-slate-950 text-white"}`}>
      <header className="flex items-center justify-between p-4 text-sm text-white/70">
        <Link href="/beranda" className="flex items-center gap-1 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> {storeName} · {outletName}
        </Link>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1" aria-live="polite">
            {connected ? <Wifi className="h-4 w-4 text-emerald-400" /> : <WifiOff className="h-4 w-4 text-amber-400" />}
            {connected ? "Tersambung" : "Menyambung…"}
          </span>
          <span className="tabular-nums">{clock}</span>
          <button
            type="button"
            onClick={() => {
              setTtsEnabled(!sound);
              setSound(!sound);
              if (!sound) speak("Suara uang masuk aktif");
            }}
            aria-pressed={sound}
            aria-label={sound ? "Matikan suara" : "Nyalakan suara"}
            className="rounded-full bg-white/10 p-2 hover:bg-white/20"
          >
            {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-xl font-medium text-white/80 md:text-2xl">{latest ? "Uang masuk terakhir" : "Belum ada uang masuk"}</p>
        {latest && (
          <>
            <p className="text-6xl font-extrabold tabular-nums tracking-tight md:text-8xl" aria-live="polite">
              {formatRupiah(latest.amount)}
            </p>
            <p className="text-2xl text-white/90 md:text-3xl">
              dari {latest.source} · {formatTimeId(latest.receivedAt, timezone)}
              {latest.orderNumber && ` · #${latest.orderNumber}`}
            </p>
          </>
        )}
      </section>

      {rest.length > 0 && (
        <ul className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-5">
          {rest.map((p) => (
            <li key={p.id} className="rounded-xl bg-white/10 p-3 text-center">
              <p className="text-lg font-bold tabular-nums">{formatRupiah(p.amount)}</p>
              <p className="text-xs text-white/70">
                {p.source} · {formatTimeId(p.receivedAt, timezone)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
