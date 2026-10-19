import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageGate } from "@/components/shell/page-gate";
import { listDocs } from "@/db/kb";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { DocManager } from "./doc-manager";

export const metadata = { title: "Dokumen asisten" };

type Params = PageProps<"/[slug]/pengaturan/dokumen">["params"];

/** KB-2: documents the chat assistant may quote to buyers, next to FAQ and store policies. */
export default function DokumenPage({ params }: PageProps<"/[slug]/pengaturan/dokumen">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Suspense fallback={<div className="h-11 w-28" aria-hidden />}>
          <BackLink params={params} />
        </Suspense>
        <h1 className="text-2xl font-semibold tracking-tight">Dokumen asisten</h1>
        <p className="text-sm text-muted-foreground">
          Panduan ukuran, cara pakai, SOP pengiriman, garansi — asisten chat membaca ini saat menjawab pembeli.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden />}>
        <PageGate params={params} permission="settings">
          <Docs params={params} />
        </PageGate>
      </Suspense>
    </div>
  );
}

async function BackLink({ params }: { params: Params }) {
  const { slug } = await params;
  return (
    <Link href={shopPath(slug, "pengaturan")} className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="h-4 w-4" aria-hidden /> Pengaturan
    </Link>
  );
}

async function Docs({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  return <DocManager docs={await listDocs(shop.id)} />;
}
