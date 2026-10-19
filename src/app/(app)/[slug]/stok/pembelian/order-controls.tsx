"use client";

import { Loader2, MessageCircle, PackageCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RupiahInput } from "@/components/rupiah-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupiah } from "@/core/money";
import { formatCount } from "@/core/number-format";
import { PAYMENT_METHODS, sumLines, type PurchaseStatus } from "@/core/purchasing";
import { shopPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { cancelPurchaseOrder, orderPurchaseOrder, payPurchaseOrder, receivePurchaseOrder, type PurchaseActionResult } from "./actions";

type Message = { ok: boolean; text: string } | undefined;

function useRun() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();
  const [message, setMessage] = useState<Message>();
  const [pending, startTransition] = useTransition();
  const run = (fn: (slug: string) => Promise<PurchaseActionResult>, onOk?: () => void) => {
    setMessage(undefined);
    startTransition(async () => {
      const r = await fn(slug);
      setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: r.note ?? "Tersimpan." });
      if (!r.error) onOk?.();
      router.refresh();
    });
  };
  return { slug, message, pending, run };
}

function Feedback({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role={message.ok ? "status" : "alert"} className={cn("text-sm", message.ok ? "text-emerald-700" : "text-destructive")}>
      {message.text}
    </p>
  );
}

const newKey = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

/** Draft / ordered actions for the owner: approve, edit, cancel, and the WhatsApp message. */
export function OrderActions({
  id,
  status,
  canPurchase,
  whatsappHref,
}: {
  id: string;
  status: PurchaseStatus;
  canPurchase: boolean;
  whatsappHref: string | null;
}) {
  const { slug, message, pending, run } = useRun();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && canPurchase && (
          <>
            <Button type="button" disabled={pending} onClick={() => run((s) => orderPurchaseOrder(s, id))}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Setujui & pesan
            </Button>
            <Button asChild variant="outline">
              <Link href={shopPath(slug, `stok/pembelian/${id}/ubah`)}>Ubah</Link>
            </Button>
          </>
        )}
        {(status === "ordered" || status === "partial") && whatsappHref && (
          <Button asChild variant={status === "ordered" ? "default" : "outline"}>
            <a href={whatsappHref} target="_blank" rel="noreferrer">
              <MessageCircle className="h-4 w-4" aria-hidden /> Kirim ke pemasok
            </a>
          </Button>
        )}
        {(status === "draft" || status === "ordered") && canPurchase && (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => run((s) => cancelPurchaseOrder(s, id))}>
            Batalkan
          </Button>
        )}
      </div>
      <Feedback message={message} />
    </div>
  );
}

export interface ReceiveLine {
  variant_id: string;
  title: string;
  unit: string;
  remaining: number;
  unit_cost: number;
}

/** Terima barang: what arrived (default: everything still expected) at the invoice price. */
export function ReceiveForm({ id, lines }: { id: string; lines: ReceiveLine[] }) {
  const { message, pending, run } = useRun();
  const [rows, setRows] = useState(() => lines.map((l) => ({ ...l, qty: l.remaining, cost: l.unit_cost as number | undefined })));
  const [key, setKey] = useState(() => newKey("rcv"));
  const value = sumLines(rows.map((r) => ({ qty: r.qty, unit_cost: r.cost ?? 0 })));

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          (s) => receivePurchaseOrder(s, id, { lines: rows.map((r) => ({ variant_id: r.variant_id, qty: r.qty, unit_cost: r.cost ?? 0 })), idempotency_key: key }),
          () => setKey(newKey("rcv")),
        );
      }}
    >
      <h3 className="flex items-center gap-2 font-semibold">
        <PackageCheck className="h-5 w-5 text-primary" aria-hidden /> Terima barang
      </h3>
      <p className="text-sm text-muted-foreground">Isi yang benar-benar datang. Kalau harga di nota berbeda, ubah modalnya; HPP rata-rata ikut menyesuaikan.</p>
      {rows.map((r, i) => (
        <div key={r.variant_id} className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_10rem]">
          <p className="col-span-2 text-sm font-medium [overflow-wrap:anywhere] sm:col-span-1 sm:pb-3">
            {r.title} <span className="font-normal text-muted-foreground">· ditunggu {formatCount(r.remaining)} {r.unit}</span>
          </p>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`rcv-qty-${i}`} className="text-xs">
              Datang
            </Label>
            <Input
              id={`rcv-qty-${i}`}
              inputMode="numeric"
              value={String(r.qty)}
              onChange={(e) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value.replace(/\D/g, "").slice(0, 7) || 0) } : x)))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`rcv-cost-${i}`} className="text-xs">
              Modal / {r.unit}
            </Label>
            <RupiahInput id={`rcv-cost-${i}`} value={r.cost} onValueChange={(c) => setRows((prev) => prev.map((x, j) => (j === i ? { ...x, cost: c } : x)))} />
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Nilai barang datang <span className="font-semibold tabular-nums text-navy">{formatRupiah(value)}</span>
        </p>
        <Button type="submit" disabled={pending || rows.every((r) => r.qty === 0)}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Catat barang datang
        </Button>
      </div>
      <Feedback message={message} />
    </form>
  );
}

const METHOD_LABEL: Record<(typeof PAYMENT_METHODS)[number], string> = { transfer: "Transfer", tunai: "Tunai", qris: "QRIS", lainnya: "Lainnya" };

/** Catat pembayaran ke pemasok (owner). */
export function PayForm({ id, outstanding }: { id: string; outstanding: number }) {
  const { message, pending, run } = useRun();
  const [amount, setAmount] = useState<number | undefined>(outstanding || undefined);
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>("transfer");
  const [key, setKey] = useState(() => newKey("pay"));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run((s) => payPurchaseOrder(s, id, { amount: amount ?? 0, method, idempotency_key: key }), () => setKey(newKey("pay")));
      }}
    >
      <h3 className="flex items-center gap-2 font-semibold">
        <Wallet className="h-5 w-5 text-primary" aria-hidden /> Catat pembayaran
      </h3>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <Label htmlFor="pay-amount">Nominal</Label>
          <RupiahInput id="pay-amount" value={amount} onValueChange={setAmount} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="pay-method">Cara bayar</Label>
          <select
            id="pay-method"
            value={method}
            onChange={(e) => setMethod(e.target.value as (typeof PAYMENT_METHODS)[number])}
            className="h-11 rounded-md border border-border bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary md:text-sm"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending || !amount}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Catat
        </Button>
      </div>
      <Feedback message={message} />
    </form>
  );
}
