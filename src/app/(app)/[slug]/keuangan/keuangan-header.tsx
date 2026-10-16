import { Suspense } from "react";
import { PageTabsSkeleton } from "@/components/shell/page-tabs";
import { KeuanganTabs, ToStokLink } from "./keuangan-tabs";

type Params = Promise<{ slug: string }>;
type Active = Parameters<typeof KeuanganTabs>[0]["active"];

/** Title + "Lihat stok" (phones) + Ringkasan · Margin · Detail tabs, shared by the three Keuangan pages. */
export function KeuanganHeader({ params, active }: { params: Params; active: Active }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Keuangan</h1>
        <Suspense fallback={<div className="h-5 w-20 animate-pulse rounded bg-muted md:hidden" aria-hidden />}>
          <StokLink params={params} />
        </Suspense>
      </div>
      <Suspense fallback={<PageTabsSkeleton />}>
        <Tabs params={params} active={active} />
      </Suspense>
    </>
  );
}

async function StokLink({ params }: { params: Params }) {
  const { slug } = await params;
  return <ToStokLink slug={slug} />;
}

async function Tabs({ params, active }: { params: Params; active: Active }) {
  const { slug } = await params;
  return <KeuanganTabs slug={slug} active={active} />;
}
