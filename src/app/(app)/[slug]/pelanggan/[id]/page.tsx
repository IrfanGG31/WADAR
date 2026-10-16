import { ArrowLeft, Receipt } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { customerList, lastOrderText } from "@/core/customers";
import { formatRupiah } from "@/core/money";
import { formatCount } from "@/core/number-format";
import { formatPhone } from "@/core/phone";
import { PAYMENT_LABEL, type PaymentMethod } from "@/core/sale-schema";
import { getCustomer } from "@/db/customers";
import { listRecentSales } from "@/db/sales";
import { getShop } from "@/db/shop";
import { formatDateTime } from "@/lib/format-date";
import { shopToday } from "@/lib/shop-today";
import { shopPath } from "@/lib/routes";
import { WhatsAppLink } from "../whatsapp-link";

export const metadata = { title: "Riwayat pelanggan" };

type Params = PageProps<"/[slug]/pelanggan/[id]">["params"];

/** How many of the customer's latest sales the page lists. */
const HISTORY_LIMIT = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One customer: spend summary + riwayat belanja (newest first). */
export default function PelangganDetailPage({ params }: PageProps<"/[slug]/pelanggan/[id]">) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<DetailSkeleton />}>
        <Detail params={params} />
      </Suspense>
    </div>
  );
}

async function Detail({ params }: { params: Params }) {
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const shop = await getShop(slug);
  const [today, customer, sales] = await Promise.all([
    shopToday(shop.timezone),
    getCustomer(shop, id),
    listRecentSales(shop.id, HISTORY_LIMIT, { customerId: id }),
  ]);
  if (!customer) notFound();
  const c = customerList([customer], today, "semua").rows[0];

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link
          href={shopPath(slug, "pelanggan")}
          className="inline-flex min-h-11 w-fit items-center gap-1 rounded-md text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Semua pelanggan
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{c.label}</h1>
          {c.lapsed && <Badge variant="warning">Lama tidak belanja</Badge>}
          {c.phone_e164 && <WhatsAppLink phone={c.phone_e164} name={c.label} />}
        </div>
        <p className="text-sm text-muted-foreground">
          {c.phone_e164 ? `${formatPhone(c.phone_e164)} · ` : ""}
          {lastOrderText(c.days_since)}
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: "Total belanja", value: formatRupiah(c.total_spent) },
          { label: "Jumlah belanja", value: `${formatCount(c.orders_count)}×` },
          { label: "Rata-rata", value: formatRupiah(c.avg_order) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border p-3">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="mt-1 font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      <section className="flex flex-col gap-2" aria-labelledby="riwayat-belanja">
        <h2 id="riwayat-belanja" className="text-sm font-semibold">
          Riwayat belanja
        </h2>
        {sales.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground" aria-hidden />
            <p className="text-muted-foreground">Belum ada transaksi.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {sales.map((sale) => {
              const method = sale.payment_method as PaymentMethod | null;
              const itemText = sale.items.map((i) => `${i.name_snapshot} ×${formatCount(i.qty)}`).join(", ");
              return (
                <li key={sale.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{itemText}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(sale.occurred_at, shop.timezone)} · {sale.channel?.name ?? "-"}
                      {method && PAYMENT_LABEL[method] ? ` · ${PAYMENT_LABEL[method]}` : ""}
                    </span>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{formatRupiah(Number(sale.total))}</span>
                </li>
              );
            })}
          </ul>
        )}
        {sales.length === HISTORY_LIMIT && (
          <p className="text-xs text-muted-foreground">Menampilkan {formatCount(HISTORY_LIMIT)} transaksi terakhir.</p>
        )}
      </section>
    </>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
