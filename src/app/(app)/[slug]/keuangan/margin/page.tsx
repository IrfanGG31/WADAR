import { Suspense } from "react";
import {
  channelMarginRows,
  linesIn,
  parseFinancePeriodDays,
  periodLabels,
  productMarginRows,
  warningRows,
} from "@/core/finance-insight";
import { periodComparison } from "@/core/period";
import { getFinanceData } from "@/db/finance";
import { getShop } from "@/db/shop";
import { formatIsoDate } from "@/lib/format-date";
import { shopToday } from "@/lib/shop-today";
import { KeuanganHeader } from "../keuangan-header";
import { PeriodPicker, PeriodPickerSkeleton } from "../period-picker";
import { ChannelMargins, ProductMargins, Warnings } from "./margin-parts";

export const metadata = { title: "Margin" };

type Params = PageProps<"/[slug]/keuangan/margin">["params"];
type SearchParams = PageProps<"/[slug]/keuangan/margin">["searchParams"];

/**
 * Financial Insight — Margin (FIN-4, FIN-6): margin warnings, margin per
 * channel (thinnest first) and per product for the last 7 (default) or 30
 * days (`?periode=30`); MARGIN_DROP compares with the same length before.
 * Rows come from src/core/finance-insight.ts over `fin_daily`.
 */
export default function MarginPage({ params, searchParams }: PageProps<"/[slug]/keuangan/margin">) {
  return (
    <div className="flex flex-col gap-6">
      <KeuanganHeader params={params} active="keuangan/margin" />
      <Suspense fallback={<MarginSkeleton />}>
        <Margin params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Margin({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug } = await params;
  const days = parseFinancePeriodDays((await searchParams).periode);
  const label = periodLabels(days);
  const shop = await getShop(slug);
  const { current: window, previous } = periodComparison(await shopToday(shop.timezone), days);
  const data = await getFinanceData(shop.id, { from: previous.from, to: window.to });
  const lines = linesIn(data.lines, window);
  const picker = <PeriodPicker slug={slug} page="keuangan/margin" days={days} />;

  if (lines.length === 0) {
    return (
      <>
        {picker}
        <p className="rounded-xl border border-dashed border-border px-6 py-16 text-center text-muted-foreground">
          Belum ada penjualan {label.current}, jadi margin belum bisa dihitung.
        </p>
      </>
    );
  }

  return (
    <>
      {picker}
      <p className="text-sm text-muted-foreground">
        {label.current} ({formatIsoDate(window.from)}–{formatIsoDate(window.to)}), diurutkan dari margin paling tipis
      </p>
      <Warnings
        slug={slug}
        rows={warningRows(lines, { previous: linesIn(data.lines, previous), days })}
        periodLabel={label.current}
      />
      <ChannelMargins rows={channelMarginRows(lines)} />
      <ProductMargins rows={productMarginRows(lines)} />
    </>
  );
}

function MarginSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <PeriodPickerSkeleton />
      <div className="h-32 animate-pulse rounded-xl bg-muted" />
      <div className="h-48 animate-pulse rounded-xl bg-muted" />
      <div className="h-96 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
