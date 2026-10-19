import { Bot, ClipboardList, Plus, Truck, Users } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageGate } from "@/components/shell/page-gate";
import { PageTabsSkeleton } from "@/components/shell/page-tabs";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/core/money";
import { formatCount } from "@/core/number-format";
import { can } from "@/core/roles";
import { getMyRole } from "@/db/access";
import { listPurchaseOrders, type PurchaseOrderRow } from "@/db/purchasing";
import { getShop } from "@/db/shop";
import { formatDateTime } from "@/lib/format-date";
import { shopPath } from "@/lib/routes";
import { StokTabs } from "../stok-tabs";
import { PurchaseStatusBadge } from "./status-badge";

export const metadata = { title: "Pembelian" };

type Params = PageProps<"/[slug]/stok/pembelian">["params"];

/**
 * Pembelian (ADR-005): orders to suppliers from draft to paid. Autopilot drafts them when stock
 * runs low; the owner approves, the cashier (or owner) receives the goods, the owner pays.
 */
export default function PembelianPage({ params }: PageProps<"/[slug]/stok/pembelian">) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Stok</h1>
      <Suspense fallback={<PageTabsSkeleton />}>
        <Tabs params={params} />
      </Suspense>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" aria-hidden />}>
        <PageGate params={params} permission="stock_in">
          <Orders params={params} />
        </PageGate>
      </Suspense>
    </div>
  );
}

async function Tabs({ params }: { params: Params }) {
  const { slug } = await params;
  return <StokTabs slug={slug} active="stok/pembelian" />;
}

async function Orders({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const [{ installed, orders }, role] = await Promise.all([listPurchaseOrders(shop.id), getMyRole(shop.id)]);
  const owner = can(role, "purchase");

  if (!installed) {
    return (
      <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Pembelian sedang disiapkan: pembaruan database belum diterapkan. Sementara itu, catat barang datang di Stok › Stok masuk.
      </p>
    );
  }

  const drafts = orders.filter((o) => o.status === "draft");
  const waiting = orders.filter((o) => o.status === "ordered" || o.status === "partial");
  const unpaid = orders.filter((o) => (o.status === "received" || o.status === "partial") && o.outstanding > 0);
  const done = orders.filter((o) => (o.status === "received" && o.outstanding === 0) || o.status === "canceled").slice(0, 20);
  const owed = unpaid.reduce((sum, o) => sum + o.outstanding, 0);
  const row = (o: PurchaseOrderRow) => <OrderRow key={o.id} slug={slug} order={o} showMoney={owner} timezone={shop.timezone} />;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={<ClipboardList className="h-4 w-4" aria-hidden />} label="Perlu disetujui" value={formatCount(drafts.length)} />
        <Stat icon={<Truck className="h-4 w-4" aria-hidden />} label="Menunggu barang" value={formatCount(waiting.length)} />
        {owner && <Stat icon={<Users className="h-4 w-4" aria-hidden />} label="Utang ke pemasok" value={formatRupiah(owed)} />}
      </div>

      {owner && (
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={shopPath(slug, "stok/pembelian/baru")}>
              <Plus className="h-4 w-4" aria-hidden /> Pesanan baru
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={shopPath(slug, "stok/pembelian/pemasok")}>Pemasok</Link>
          </Button>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center">
          <Bot className="h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="max-w-md text-sm text-muted-foreground">
            Belum ada pesanan pembelian. Autopilot menyiapkan draf sendiri saat stok mau habis{owner ? ", atau buat pesanan baru di atas" : ""}.
          </p>
        </div>
      ) : (
        <>
          <Section title="Perlu disetujui" empty="Tidak ada draf." orders={drafts} render={row} />
          <Section title="Menunggu barang datang" empty="Tidak ada barang yang ditunggu." orders={waiting} render={row} />
          {owner && <Section title="Belum lunas" empty="Semua pesanan sudah dibayar." orders={unpaid} render={row} />}
          {done.length > 0 && <Section title="Selesai" empty="" orders={done} render={row} />}
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border p-4">
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon} {label}
      </p>
      <p className="text-2xl font-semibold tabular-nums text-navy">{value}</p>
    </div>
  );
}

function Section({ title, empty, orders, render }: { title: string; empty: string; orders: PurchaseOrderRow[]; render: (o: PurchaseOrderRow) => React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="text-sm font-semibold text-navy">
        {title} ({formatCount(orders.length)})
      </h2>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">{orders.map(render)}</ul>
      )}
    </section>
  );
}

function OrderRow({ slug, order: o, showMoney, timezone }: { slug: string; order: PurchaseOrderRow; showMoney: boolean; timezone: string }) {
  return (
    <li>
      <Link
        href={shopPath(slug, `stok/pembelian/${o.id}`)}
        className="flex min-h-14 flex-col gap-1 px-4 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:flex-row sm:items-center sm:justify-between"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {o.number} · {o.supplier_name ?? "Pemasok belum dipilih"}
            <PurchaseStatusBadge status={o.status} />
            {o.source === "autopilot" && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Bot className="h-3.5 w-3.5" aria-hidden /> Autopilot
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatCount(o.line_count)} barang · dibuat {formatDateTime(o.created_at, timezone)}
          </span>
        </span>
        {showMoney && (
          <span className="flex shrink-0 flex-col items-start text-sm sm:items-end">
            <span className="font-semibold tabular-nums text-navy">{formatRupiah(o.status === "partial" || o.status === "received" ? o.received_total : o.total)}</span>
            {o.outstanding > 0 && o.status !== "ordered" && <span className="text-xs text-amber-800">Sisa {formatRupiah(o.outstanding)}</span>}
          </span>
        )}
      </Link>
    </li>
  );
}
