import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/states/page-skeleton";
import { getProduct, listCatalog, variantLabel } from "@/db/catalog";
import { getShop } from "@/db/shop";
import { getVariantExpiries } from "@/db/stock";
import { shopPath } from "@/lib/routes";
import { ArchiveButton } from "../../archive-button";
import { ExpiryForm } from "../../expiry-form";
import { ProductForm } from "../../product-form";
import { StockInForm } from "../../stock-in-form";
import { PageGate } from "@/components/shell/page-gate";

export const metadata = { title: "Ubah produk" };

type Params = PageProps<"/[slug]/stok/produk/[id]">["params"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function EditProductPage({ params }: PageProps<"/[slug]/stok/produk/[id]">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Suspense fallback={<PageSkeleton title="Ubah produk" shape="form" />}>
        <PageGate params={params} permission="catalog">
          <EditProduct params={params} />
        </PageGate>
      </Suspense>
    </div>
  );
}

async function EditProduct({ params }: { params: Params }) {
  const { slug, id } = await params;
  if (!UUID.test(id)) notFound();
  const shop = await getShop(slug);
  const [product, catalog] = await Promise.all([getProduct(shop.id, id), listCatalog(shop.id)]);
  if (!product) notFound();
  const expiries = await getVariantExpiries(shop.id, product.variants.map((v) => v.id));
  const categories = [...new Set(catalog.map((p) => p.category).filter((c): c is string => !!c))].sort();

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link
          href={shopPath(slug, "stok")}
          className="inline-flex min-h-11 w-fit items-center gap-1 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Stok
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>
      </div>
      <StockInForm
        variants={product.variants.map((v) => ({
          id: v.id,
          label: variantLabel(product, v),
          unit: product.unit,
          avgCost: Number(v.avg_cost),
          costIsSet: v.cost_is_set,
          packSize: v.pack_size,
        }))}
      />
      <ProductForm
        slug={slug}
        productId={product.id}
        categories={categories}
        initial={{
          name: product.name,
          category: product.category ?? "",
          description: product.description ?? "",
          unit: product.unit,
          image_path: product.image_path ?? "",
          variants: product.variants.map((v) => ({
            key: v.id,
            id: v.id,
            option_label: v.option_label ?? "",
            sku: v.sku ?? "",
            price: Number(v.price),
            cost: v.cost_is_set ? Number(v.avg_cost) : 0,
            min_stock: v.min_stock,
            lead_time_days: v.lead_time_days,
            pack_size: v.pack_size,
            initial_qty: 0,
            on_hand: v.on_hand,
          })),
        }}
      />
      <ExpiryForm
        slug={slug}
        variants={product.variants.map((v) => ({ id: v.id, label: variantLabel(product, v), expiresOn: expiries[v.id] ?? null }))}
      />
      <ArchiveButton slug={slug} productId={product.id} />
    </>
  );
}
