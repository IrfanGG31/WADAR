"use client";

import { CheckCircle2, Clock, QrCode, RefreshCw, Volume2, VolumeX } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { RupiahInput } from "@/components/rupiah-input";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/core/money";
import { paymentAnnouncement, qrisDemoPayload } from "@/core/qris";
import { cn } from "@/lib/utils";

const SOURCES = ["BCA", "Mandiri", "BRI", "BNI", "GoPay", "OVO", "DANA", "ShopeePay"];

interface Paid {
  ref: string;
  amount: number;
  source: string;
  at: Date;
}

function newRef() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return `TX${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "id-ID";
  u.rate = 0.95;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("id"));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

type Phase = "idle" | "waiting" | "paid";

export function QrisSimulator({ shopName }: { shopName: string }) {
  const [amount, setAmount] = useState(15000);
  const [ref, setRef] = useState("");
  const [qr, setQr] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [sound, setSound] = useState(true);
  const [log, setLog] = useState<Paid[]>([]);
  const timer = useRef<number | undefined>(undefined);

  const regenerate = useCallback(() => {
    window.clearTimeout(timer.current);
    setRef(newRef());
    setPhase("idle");
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(regenerate);
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer.current);
    };
  }, [regenerate]);

  useEffect(() => {
    if (!ref) return;
    let alive = true;
    QRCode.toDataURL(qrisDemoPayload({ merchantName: shopName, city: "Indonesia", amount, reference: ref }), {
      width: 480,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#082a5c", light: "#ffffff" },
    }).then((url) => alive && setQr(url));
    return () => {
      alive = false;
    };
  }, [ref, amount, shopName]);

  const wait = () => {
    if (amount <= 0) return;
    setPhase("waiting");
    const delay = 2500 + Math.floor(Math.random() * 3000);
    timer.current = window.setTimeout(() => {
      const source = SOURCES[Math.floor(Math.random() * SOURCES.length)];
      setLog((l) => [{ ref, amount, source, at: new Date() }, ...l].slice(0, 12));
      setPhase("paid");
      if (sound) speak(paymentAnnouncement(amount, source));
      timer.current = window.setTimeout(regenerate, 3500);
    }, delay);
  };

  const total = log.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border p-5">
        <div className="flex w-full items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="qris-amount" className="text-sm font-medium">
              Total belanja
            </label>
            <RupiahInput id="qris-amount" value={amount} onValueChange={(v) => setAmount(v ?? 0)} disabled={phase === "waiting"} />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11"
            onClick={() => setSound((s) => !s)}
            aria-pressed={sound}
            aria-label={sound ? "Matikan suara" : "Nyalakan suara"}
          >
            {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
        </div>

        <div
          className={cn(
            "relative flex h-64 w-64 items-center justify-center overflow-hidden rounded-2xl border-2 bg-white transition-all",
            phase === "paid" ? "paid-flash border-success" : phase === "waiting" ? "border-primary shadow-lg shadow-primary/20" : "border-border",
          )}
        >
          {phase === "paid" ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="h-16 w-16 text-success" aria-hidden />
              <p className="font-semibold text-success">Pembayaran diterima</p>
              <p className="text-sm text-muted-foreground">
                {formatRupiah(log[0]?.amount ?? 0)} · {log[0]?.source}
              </p>
            </div>
          ) : qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- a generated data: URL, nothing to optimize
            <img src={qr} alt={`QRIS ${formatRupiah(amount)}`} className="h-full w-full" />
          ) : (
            <QrCode className="h-16 w-16 text-muted" aria-hidden />
          )}
          {phase === "waiting" && (
            <span className="absolute bottom-2 flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white" /> Menunggu pembayaran…
            </span>
          )}
        </div>
        <p className="text-center text-sm">
          <span className="font-display text-2xl font-extrabold text-navy">{formatRupiah(amount)}</span>
          <br />
          <span className="font-mono text-xs text-muted-foreground">{ref || "—"}</span>
        </p>
        <div className="flex w-full gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={regenerate} disabled={phase === "waiting"}>
            <RefreshCw className="h-4 w-4" /> QR baru
          </Button>
          <Button type="button" className="flex-1" onClick={wait} disabled={phase !== "idle" || amount <= 0}>
            <QrCode className="h-4 w-4" /> {phase === "waiting" ? "Menunggu…" : "Simulasikan bayar"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-navy">Pembayaran masuk</h2>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{log.length}</span>
        </div>
        {log.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Clock className="h-8 w-8" aria-hidden />
            Belum ada. Klik &quot;Simulasikan bayar&quot;; 3–5 detik kemudian HP berbunyi.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {log.map((p, i) => (
              <li key={p.ref + i} className={cn("flex items-center justify-between rounded-xl px-3 py-2.5", i === 0 ? "bg-success/10" : "bg-surface")}>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className={cn("h-4 w-4", i === 0 ? "text-success" : "text-muted-foreground")} aria-hidden />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{p.source}</span>
                    <span className="text-xs text-muted-foreground">{p.at.toLocaleTimeString("id-ID")}</span>
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{formatRupiah(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {log.length > 0 && (
          <p className="mt-auto flex items-center justify-between border-t border-border pt-3 text-sm">
            <span className="text-muted-foreground">Total via QRIS</span>
            <span className="font-display text-lg font-extrabold text-primary">{formatRupiah(total)}</span>
          </p>
        )}
        <details className="rounded-xl bg-surface p-3 text-sm">
          <summary className="cursor-pointer font-medium text-navy">Cara kerjanya nanti</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
            <li>Kasir membuat QR dengan nominal dan nomor transaksi unik (format QRIS EMVCo, seperti di demo ini).</li>
            <li>Mitra pembayaran mengirim notifikasi ke WADAR saat pembeli membayar.</li>
            <li>Penjualan tercatat lunas, stok berkurang, dan HP kasir mengumumkan pembayaran — tanpa cek mutasi.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
