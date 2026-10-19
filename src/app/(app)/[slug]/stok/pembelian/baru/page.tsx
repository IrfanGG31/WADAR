import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageGate } from "@/components/shell/page-gate";
import { listPurchasableVariants, listSuppliers } from "@/db/purchasing";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { PurchaseForm } from "../purchase-form";

export const metadata = { title: "Pesanan pembelian baru" };

type Params = PageProps<"/[slug]/stok/pembelian/baru">["params"];

export default function NewPurchasePage({ params }: PageProps<"/[slug]/stok/pembelian/baru">) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Suspense fallback={<div className="h-11 w-28" aria-hidden />}>
          <BackLink params={params} />
        </Suspense>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">Pesanan pembelian baru</h1>
        <p className="text-sm text-muted-foreground">Tersimpan sebagai draf dulu. Setelah kamu setujui, pesanannya bisa dikirim ke pemasok lewat WhatsApp.</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" aria-hidden />}>
        <PageGate params={params} permission="purchase">
          <Form params={params} />
        </PageGate>
      </Suspense>
    </div>
  );
}

async function BackLink({ params }: { params: Params }) {
  const { slug } = await params;
  return (
    <Link href={shopPath(slug, "stok/pembelian")} className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="h-4 w-4" aria-hidden /> Pembelian
    </Link>
  );
}

async function Form({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const [suppliers, variants] = await Promise.all([listSuppliers(shop.id), listPurchasableVariants(shop.id)]);
  return <PurchaseForm suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} variants={variants} />;
}
