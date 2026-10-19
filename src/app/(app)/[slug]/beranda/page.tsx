import { AlertTriangle, ChevronRight, MessagesSquare, Package, Receipt, ShoppingBag, Sparkles, UserPlus, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { weekStart } from "@/core/consult/insights";
import { STOCK_STATUS_LABEL } from "@/core/stock-level";
import type { ForecastRow } from "@/core/stock-insight";
import { formatRupiah } from "@/core/money";
import { formatCount } from "@/core/number-format";
import { can, DENIED_PARAM, deniedPageNotice } from "@/core/roles";
import { getMyRole } from "@/db/access";
import { getBerandaInsight } from "@/db/beranda-insight";
import { getBerandaSummary, getLowStock, type BerandaSummary } from "@/db/dashboard";
import { getShop } from "@/db/shop";
import { getWeeklyDigest } from "@/db/weekly-digest";
import { formatIsoWeekday } from "@/lib/format-date";
import { shopPath } from "@/lib/routes";
import { shopToday } from "@/lib/shop-today";
import { SetupChecklist } from "./setup-checklist";
import { WeeklyDigestSummary } from "./weekly-digest";

export const metadata = { title: "Beranda" };

type Params = PageProps<"/[slug]/beranda">["params"];

/**
 * Beranda (PRD §7.2): four KPI cards for today, a 7-day revenue trend, and the
 * most urgent low-stock items, and "Insight untukmu" (template narration of
 * the stock forecast and the week's profit change). All numbers come from
 * `src/core/*` (money, stock, finance) or from pre-aggregated views
 * (`fin_daily`, `beranda_summary`); the UI never computes KPIs from raw
 * transaction rows.
 */
export default function BerandaPage({ params, searchParams }: PageProps<"/[slug]/beranda">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Selamat datang</p>
        <h1 className="text-2xl font-semibold tracking-tight">Beranda</h1>
      </div>
      <Suspense fallback={null}>
        <DeniedNotice params={params} searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <SetupChecklist params={params} />
      </Suspense>

      <Suspense fallback={<KpiSkeleton />}>
        <KpiCards params={params} />
      </Suspense>
      <Suspense fallback={<TrendSkeleton />}>
        <TrendSection params={params} />
      </Suspense>
      <Suspense fallback={<LowStockSkeleton />}>
        <LowStockSection params={params} />
      </Suspense>
      <Suspense fallback={<InsightSkeleton />}>
        <InsightSection params={params} />
      </Suspense>
    </div>
  );
}

/** After a page guard refused a page (`?ditolak=finance`, src/db/access.ts): say why. */
async function DeniedNotice({ params, searchParams }: { params: Params; searchParams: PageProps<"/[slug]/beranda">["searchParams"] }) {
  const { slug } = await params;
  const notice = deniedPageNotice(await getMyRole((await getShop(slug)).id), (await searchParams)[DENIED_PARAM]);
  if (!notice) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {notice}
    </p>
  );
}

