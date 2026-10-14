import { AlertTriangle, Package, Receipt, ShoppingBag, UserPlus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { STOCK_STATUS_LABEL } from "@/core/stock-level";
import { narrateForecast } from "@/core/stock";
import { formatRupiah, formatRupiahCompact } from "@/core/money";
import { getBerandaSummary, getLowStock, type BerandaSummary, type LowStockRow } from "@/db/dashboard";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";

export const metadata = { title: "Beranda" };

type Params = PageProps<"/[slug]/beranda">["params"];

/**
 * Beranda (PRD §7.2): four KPI cards for today, a 7-day revenue trend, and the
 * most urgent low-stock items. All numbers come from `src/core/*` (money,
 * stock) or from pre-aggregated views (`fin_daily`, `beranda_summary`); the UI
 * never computes KPIs from raw transaction rows.
 */
export default function BerandaPage({ params }: PageProps<"/[slug]/beranda">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Selamat datang</p>
        <h1 className="text-2xl font-semibold tracking-tight">Beranda</h1>
      </div>

      <Suspense fallback={<KpiSkeleton />}>
        <KpiCards params={params} />
      </Suspense>
      <Suspense fallback={<TrendSkeleton />}>
        <TrendSection params={params} />
      </Suspense>
      <Suspense fallback={<LowStockSkeleton />}>
        <LowStockSection params={params} />
      </Suspense>
    </div>
  );
}

async function KpiCards({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const s = await getBerandaSummary(shop.id);
  const cards = [
    { label: "Total Penjualan Hari Ini", icon: ShoppingBag, value: formatRupiah(s.revenue_today) },
    { label: "Jumlah Transaksi", icon: Receipt, value: s.orders_today.toLocaleString("id-ID") },
    { label: "Produk Terjual", icon: Package, value: s.items_today.toLocaleString("id-ID") },
    { label: "Pelanggan Baru", icon: UserPlus, value: s.new_customers_today.toLocaleString("id-ID") },
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ label, icon: Icon, value }) => (
        <div key={label} className="flex flex-col gap-2 rounded-xl border border-border p-4">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        </div>
      ))}
    </div>
  );
}

async function TrendSection({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const s = await getBerandaSummary(shop.id);
  return <TrendChart points={s.trend_7d} />;
}

function TrendChart({ points }: { points: BerandaSummary["trend_7d"] }) {
  const max = points.reduce((m, p) => Math.max(m, p.revenue), 0);
  if (points.length === 0 || max === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
        Belum ada penjualan 7 hari terakhir. Mulai transaksi pertama lewat kasir.
      </div>
    );
  }
  const dayLabel = (iso: string) =>
    new Date(`${iso}T00:00:00+07:00`).toLocaleDateString("id-ID", { weekday: "short", day: "numeric" });
  return (
    <section className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Penjualan 7 Hari</h2>
        <p className="text-xs text-muted-foreground">Total {formatRupiah(points.reduce((s, p) => s + p.revenue, 0))}</p>
      </div>
      <div className="flex items-end gap-2">
        {points.map((p) => {
          const height = max > 0 ? Math.max(4, Math.round((p.revenue / max) * 120)) : 4;
          return (
            <div key={p.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-md bg-primary/80"
                style={{ height: `${height}px` }}
                aria-label={`${dayLabel(p.day)}: ${formatRupiah(p.revenue)}`}
              />
              <span className="text-[11px] text-muted-foreground">{dayLabel(p.day)}</span>
              <span className="text-[11px] font-medium tabular-nums">{formatRupiahCompact(p.revenue)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

async function LowStockSection({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const rows = await getLowStock(shop.id, 5);
  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-border p-4">
        <h2 className="mb-2 text-sm font-semibold">Stok</h2>
        <p className="text-sm text-muted-foreground">Semua stok aman. Senang-senang saja.</p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Stok Menipis</h2>
        <Link href={shopPath(slug, "stok")} className="text-xs font-medium text-primary">
          Lihat semua
        </Link>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <LowStockItem key={r.variant_id} row={r} />
        ))}
      </ul>
    </section>
  );
}

function LowStockItem({ row }: { row: LowStockRow }) {
  const title = row.option_label ? `${row.product_name} — ${row.option_label}` : row.product_name;
  const variant =
    row.forecast.status === "habis" || row.forecast.status === "kritis"
      ? "danger"
      : row.forecast.status === "menipis"
        ? "warning"
        : "muted";
  return (
    <li className="flex items-start gap-3 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{title}</p>
          <Badge variant={variant}>{STOCK_STATUS_LABEL[row.forecast.status]}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{narrateForecast(title, row.forecast, row.unit)}</p>
        <p className="text-xs text-muted-foreground">
          Stok {row.on_hand} {row.unit} · pesan ulang disarankan {row.forecast.reorder_qty} {row.unit}
        </p>
      </div>
    </li>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}
function TrendSkeleton() {
  return <div className="h-48 animate-pulse rounded-xl bg-muted" />;
}
function LowStockSkeleton() {
  return <div className="h-36 animate-pulse rounded-xl bg-muted" />;
}
