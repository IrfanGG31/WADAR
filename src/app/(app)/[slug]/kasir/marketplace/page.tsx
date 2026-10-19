import { Suspense } from "react";
import { PageGate } from "@/components/shell/page-gate";
import { PageTabsSkeleton } from "@/components/shell/page-tabs";
import { MARKETPLACES } from "@/core/marketplace-import";
import { formatCount } from "@/core/number-format";
import { listAllChannels } from "@/db/channels";
import { listMarketplaceImports, listVariantRefs } from "@/db/marketplace";
import { getShop } from "@/db/shop";
import { formatDateTime } from "@/lib/format-date";
import { KasirTabs } from "../kasir-tabs";
import { MarketplaceImport } from "./marketplace-import";

export const metadata = { title: "Impor pesanan marketplace" };

type Params = PageProps<"/[slug]/kasir/marketplace">["params"];

/** IMP-1..3: Shopee / TikTok Shop / Tokopedia orders from the seller-center export, so untung per kanal is complete. */
export default function MarketplacePage({ params }: PageProps<"/[slug]/kasir/marketplace">) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Transaksi</h1>
      <Suspense fallback={<PageTabsSkeleton />}>
        <Tabs params={params} />
      </Suspense>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden />}>
        <PageGate params={params} permission="finance">
          <Content params={params} />
        </PageGate>
      </Suspense>
    </div>
  );
}

async function Tabs({ params }: { params: Params }) {
  const { slug } = await params;
  return <KasirTabs slug={slug} active="kasir/marketplace" />;
}

async function Content({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const [channels, variants, imports] = await Promise.all([listAllChannels(shop.id), listVariantRefs(shop.id), listMarketplaceImports(shop.id)]);
  const marketplaceChannels = channels
    .filter((c) => c.is_active && c.kind !== "pos")
    .map((c) => ({ id: c.id, kind: c.kind, name: c.name, fee_pct: c.fee_pct, fee_fixed: c.fee_fixed }));

  return (
    <div className="flex flex-col gap-6">
      <MarketplaceImport timeZone={shop.timezone} channels={marketplaceChannels} variants={variants} />
      <section className="flex flex-col gap-2" aria-labelledby="riwayat-impor">
        <h2 id="riwayat-impor" className="font-semibold">Riwayat impor</h2>
        {imports.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum pernah impor.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {imports.map((i) => (
              <li key={i.id} className="flex flex-col gap-0.5 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="font-medium">
                    {i.channel?.name ?? MARKETPLACES[i.marketplace as keyof typeof MARKETPLACES] ?? "Marketplace"}
                    {i.file_name ? <span className="font-normal text-muted-foreground"> · {i.file_name}</span> : null}
                  </p>
                  <time dateTime={i.created_at} className="text-xs text-muted-foreground">
                    {formatDateTime(i.created_at, shop.timezone)}
                  </time>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatCount(i.orders_created)} masuk · {formatCount(i.orders_canceled)} batal/retur · {formatCount(i.orders_duplicate)} sudah ada
                  {i.orders_failed > 0 ? ` · ${formatCount(i.orders_failed)} gagal` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
