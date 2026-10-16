import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/states/page-skeleton";
import { listCatalog } from "@/db/catalog";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { newVariant } from "../../product-draft";
import { ProductForm } from "../../product-form";

export const metadata = { title: "Tambah produk" };

type Params = PageProps<"/[slug]/stok/produk/baru">["params"];

export default function NewProductPage({ params }: PageProps<"/[slug]/stok/produk/baru">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Suspense fallback={<PageSkeleton title="Tambah produk" shape="form" />}>
        <NewProduct params={params} />
      </Suspense>
    </div>
  );
}

async function NewProduct({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const catalog = await listCatalog(shop.id);
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
        <h1 className="text-2xl font-semibold tracking-tight">Tambah produk</h1>
      </div>
      <ProductForm
        slug={slug}
        productId={null}
        categories={categories}
        initial={{ name: "", category: "", description: "", unit: "pcs", image_path: "", variants: [newVariant("first")] }}
      />
    </>
  );
}
