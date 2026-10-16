import { Suspense } from "react";
import { PageTabsSkeleton } from "@/components/shell/page-tabs";
import { listCatalog } from "@/db/catalog";
import { listChannels } from "@/db/channels";
import { getShop } from "@/db/shop";
import { KasirTabs } from "./kasir-tabs";
import { type PosItem, PosScreen } from "./pos-screen";

export const metadata = { title: "Kasir" };

type Params = PageProps<"/[slug]/kasir">["params"];

export default function KasirPage({ params }: PageProps<"/[slug]/kasir">) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Transaksi</h1>
      <Suspense fallback={<PosSkeleton />}>
        <Pos params={params} />
      </Suspense>
    </div>
  );
}

async function Pos({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const [catalog, channels] = await Promise.all([listCatalog(shop.id), listChannels(shop.id)]);
  const items: PosItem[] = catalog
    .filter((p) => p.is_active)
    .flatMap((p) =>
      p.variants.map((v) => ({
        variantId: v.id,
        name: p.name,
        option: v.option_label,
        category: p.category,
        unit: p.unit,
        price: Number(v.price),
        onHand: v.on_hand,
      })),
    );
  return (
    <>
      <KasirTabs slug={slug} active="kasir" />
      <PosScreen
        slug={slug}
        items={items}
        channels={channels.map((c) => ({ id: c.id, kind: c.kind, name: c.name, feePct: c.fee_pct, feeFixed: c.fee_fixed }))}
      />
    </>
  );
}

function PosSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <PageTabsSkeleton />
      <div className="h-11 animate-pulse rounded-md bg-muted" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
