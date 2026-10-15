import { Wallet } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import {
  categoryShares,
  CURRENT_LABEL,
  dailyFinanceRows,
  linesIn,
  OTHER_CATEGORY,
  periodResult,
  PREVIOUS_LABEL,
  profitInsight,
  summaryCards,
} from "@/core/finance-insight";
import { weekOverWeek } from "@/core/period";
import { getFinanceData } from "@/db/finance";
import { getShop } from "@/db/shop";
import { formatIsoDate } from "@/lib/format-date";
import { shopToday } from "@/lib/shop-today";
import { shopPath } from "@/lib/routes";
import { KeuanganHeader } from "./keuangan-header";
import { CategoryDonut, ProfitChangeCard, ProfitTrend, SummaryCards } from "./summary-parts";

export const metadata = { title: "Keuangan" };

type Params = PageProps<"/[slug]/keuangan">["params"];

/**
 * Financial Insight — Ringkasan (TECH-SPEC §7.2, PRD §7.2): R/C/F/S/GP/NP for
 * the last 7 days vs the 7 before, "kenapa untung berubah" (FIN-5
 * decomposition), untung kotor per day and penjualan per kategori. Reads the
 * `fin_daily` aggregate; every number comes from src/core/finance*.ts.
 */
export default function KeuanganPage({ params }: PageProps<"/[slug]/keuangan">) {
  return (
    <div className="flex flex-col gap-4">
      <KeuanganHeader params={params} active="keuangan" />
      <Suspense fallback={<SummarySkeleton />}>
        <Summary params={params} />
      </Suspense>
    </div>
  );
}

async function Summary({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const today = await shopToday(shop.timezone);
  const { current, previous } = weekOverWeek(today);
  const { lines, expenses } = await getFinanceData(shop.id, { from: previous.from, to: current.to });

  if (lines.length === 0 && expenses.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <Wallet className="h-10 w-10 text-muted-foreground" />
        <p className="max-w-sm text-muted-foreground">
          Belum ada penjualan 14 hari terakhir.{" "}
          <Link href={shopPath(slug, "kasir")} className="font-medium text-primary">
            Catat penjualan di kasir
          </Link>
        </p>
      </div>
    );
  }

  const cur = periodResult(lines, expenses, current);
  const prev = periodResult(lines, expenses, previous);
  const donut = categoryShares(linesIn(lines, current));
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {CURRENT_LABEL} ({formatIsoDate(current.from)}–{formatIsoDate(current.to)}) dibanding {PREVIOUS_LABEL}
      </p>
      <SummaryCards cards={summaryCards(cur, prev)} />
      <ProfitChangeCard insight={profitInsight(lines, expenses, current, previous)} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ProfitTrend rows={dailyFinanceRows(lines, expenses, current)} />
        <CategoryDonut total={donut.total} slices={donut.slices} otherLabel={OTHER_CATEGORY} />
      </div>
    </>
  );
}

function SummarySkeleton() {
  return (
    <div className="flex flex-col gap-4">
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
