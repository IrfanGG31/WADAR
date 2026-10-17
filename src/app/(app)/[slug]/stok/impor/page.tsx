import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/states/page-skeleton";
import { listCatalogImports } from "@/db/catalog-imports";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { ImportClient } from "./import-client";
import { ImportHistory } from "./import-history";

export const metadata = { title: "Impor katalog" };

type Params = PageProps<"/[slug]/stok/impor">["params"];

export default function ImportPage({ params }: PageProps<"/[slug]/stok/impor">) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Suspense fallback={<PageSkeleton title="Impor katalog" shape="form" />}>
        <Import params={params} />
      </Suspense>
    </div>
  );
}

async function Import({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const imports = await listCatalogImports(shop.id);
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
        <h1 className="text-2xl font-semibold tracking-tight">Impor katalog dari CSV</h1>
      </div>
      <ImportClient slug={slug} />
      <ImportHistory imports={imports} timeZone={shop.timezone} />
    </>
  );
}
