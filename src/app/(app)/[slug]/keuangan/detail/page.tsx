import { Suspense } from "react";
import { dailyFinanceRows, sumDailyRows } from "@/core/finance-insight";
import { lastDays } from "@/core/period";
import { getFinanceData } from "@/db/finance";
import { getShop } from "@/db/shop";
import { shopToday } from "@/lib/shop-today";
import { KeuanganHeader } from "../keuangan-header";
import { DailyFinanceTable, DETAIL_DAYS } from "./daily-table";
import { PageGate } from "@/components/shell/page-gate";

export const metadata = { title: "Detail keuangan" };

type Params = PageProps<"/[slug]/keuangan/detail">["params"];

/**
 * Financial Insight — Detail: one row per day for the last 28 days from
 * `fin_daily` + expenses, each day's figures from totalsOverLines (core).
 * Cards on phones, a table from md up.
 */
export default function DetailPage({ params, searchParams }: PageProps<"/[slug]/keuangan/detail">) {
  return (
    <div className="flex flex-col gap-6">
      <KeuanganHeader params={params} searchParams={searchParams} active="keuangan/detail" />
      <Suspense
        fallback={
          <div className="flex flex-col gap-4" aria-hidden>
            <div className="h-32 animate-pulse rounded-xl bg-muted" />
            <div className="h-96 animate-pulse rounded-xl bg-muted" />
          </div>
        }
      >
        <PageGate params={params} permission="finance">
          <Detail params={params} />
        </PageGate>
      </Suspense>
    </div>
  );
}

async function Detail({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const window = lastDays(await shopToday(shop.timezone), DETAIL_DAYS);
  const { lines, expenses } = await getFinanceData(shop.id, window);
  const rows = dailyFinanceRows(lines, expenses, window).reverse(); // newest first
  const total = sumDailyRows(rows);

  return <DailyFinanceTable rows={rows} total={total} window={window} />;
}
