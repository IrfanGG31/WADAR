import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { brand } from "@/brand";
import { formatRupiah } from "@/core/money";
import { formatCount } from "@/core/number-format";
import { PAYMENT_LABEL, type PaymentMethod } from "@/core/sale-schema";
import { saleStatusLabel } from "@/core/sale-void";
import { getPublicReceipt } from "@/db/receipt";
import { formatDateTime } from "@/lib/format-date";

export const metadata = { title: "Struk belanja", robots: { index: false, follow: false } };

/** Struk publik (POS-3): one sale, opened by its random token; no login, nothing internal. */
async function Receipt({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await connection();
  const receipt = await getPublicReceipt(token);
  if (!receipt) notFound();
  const status = saleStatusLabel(receipt.status);
  const method = receipt.paymentMethod as PaymentMethod | null;

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-background p-5">
      <header className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-lg font-semibold">{receipt.shopName}</h1>
        <p className="text-sm text-muted-foreground">{formatDateTime(receipt.occurredAt, receipt.timezone)}</p>
        {status && (
          <p role="status" className="mt-1 rounded-md bg-destructive/10 px-3 py-1 text-sm font-medium text-red-800">
            Transaksi ini {status.toLowerCase()}
          </p>
        )}
      </header>

      <ul className="flex flex-col divide-y divide-dashed divide-border border-y border-dashed border-border">
        {receipt.items.map((item, i) => (
          <li key={i} className="flex justify-between gap-3 py-2 text-sm">
            <div className="min-w-0">
              <p className="font-medium">{item.name}</p>
              <p className="text-muted-foreground tabular-nums">
                {formatCount(item.qty)} × {formatRupiah(item.unitPrice)}
                {item.lineDiscount > 0 && ` − ${formatRupiah(item.lineDiscount)}`}
              </p>
            </div>
            <span className="shrink-0 tabular-nums">{formatRupiah(item.lineTotal)}</span>
          </li>
        ))}
      </ul>

      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{formatRupiah(receipt.subtotal)}</dd></div>
        {receipt.orderDiscount > 0 && (
          <div className="flex justify-between"><dt>Diskon</dt><dd className="tabular-nums">−{formatRupiah(receipt.orderDiscount)}</dd></div>
        )}
        <div className={`flex justify-between text-lg font-semibold ${status ? "text-muted-foreground line-through" : ""}`}>
          <dt>Total</dt>
          <dd className="tabular-nums">{formatRupiah(receipt.total)}</dd>
        </div>
        {method && PAYMENT_LABEL[method] && (
          <div className="flex justify-between text-muted-foreground"><dt>Pembayaran</dt><dd>{PAYMENT_LABEL[method]}</dd></div>
        )}
        {receipt.channelName && (
          <div className="flex justify-between text-muted-foreground"><dt>Kanal</dt><dd>{receipt.channelName}</dd></div>
        )}
      </dl>

      <p className="text-center text-xs text-muted-foreground">Terima kasih sudah belanja. Struk dibuat dengan {brand.name}.</p>
    </article>
  );
}

export default function PublicReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center bg-muted/30 px-4 py-8">
      <Suspense fallback={<p className="text-center text-sm text-muted-foreground">Memuat struk…</p>}>
        <Receipt params={params} />
      </Suspense>
    </main>
  );
}
