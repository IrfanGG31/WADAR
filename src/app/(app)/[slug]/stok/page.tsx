import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { listCatalog } from "@/db/catalog";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { StockList, type StockRow } from "./stock-list";

export const metadata = { title: "Stok" };

type Params = PageProps<"/[slug]/stok">["params"];

export default function StokPage({ params }: PageProps<"/[slug]/stok">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Stok</h1>
        <Suspense fallback={<div className="h-11 w-36 rounded-md bg-muted" />}>
          <AddProductButton params={params} />
        </Suspense>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <StockProducts params={params} />
      </Suspense>
    </div>
  );
}

async function AddProductButton({ params }: { params: Params }) {
  const { slug } = await params;
  return (
    <Button asChild>
      <Link href={shopPath(slug, "stok/produk/baru")}>
        <Plus className="h-4 w-4" />
        Tambah produk
      </Link>
    </Button>
  );
}

async function StockProducts({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const catalog = await listCatalog(shop.id);
  const rows: StockRow[] = catalog.flatMap((product) =>
    product.variants.map((variant) => ({
      productId: product.id,
      variantId: variant.id,
      name: product.name,
      option: variant.option_label,
      category: product.category,
      unit: product.unit,
      onHand: variant.on_hand,
      minStock: variant.min_stock,
      costIsSet: variant.cost_is_set,
    })),
  );
  return <StockList slug={slug} rows={rows} />;
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-11 w-72 rounded-md bg-muted" />
      <div className="h-96 rounded-xl border border-border" />
    </div>
  );
}
