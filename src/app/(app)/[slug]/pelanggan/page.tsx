import { Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { customerList, LAPSED_AFTER_DAYS, lastOrderText, parseCustomerFilter, type CustomerView } from "@/core/customers";
import { formatRupiah } from "@/core/money";
import { formatCount } from "@/core/number-format";
import { formatPhone } from "@/core/phone";
import { listCustomers } from "@/db/customers";
import { getShop } from "@/db/shop";
import { shopToday } from "@/lib/shop-today";
import { shopPath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { WhatsAppLink } from "./whatsapp-link";

export const metadata = { title: "Pelanggan" };

type Params = PageProps<"/[slug]/pelanggan">["params"];
type SearchParams = PageProps<"/[slug]/pelanggan">["searchParams"];

/**
 * Pelanggan — CRM ringan (PRD Tabel 19 Fase 1): every customer recorded at
 * Kasir, their spend, and who has gone quiet (> 30 days, src/core/customers.ts).
 */
export default function PelangganPage({ params, searchParams }: PageProps<"/[slug]/pelanggan">) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Pelanggan</h1>
      <Suspense fallback={<CustomersSkeleton />}>
        <Customers params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Customers({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug } = await params;
  const filter = parseCustomerFilter((await searchParams).filter);
  const shop = await getShop(slug);
  const [today, rows] = await Promise.all([shopToday(shop.timezone), listCustomers(shop)]);
  const { rows: list, summary } = customerList(rows, today, filter);

  if (summary.total === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <Users className="h-10 w-10 text-muted-foreground" aria-hidden />
        <p className="max-w-sm text-muted-foreground">
          Belum ada pelanggan. Isi nomor WhatsApp pembeli saat{" "}
          <Link
            href={shopPath(slug, "kasir")}
            className="rounded-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            mencatat penjualan di kasir
          </Link>
          , nanti muncul di sini.
        </p>
      </div>
    );
  }

  const stats = [
    { label: "Total pelanggan", value: formatCount(summary.total) },
    { label: `Belanja ${LAPSED_AFTER_DAYS} hari terakhir`, value: formatCount(summary.active) },
    { label: "Lama tidak belanja", value: formatCount(summary.lapsed) },
    { label: "Total belanja", value: formatRupiah(summary.total_spent) },
  ];
  const tabs = [
    { key: "semua", label: "Semua", query: {} },
    { key: "tidak-belanja", label: `Lama tidak belanja (${formatCount(summary.lapsed)})`, query: { filter: "tidak-belanja" } },
  ] as const;

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border p-4">
            <dt className="text-xs text-muted-foreground">{s.label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
      <nav className="flex gap-1 rounded-lg bg-muted p-1" aria-label="Saring pelanggan">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={{ pathname: shopPath(slug, "pelanggan"), query: t.query }}
            aria-current={t.key === filter ? "page" : undefined}
            className={cn(
              "flex min-h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-md px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:flex-none md:px-6",
              t.key === filter ? "bg-background text-foreground shadow-sm" : "text-slate-700 hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {filter === "tidak-belanja" && (
        <p className="text-sm text-muted-foreground">
          Pernah belanja, tapi tidak belanja lagi lebih dari {LAPSED_AFTER_DAYS} hari. Diurutkan dari total belanja terbesar: sapa
          mereka duluan.
        </p>
      )}
      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-muted-foreground">
          Semua pelanggan masih belanja dalam {LAPSED_AFTER_DAYS} hari terakhir.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {list.map((c) => (
            <CustomerItem key={c.id} slug={slug} c={c} />
          ))}
        </ul>
      )}
    </>
  );
}

function CustomerItem({ slug, c }: { slug: string; c: CustomerView }) {
  return (
    <li className="flex items-center gap-2 px-2 py-1">
      <Link
        href={shopPath(slug, `pelanggan/${c.id}`)}
        className="flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{c.label}</span>
            {c.lapsed && <Badge variant="warning">Lama tidak belanja</Badge>}
          </span>
          <span className="text-xs text-muted-foreground">
            {c.phone_e164 ? `${formatPhone(c.phone_e164)} · ` : ""}
            {lastOrderText(c.days_since)}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="font-semibold tabular-nums">{formatRupiah(c.total_spent)}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{formatCount(c.orders_count)}× belanja</span>
        </div>
      </Link>
      {c.lapsed && c.phone_e164 && <WhatsAppLink phone={c.phone_e164} name={c.label} />}
    </li>
  );
}

function CustomersSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-[3.25rem] animate-pulse rounded-lg bg-muted" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
