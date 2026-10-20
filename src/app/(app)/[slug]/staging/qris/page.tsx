import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageGate } from "@/components/shell/page-gate";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { QrisSimulator } from "./qris-simulator";

export const metadata = { title: "QRIS Dinamis (simulasi)" };

export default function QrisPage({ params }: PageProps<"/[slug]/staging/qris">) {
  return (
    <div className="page-in flex flex-col gap-5">
      <Suspense fallback={<div className="h-[32rem] animate-pulse rounded-2xl bg-muted" aria-hidden />}>
        <PageGate params={params} permission="settings">
          <Body params={params} />
        </PageGate>
      </Suspense>
    </div>
  );
}

async function Body({ params }: { params: PageProps<"/[slug]/staging/qris">["params"] }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href={shopPath(slug, "staging")} className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Ruang Demo
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">QRIS Dinamis + suara</h1>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Simulasi untuk presentasi. QR ini memakai ID merchant contoh: dipindai pun tidak memotong saldo. Pembayaran asli butuh mitra pembayaran
          (Midtrans/Xendit) dan masuk rencana fase berikutnya.
        </p>
      </div>
      <QrisSimulator shopName={shop.name} />
    </>
  );
}
