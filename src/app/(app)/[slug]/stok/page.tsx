import { FileUp, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageTabsSkeleton } from "@/components/shell/page-tabs";
import { Button } from "@/components/ui/button";
import { getShop } from "@/db/shop";
import { listStockForecasts } from "@/db/stock";
import { shopPath } from "@/lib/routes";
import { StockList, type StockRow } from "./stock-list";
import { StokTabs, ToKeuanganLink } from "./stok-tabs";

export const metadata = { title: "Stok" };

type Params = PageProps<"/[slug]/stok">["params"];

export default function StokPage({ params }: PageProps<"/[slug]/stok">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Stok</h1>
        <Suspense fallback={<div className="h-11 w-36 animate-pulse rounded-md bg-muted" />}>
          <AddProductButton params={params} />
        </Suspense>
      </div>
      <Suspense fallback={<PageTabsSkeleton />}>
        <Tabs params={params} />
      </Suspense>
      <Suspense fallback={<ListSkeleton />}>
        <StockProducts params={params} />
      </Suspense>
    </div>
  );
}

async function AddProductButton({ params }: { params: Params }) {
  const { slug } = await params;
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <ToKeuanganLink slug={slug} />
      <Button asChild variant="outline">
        <Link href={shopPath(slug, "stok/impor")}>
          <FileUp className="h-4 w-4" aria-hidden />
          Impor CSV
        </Link>
      </Button>
      <Button asChild>
        <Link href={shopPath(slug, "stok/produk/baru")}>
          <Plus className="h-4 w-4" aria-hidden />
          Tambah produk
        </Link>
      </Button>
    </div>
  );
}

async function Tabs({ params }: { params: Params }) {
  const { slug } = await params;
  return <StokTabs slug={slug} active="stok" />;
}

async function StockProducts({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const forecasts = await listStockForecasts(shop.id);
  const rows: StockRow[] = forecasts.map((f) => ({
    productId: f.product_id,
    variantId: f.variant_id,
    name: f.product_name,
    option: f.option_label,
    category: f.category,
    unit: f.unit,
    onHand: f.on_hand,
    minStock: f.min_stock,
    costIsSet: f.cost_is_set,
    status: f.status,
    rate: f.rate,
    stockoutInDays: f.stockout_in_days,
    reorderQty: f.reorder_qty,
  }));
  return <StockList slug={slug} rows={rows} />;
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat stok produk" className="flex flex-col gap-3">
      <div className="h-11 w-full animate-pulse rounded-md bg-muted" />
      <div className="h-11 w-72 max-w-full animate-pulse rounded-full bg-muted" />
      <div className="flex flex-col gap-2">
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
        <div className="h-16 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}
