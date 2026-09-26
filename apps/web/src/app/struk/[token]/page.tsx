import type { PublicReceipt } from "@wadar/contracts/sales";
import { formatDateTimeId } from "@wadar/core/date";
import { formatRupiah } from "@wadar/core/money";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getWebEnv } from "../../../lib/env";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Struk", robots: { index: false } };

const METHOD_LABEL: Record<string, string> = { cash: "Tunai", transfer: "Transfer", qris: "QRIS", ewallet: "E-wallet" };

/** Public digital receipt (PRD O2.3) — no login; the signed token in the URL is the authorization. */
export default async function ReceiptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const res = await fetch(`${getWebEnv().NEXT_PUBLIC_API_URL}/v1/public/receipts/${encodeURIComponent(token)}`, { cache: "no-store" });
  if (!res.ok) notFound();
  const receipt = (await res.json()) as PublicReceipt;

  return (
    <main className="mx-auto min-h-dvh max-w-sm bg-background p-6 font-mono text-sm print:p-0">
      <div className="text-center">
        <h1 className="text-lg font-bold">{receipt.storeName}</h1>
        <p>{receipt.outletName}</p>
        {receipt.outletAddress && <p className="text-xs">{receipt.outletAddress}</p>}
        <p className="mt-2 text-xs">
          #{receipt.orderNumber} · {formatDateTimeId(receipt.completedAt, receipt.timezone)}
        </p>
        {receipt.status === "voided" && <p className="mt-2 font-bold text-red-700">DIBATALKAN</p>}
      </div>
      <hr className="my-3 border-dashed border-foreground/40" />
      <ul className="flex flex-col gap-2">
        {receipt.lines.map((line, i) => (
          <li key={i}>
            <p>{line.name}</p>
            <p className="flex justify-between">
              <span>
                {line.qty} x {formatRupiah(line.unitPrice)}
              </span>
              <span>{formatRupiah(line.qty * line.unitPrice)}</span>
            </p>
          </li>
        ))}
      </ul>
      <hr className="my-3 border-dashed border-foreground/40" />
      {receipt.discount > 0 && (
        <p className="flex justify-between">
          <span>Diskon</span>
          <span>-{formatRupiah(receipt.discount)}</span>
        </p>
      )}
      <p className="flex justify-between text-base font-bold">
        <span>TOTAL</span>
        <span>{formatRupiah(receipt.net)}</span>
      </p>
      {receipt.paymentMethod && (
        <p className="flex justify-between">
          <span>{METHOD_LABEL[receipt.paymentMethod] ?? receipt.paymentMethod}</span>
          <span>{formatRupiah(receipt.paid + receipt.change)}</span>
        </p>
      )}
      {receipt.change > 0 && (
        <p className="flex justify-between">
          <span>Kembali</span>
          <span>{formatRupiah(receipt.change)}</span>
        </p>
      )}
      {receipt.paid < receipt.net && receipt.status !== "voided" && <p className="mt-2 text-center font-bold">BELUM LUNAS</p>}
      <p className="mt-6 text-center text-xs">Terima kasih!</p>
      <PrintButton />
    </main>
  );
}
