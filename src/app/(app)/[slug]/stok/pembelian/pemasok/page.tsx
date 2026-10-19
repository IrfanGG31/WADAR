import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageGate } from "@/components/shell/page-gate";
import { listSuppliers } from "@/db/purchasing";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { SupplierManager } from "./supplier-manager";

export const metadata = { title: "Pemasok" };

type Params = PageProps<"/[slug]/stok/pembelian/pemasok">["params"];

/** Pemasok: name and WhatsApp number. Which product comes from whom is learned from receipts. */
export default function SuppliersPage({ params }: PageProps<"/[slug]/stok/pembelian/pemasok">) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Suspense fallback={<div className="h-11 w-28" aria-hidden />}>
          <BackLink params={params} />
        </Suspense>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">Pemasok</h1>
        <p className="text-sm text-muted-foreground">
          Cukup nama dan nomor WhatsApp. Produk mana dari pemasok mana dipelajari otomatis dari barang yang kamu terima, jadi Autopilot tahu harus pesan ke siapa.
        </p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted" aria-hidden />}>
        <PageGate params={params} permission="purchase">
          <List params={params} />
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

async function List({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  return <SupplierManager suppliers={await listSuppliers(shop.id)} />;
}
