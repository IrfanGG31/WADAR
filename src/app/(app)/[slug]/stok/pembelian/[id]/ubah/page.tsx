import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { PageGate } from "@/components/shell/page-gate";
import { getPurchaseOrder, listPurchasableVariants, listSuppliers } from "@/db/purchasing";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { PurchaseForm } from "../../purchase-form";

export const metadata = { title: "Ubah draf pembelian" };

type Params = PageProps<"/[slug]/stok/pembelian/[id]/ubah">["params"];

export default function EditPurchasePage({ params }: PageProps<"/[slug]/stok/pembelian/[id]/ubah">) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Suspense fallback={<div className="h-11 w-28" aria-hidden />}>
        <BackLink params={params} />
      </Suspense>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" aria-hidden />}>
        <PageGate params={params} permission="purchase">
          <Form params={params} />
        </PageGate>
      </Suspense>
    </div>
  );
}

async function BackLink({ params }: { params: Params }) {
  const { slug, id } = await params;
  return (
    <Link href={shopPath(slug, `stok/pembelian/${id}`)} className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeft className="h-4 w-4" aria-hidden /> Kembali ke pesanan
    </Link>
  );
}

async function Form({ params }: { params: Params }) {
  const { slug, id } = await params;
  const shop = await getShop(slug);
  const [po, suppliers, variants] = await Promise.all([getPurchaseOrder(shop.id, id), listSuppliers(shop.id), listPurchasableVariants(shop.id)]);
  if (!po) notFound();
  if (po.order.status !== "draft") redirect(shopPath(slug, `stok/pembelian/${id}`));
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-navy">Ubah draf {po.order.number}</h1>
      <PurchaseForm
        poId={id}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        variants={variants}
        initial={{
          supplier_id: po.order.supplier_id,
          note: po.order.note ?? "",
          lines: po.lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty, unit_cost: l.unit_cost })),
        }}
      />
    </>
  );
}
