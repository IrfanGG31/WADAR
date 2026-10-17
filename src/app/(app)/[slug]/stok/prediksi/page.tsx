import { PackageOpen, Snail, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageTabsSkeleton } from "@/components/shell/page-tabs";
import { formatRupiah } from "@/core/money";
import {
  categoriesOf,
  narrateSlowMoving,
  narrateStockOverview,
  needsRestock,
  slowMovingSummary,
  sortByUrgency,
  type SlowMovingSummary,
} from "@/core/stock-insight";
import { getShop } from "@/db/shop";
import { DEFAULT_EXPIRY_WINDOW_DAYS } from "@/core/expiry";
import { listExpiryVariants, listStockForecasts } from "@/db/stock";
import { shopPath } from "@/lib/routes";
import { ExpiryWarning } from "../expiry-warning";
import { StokTabs, ToKeuanganLink } from "../stok-tabs";
import { ForecastTable } from "./forecast-table";

export const metadata = { title: "Prediksi & Rekomendasi Stok" };

type Params = PageProps<"/[slug]/stok/prediksi">["params"];

/**
 * Stock Intelligence — Prediksi & Rekomendasi (TECH-SPEC §7.1, PRD §7.2):
 * the headline prediction, slow movers with idle capital, and the full
 * forecast table with filters. Numbers and sentences come from
 * src/core/stock.ts + src/core/stock-insight.ts (template narration, no LLM).
 */
export default function PrediksiPage({ params }: PageProps<"/[slug]/stok/prediksi">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Stok</h1>
        <Suspense fallback={<div className="h-11 w-28 animate-pulse rounded-md bg-muted md:hidden" />}>
          <KeuanganLink params={params} />
        </Suspense>
      </div>
      <Suspense fallback={<PageTabsSkeleton />}>
        <Tabs params={params} />
      </Suspense>
      <Suspense fallback={<PredictionSkeleton />}>
        <Prediction params={params} />
      </Suspense>
    </div>
  );
}

async function KeuanganLink({ params }: { params: Params }) {
  const { slug } = await params;
  return <ToKeuanganLink slug={slug} />;
}

async function Tabs({ params }: { params: Params }) {
  const { slug } = await params;
  return <StokTabs slug={slug} active="stok/prediksi" />;
}

async function Prediction({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const [forecasts, expiry] = await Promise.all([listStockForecasts(shop.id), listExpiryVariants(shop.id)]);
  const rows = sortByUrgency(forecasts);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <PackageOpen className="h-10 w-10 text-muted-foreground" aria-hidden />
        <p className="max-w-sm text-muted-foreground">
          Belum ada produk untuk diprediksi.{" "}
          <Link
            href={shopPath(slug, "stok/produk/baru")}
            className="inline-flex min-h-11 items-center rounded-md px-1 font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Tambah produk
          </Link>
        </p>
      </div>
    );
  }

  const top = rows.find(needsRestock);
  const slow = slowMovingSummary(rows);
  return (
    <>
      <section className="flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4" aria-label="Prediksi utama">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Memprediksi</p>
          <p className="font-medium">{top ? top.narrative : "Semua stok aman."}</p>
          <p className="text-sm text-muted-foreground">{narrateStockOverview(rows)}</p>
        </div>
      </section>
      <ExpiryWarning
        slug={slug}
        today={expiry.today}
        variants={expiry.variants}
        windowDays={DEFAULT_EXPIRY_WINDOW_DAYS}
        rates={new Map(rows.map((r) => [r.variant_id, r.rate]))}
        productIds={new Map(rows.map((r) => [r.variant_id, r.product_id]))}
      />
      {slow.rows.length > 0 && <SlowMovers slow={slow} />}
      <ForecastTable slug={slug} rows={rows} categories={categoriesOf(rows)} />
    </>
  );
}

function SlowMovers({ slow }: { slow: SlowMovingSummary }) {
  return (
    <section className="rounded-xl border border-border p-4" aria-labelledby="lambat-laku">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="lambat-laku" className="flex items-center gap-2 text-sm font-semibold">
          <Snail className="h-4 w-4 text-muted-foreground" aria-hidden />
          Barang lambat laku
        </h2>
        <p className="text-sm">
          Modal tertahan <span className="font-semibold tabular-nums">{formatRupiah(slow.total_idle_capital)}</span>
        </p>
      </div>
      <ul className="divide-y divide-border">
        {slow.rows.map((row) => (
          <li key={row.variant_id} className="flex items-start justify-between gap-3 py-2">
            <p className="min-w-0 text-sm text-muted-foreground">{narrateSlowMoving(row)}</p>
            <span className="shrink-0 text-sm font-medium tabular-nums">{formatRupiah(row.idle_capital)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PredictionSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat prediksi stok" className="flex flex-col gap-4">
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="h-32 animate-pulse rounded-xl bg-muted" />
      <div className="flex flex-col gap-2">
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