async function KpiCards({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const s = await getBerandaSummary(shop.id);
  const cards = [
    { label: "Total Penjualan Hari Ini", icon: ShoppingBag, value: formatRupiah(s.revenue_today) },
    { label: "Jumlah Transaksi", icon: Receipt, value: formatCount(s.orders_today) },
    { label: "Produk Terjual", icon: Package, value: formatCount(s.items_today) },
    { label: "Pelanggan Baru", icon: UserPlus, value: formatCount(s.new_customers_today) },
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ label, icon: Icon, value }) => (
        <div key={label} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border p-3 sm:p-4">
          <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
          <p className="text-base font-semibold tabular-nums sm:text-2xl">{value}</p>
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
  const dayLabel = formatIsoWeekday;
  return (
    <section className="rounded-xl border border-border p-4" aria-labelledby="penjualan-7-hari">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="penjualan-7-hari" className="text-sm font-semibold">Penjualan 7 Hari</h2>
        <p className="text-xs text-muted-foreground tabular-nums">Total {formatRupiah(points.reduce((s, p) => s + p.revenue, 0))}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {points.map((p) => {
          const widthPct = max > 0 ? Math.max(2, Math.round((p.revenue / max) * 100)) : 2;
          return (
            <li key={p.day} className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-2 text-xs sm:text-sm">
              <span className="truncate text-muted-foreground">{dayLabel(p.day)}</span>
              <div className="h-2.5 rounded-full bg-muted">
                <div
                  role="img"
                  aria-label={`${dayLabel(p.day)}: ${formatRupiah(p.revenue)}`}
                  className="h-2.5 rounded-full bg-primary/80"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="text-right font-medium tabular-nums">{formatRupiah(p.revenue)}</span>
            </li>
          );
        })}
      </ul>
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
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Stok Menipis</h2>
        <Link
          href={shopPath(slug, "stok")}
          className="inline-flex min-h-11 items-center rounded-md px-2 text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
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

function LowStockItem({ row }: { row: ForecastRow }) {
  const variant =
    row.status === "habis" || row.status === "kritis" ? "danger" : row.status === "menipis" ? "warning" : "muted";
  return (
    <li className="flex items-start gap-3 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{row.title}</p>
          <Badge variant={variant}>{STOCK_STATUS_LABEL[row.status]}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{row.narrative}</p>
        <p className="text-xs text-muted-foreground">
          Stok {formatCount(row.on_hand)} {row.unit} · pesan ulang disarankan {formatCount(row.reorder_qty)} {row.unit}
        </p>
      </div>
    </li>
  );
}

const INSIGHT_LINK = {
  stock_critical: { icon: Package, page: "stok/prediksi" },
  slow_mover: { icon: Package, page: "stok/prediksi" },
  margin_warning: { icon: Wallet, page: "keuangan" },
  profit_effect: { icon: Wallet, page: "keuangan" },
  lapsed_customers: { icon: Users, page: "pelanggan" },
  // Fallback lines when no weekly insight qualifies.
  stok: { icon: Package, page: "stok/prediksi" },
  keuangan: { icon: Wallet, page: "keuangan" },
} as const;

/**
 * "Insight untukmu" (PRD §7.2, CON-3): this week's top-3 — impact × urgency,
 * deduped over 7 days (src/core/consult/insights.ts), template narration, no
 * LLM on page load. When nothing qualifies it falls back to the one-line
 * Stock and Finance sentences (D5). The digest the Monday job stored (GAP #5)
 * is shown on top; its insights are the stored rows getWeeklyInsights returns.
 * The items are made once per shop per day (CON-5, src/db/beranda-insight.ts).
 */
async function InsightSection({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  // Profit insights + the weekly digest come from Konsultasi: owner only (CON-6).
  if (!can(await getMyRole(shop.id), "consult")) return null;
  const today = await shopToday(shop.timezone);
  const [insight, digest] = await Promise.all([getBerandaInsight(shop, today), getWeeklyDigest(shop.id, weekStart(today))]);

  const items = insight.items.map(({ key, type, title, text }) => {
    const link = type in INSIGHT_LINK ? INSIGHT_LINK[type as keyof typeof INSIGHT_LINK] : null;
    return { key, title, text, icon: link?.icon ?? Sparkles, href: shopPath(slug, link?.page ?? "konsultasi") };
  });
  return (
    <section className="rounded-xl border border-border p-4" aria-labelledby="insight-untukmu">
      <h2 id="insight-untukmu" className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden />
        Insight untukmu
      </h2>
      <WeeklyDigestSummary digest={digest} />
      <ul className="divide-y divide-border">
        {items.map(({ key, title, icon: Icon, text, href }) => (
          <li key={key}>
            <Link
              href={href}
              className="flex min-h-14 items-start gap-3 rounded-lg py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium">{title}</span>
                <span className="text-sm text-muted-foreground">{text}</span>
              </span>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={shopPath(slug, "konsultasi")}
        className="mt-1 flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <MessagesSquare className="h-4 w-4" aria-hidden />
        Tanya konsultan tentang tokomu
      </Link>
    </section>
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
function InsightSkeleton() {
  return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
}
