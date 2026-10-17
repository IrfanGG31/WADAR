import { Receipt } from "lucide-react";
import { Suspense } from "react";
import { PageTabsSkeleton } from "@/components/shell/page-tabs";
import { formatRupiah } from "@/core/money";
import { formatCount } from "@/core/number-format";
import { formatPhone } from "@/core/phone";
import { can } from "@/core/roles";
import { PAYMENT_LABEL, type PaymentMethod } from "@/core/sale-schema";
import { countedTotal, isVoidable, saleStatusLabel } from "@/core/sale-void";
import { getMyRole } from "@/db/access";
import { listRecentSales } from "@/db/sales";
import { getShop } from "@/db/shop";
import { formatDay, formatTime } from "@/lib/format-date";
import { KasirTabs } from "../kasir-tabs";
import { PageGate } from "@/components/shell/page-gate";
import { Badge } from "@/components/ui/badge";
import { VoidSaleButton } from "./void-sale-button";

export const metadata = { title: "Riwayat transaksi" };

type Params = PageProps<"/[slug]/kasir/riwayat">["params"];

export default function RiwayatPage({ params }: PageProps<"/[slug]/kasir/riwayat">) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Transaksi</h1>
      <Suspense fallback={<HistorySkeleton />}>
        <PageGate params={params} permission="sell">
          <History params={params} />
        </PageGate>
      </Suspense>
    </div>
  );
}

async function History({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const [sales, role] = await Promise.all([listRecentSales(shop.id, 40), getMyRole(shop.id)]);
  const canVoid = can(role, "void_sale");

  const days: { day: string; sales: typeof sales }[] = [];
  for (const sale of sales) {
    const day = formatDay(sale.occurred_at, shop.timezone);
    if (days.at(-1)?.day !== day) days.push({ day, sales: [] });
    days.at(-1)?.sales.push(sale);
  }

  return (
    <>
      <KasirTabs slug={slug} active="kasir/riwayat" />
      {sales.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <Receipt className="h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="text-muted-foreground">Belum ada transaksi.</p>
        </div>
      ) : (
        days.map(({ day, sales: daySales }) => (
          <section key={day} className="flex flex-col gap-2">
            <h2 className="flex justify-between text-sm font-medium text-muted-foreground">
              <span>{day}</span>
              <span className="tabular-nums">{formatRupiah(countedTotal(daySales))}</span>
            </h2>
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {daySales.map((sale) => {
                const method = sale.payment_method as PaymentMethod | null;
                const itemText = sale.items.map((i) => `${i.name_snapshot} ×${formatCount(i.qty)}`).join(", ");
                const statusLabel = saleStatusLabel(sale.status);
                return (
                  <li key={sale.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium">{itemText}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(sale.occurred_at, shop.timezone)} · {sale.channel?.name ?? "-"}
                        {method && PAYMENT_LABEL[method] ? ` · ${PAYMENT_LABEL[method]}` : ""}
                        {sale.customer ? ` · ${sale.customer.name ?? formatPhone(sale.customer.phone_e164 ?? "")}` : ""}
                      </span>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className={`font-semibold tabular-nums ${statusLabel ? "text-muted-foreground line-through" : ""}`}>
                        {formatRupiah(Number(sale.total))}
                      </span>
                      {statusLabel && <Badge variant="outline">{statusLabel}</Badge>}
                      {!statusLabel && Number(sale.order_discount) > 0 && (
                        <span className="text-xs text-muted-foreground tabular-nums">diskon {formatRupiah(Number(sale.order_discount))}</span>
                      )}
                    </div>
                    {canVoid && isVoidable(sale.status) && (
                      <div className="flex basis-full justify-end">
                        <VoidSaleButton slug={slug} saleId={sale.id} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

function HistorySkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <PageTabsSkeleton />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
