import { SALES_CHANNEL_LABEL } from "@wadar/contracts/common";
import type { OrderView } from "@wadar/contracts/sales";
import { formatDateTimeId } from "@wadar/core/date";
import { formatRupiah } from "@wadar/core/money";
import { Badge, Card, CardContent } from "@wadar/ui-web";
import { ArrowLeft, Receipt } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, apiFetchServer } from "../../../../lib/api-client-server";
import { getAppContext } from "../../../../lib/app-context";
import { VoidOrderButton } from "./void-order-button";

const METHOD_LABEL = { cash: "Tunai", transfer: "Transfer", qris: "QRIS", ewallet: "E-wallet" } as const;

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const { can, tenant } = await getAppContext();
  let order: OrderView;
  try {
    order = await apiFetchServer<OrderView>(`/v1/orders/${orderId}`);
  } catch (error) {
    if (error instanceof ApiError && [400, 403, 404].includes(error.problem.status)) notFound();
    throw error;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 md:p-6">
      <Link href="/pesanan" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Pesanan
      </Link>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">#{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {formatDateTimeId(order.completedAt, tenant.timezone)} · {SALES_CHANNEL_LABEL[order.channel]}
          </p>
        </div>
        {order.status === "voided" ? (
          <Badge variant="muted">Dibatalkan</Badge>
        ) : order.paymentStatus === "paid" ? (
          <Badge variant="success">Lunas</Badge>
        ) : (
          <Badge variant="warning">Belum lunas</Badge>
        )}
      </div>

      {order.status === "voided" && (
        <p className="rounded-lg bg-muted p-3 text-sm">
          Dibatalkan {order.voidedAt && formatDateTimeId(order.voidedAt, tenant.timezone)} — {order.voidReason}. Stok sudah dikembalikan.
        </p>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          {order.lines.map((line) => (
            <div key={line.id} className="flex justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{line.name}</p>
                <p className="text-muted-foreground">
                  {line.qty} × {formatRupiah(line.unitPrice)}
                  {line.discount > 0 && ` · diskon ${formatRupiah(line.discount)}`}
                </p>
              </div>
              <p className="shrink-0 font-medium">{formatRupiah(line.netAmount)}</p>
            </div>
          ))}
          <hr className="border-border" />
          {order.discount > 0 && (
            <p className="flex justify-between text-sm text-muted-foreground">
              <span>Total diskon</span>
              <span>-{formatRupiah(order.discount)}</span>
            </p>
          )}
          <p className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>{formatRupiah(order.net)}</span>
          </p>
          {order.payments.map((p) => (
            <p key={p.id} className="flex justify-between text-sm">
              <span>{METHOD_LABEL[p.method]}</span>
              <span>{formatRupiah(p.amount)}</span>
            </p>
          ))}
          {order.change > 0 && (
            <p className="flex justify-between text-sm">
              <span>Kembalian</span>
              <span>{formatRupiah(order.change)}</span>
            </p>
          )}
          {order.cost !== undefined && (
            <p className="flex justify-between border-t border-border pt-3 text-sm text-muted-foreground">
              <span>Untung kotor (setelah modal{order.commission ? " & komisi" : ""})</span>
              <span className="font-medium text-foreground">{formatRupiah(order.net - order.cost - (order.commission ?? 0))}</span>
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <a href={`/struk/${order.receiptToken}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-muted">
          <Receipt className="h-4 w-4" /> Struk
        </a>
        {can("orders:void") && order.status !== "voided" && <VoidOrderButton orderId={order.id} />}
      </div>
    </div>
  );
}
