import { Suspense } from "react";
import { channelMarginRows, CURRENT_LABEL, productMarginRows, warningRows } from "@/core/finance-insight";
import { lastDays } from "@/core/period";
import { getFinanceData } from "@/db/finance";
import { getShop } from "@/db/shop";
import { formatIsoDate } from "@/lib/format-date";
import { shopToday } from "@/lib/shop-today";
import { KeuanganHeader } from "../keuangan-header";
import { ChannelMargins, ProductMargins, Warnings } from "./margin-parts";

export const metadata = { title: "Margin" };

type Params = PageProps<"/[slug]/keuangan/margin">["params"];

/**
 * Financial Insight — Margin (FIN-4, FIN-6): margin warnings, margin per
 * channel (thinnest first) and per product for the last 7 days. Rows come
 * from src/core/finance-insight.ts over `fin_daily`.
 */
export default function MarginPage({ params }: PageProps<"/[slug]/keuangan/margin">) {
  return (
    <div className="flex flex-col gap-4">
      <KeuanganHeader params={params} active="keuangan/margin" />
      <Suspense fallback={<MarginSkeleton />}>
        <Margin params={params} />
      </Suspense>
    </div>
  );
}

async function Margin({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const window = lastDays(await shopToday(shop.timezone), 7);
  const { lines } = await getFinanceData(shop.id, window);

  if (lines.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-6 py-16 text-center text-muted-foreground">
        Belum ada penjualan {CURRENT_LABEL}, jadi margin belum bisa dihitung.
      </p>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        {CURRENT_LABEL} ({formatIsoDate(window.from)}–{formatIsoDate(window.to)}), diurutkan dari margin paling tipis
      </p>
      <Warnings slug={slug} rows={warningRows(lines)} />
      <ChannelMargins rows={channelMarginRows(lines)} />
      <ProductMargins rows={productMarginRows(lines)} />
    </>
  );
}

function MarginSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-32 animate-pulse rounded-xl bg-muted" />
      <div className="h-48 animate-pulse rounded-xl bg-muted" />
      <div className="h-96 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
