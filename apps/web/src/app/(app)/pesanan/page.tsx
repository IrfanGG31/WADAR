import { SALES_CHANNEL_LABEL } from "@wadar/contracts/common";
import type { OrderListPage } from "@wadar/contracts/sales";
import { addDays, formatTimeId, formatDateTimeId, localDateKey, localDayRange } from "@wadar/core/date";
import { formatRupiah } from "@wadar/core/money";
import { Badge } from "@wadar/ui-web";
import { ListChecks } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { apiFetchServer } from "../../../lib/api-client-server";
import { getAppContext } from "../../../lib/app-context";

type Range = "hari-ini" | "kemarin" | "7-hari" | "semua";
const RANGES: Array<{ key: Range; label: string }> = [
  { key: "hari-ini", label: "Hari ini" },
  { key: "kemarin", label: "Kemarin" },
  { key: "7-hari", label: "7 hari" },
  { key: "semua", label: "Semua" },
];

export default async function PesananPage({ searchParams }: { searchParams: Promise<{ range?: string; cursor?: string }> }) {
  const { range: rawRange, cursor } = await searchParams;
  const range: Range = RANGES.some((r) => r.key === rawRange) ? (rawRange as Range) : "hari-ini";
  const { can, tenant } = await getAppContext();
  if (!can("orders:manage")) redirect("/beranda");

  const today = localDateKey(new Date(), tenant.timezone);
  const params = new URLSearchParams({ limit: "30" });
  if (range === "hari-ini") {
    const { start, end } = localDayRange(today, tenant.timezone);
    params.set("from", start.toISOString());
    params.set("to", end.toISOString());
  } else if (range === "kemarin") {
    const { start, end } = localDayRange(addDays(today, -1), tenant.timezone);
    params.set("from", start.toISOString());
    params.set("to", end.toISOString());
  } else if (range === "7-hari") {
    params.set("from", localDayRange(addDays(today, -6), tenant.timezone).start.toISOString());
  }
  if (cursor) params.set("cursor", cursor);
  const page = await apiFetchServer<OrderListPage>(`/v1/orders?${params}`);
  const total = page.items.filter((o) => o.status === "completed").reduce((s, o) => s + o.net, 0);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pesanan</h1>
        {!cursor && range !== "semua" && (
          <p className="mt-1 text-sm text-muted-foreground">
            {page.items.length}
            {page.nextCursor ? "+" : ""} transaksi · {formatRupiah(total)}
            {page.nextCursor ? " (halaman ini)" : ""}
          </p>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/pesanan?range=${r.key}`}
            aria-current={range === r.key ? "page" : undefined}
            className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium ${range === r.key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {page.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border p-10 text-center">
          <ListChecks className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">Belum ada pesanan di periode ini.</p>
          {can("cashier:operate") && (
            <Link href="/kasir" className="font-medium text-primary underline">
              Buka Kasir
            </Link>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
          {page.items.map((order) => (
            <li key={order.id}>
              <Link href={`/pesanan/${order.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50">
                <div className="min-w-0">
                  <p className="font-medium">#{order.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {range === "hari-ini" ? formatTimeId(order.completedAt, tenant.timezone) : formatDateTimeId(order.completedAt, tenant.timezone)} ·{" "}
                    {SALES_CHANNEL_LABEL[order.channel]} · {order.itemCount} barang
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className={`font-semibold ${order.status === "voided" ? "text-muted-foreground line-through" : ""}`}>{formatRupiah(order.net)}</p>
                  {order.status === "voided" ? (
                    <Badge variant="muted">Dibatalkan</Badge>
                  ) : order.paymentStatus === "paid" ? (
                    <Badge variant="success">Lunas</Badge>
                  ) : (
                    <Badge variant="warning">Belum lunas</Badge>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor && (
        <Link href={`/pesanan?range=${range}&cursor=${page.nextCursor}`} className="self-center text-sm font-medium text-primary underline">
          Lebih lama
        </Link>
      )}
    </div>
  );
}
