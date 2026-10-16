import { Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import {
  categoryShares,
  dailyFinanceRows,
  linesIn,
  OTHER_CATEGORY,
  parseFinancePeriodDays,
  periodLabels,
  periodResult,
  profitInsight,
  summaryCards,
} from "@/core/finance-insight";
import { periodComparison } from "@/core/period";
import { getFinanceData } from "@/db/finance";
import { getShop } from "@/db/shop";
import { formatIsoDate } from "@/lib/format-date";
import { shopToday } from "@/lib/shop-today";
import { shopPath } from "@/lib/routes";
import { KeuanganHeader } from "./keuangan-header";
import { PeriodPicker, PeriodPickerSkeleton } from "./period-picker";
import { CategoryDonut, ProfitChangeCard, ProfitTrend, SummaryCards } from "./summary-parts";

export const metadata = { title: "Keuangan" };

type Params = PageProps<"/[slug]/keuangan">["params"];
type SearchParams = PageProps<"/[slug]/keuangan">["searchParams"];

/**
 * Financial Insight — Ringkasan (TECH-SPEC §7.2, PRD §7.2): R/C/F/S/GP/NP for
 * the last 7 (default) or 30 days (`?periode=30`) vs the same length before, "kenapa untung berubah" (FIN-5
 * decomposition), untung kotor per day and penjualan per kategori. Reads the
 * `fin_daily` aggregate; every number comes from src/core/finance*.ts.
 */
export default function KeuanganPage({ params, searchParams }: PageProps<"/[slug]/keuangan">) {
  return (
    <div className="flex flex-col gap-6">
      <KeuanganHeader params={params} active="keuangan" />
      <Suspense fallback={<SummarySkeleton />}>
        <Summary params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Summary({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug } = await params;
  const days = parseFinancePeriodDays((await searchParams).periode);
  const label = periodLabels(days);
  const shop = await getShop(slug);
  const today = await shopToday(shop.timezone);
  const { current, previous } = periodComparison(today, days);
  const { lines, expenses } = await getFinanceData(shop.id, { from: previous.from, to: current.to });
  const picker = <PeriodPicker slug={slug} page="keuangan" days={days} />;

  if (lines.length === 0 && expenses.length === 0) {
    return (
      <>
        {picker}
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <Wallet className="h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="max-w-sm text-muted-foreground">
            Belum ada penjualan {days * 2} hari terakhir.{" "}
            <Link
              href={shopPath(slug, "kasir")}
              className="rounded-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Catat penjualan di kasir
            </Link>
          </p>
        </div>
      </>
    );
  }

  const cur = periodResult(lines, expenses, current);
  const prev = periodResult(lines, expenses, previous);
  const donut = categoryShares(linesIn(lines, current));
  return (
    <>
      {picker}
      <p className="text-sm text-muted-foreground">
        {label.current} ({formatIsoDate(current.from)}–{formatIsoDate(current.to)}) dibanding {label.previous}
      </p>
      <SummaryCards cards={summaryCards(cur, prev)} />
      <ProfitChangeCard insight={profitInsight(lines, expenses, current, previous, days)} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfitTrend rows={dailyFinanceRows(lines, expenses, current)} periodLabel={label.current} />
        <CategoryDonut total={donut.total} slices={donut.slices} otherLabel={OTHER_CATEGORY} periodLabel={label.current} />
      </div>
    </>
  );
}

function SummarySkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <PeriodPickerSkeleton />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl bg-muted" />
      <div className="h-56 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
