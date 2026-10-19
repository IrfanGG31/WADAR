import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageGate } from "@/components/shell/page-gate";
import { listAllChannels } from "@/db/channels";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { ChannelEditor } from "./channel-editor";

export const metadata = { title: "Kanal & komisi" };

type Params = PageProps<"/[slug]/pengaturan/kanal">["params"];

/** FIN-2: where the shop sells and what each marketplace takes; feeds margin per kanal and Konsultasi. */
export default function KanalPage({ params }: PageProps<"/[slug]/pengaturan/kanal">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Suspense fallback={<div className="h-11 w-28" aria-hidden />}>
          <BackLink params={params} />
        </Suspense>
        <h1 className="text-2xl font-semibold tracking-tight">Kanal & komisi</h1>
        <p className="text-sm text-muted-foreground">
          Komisi dipakai untuk menghitung untung per kanal. Nilai awal hanya perkiraan, cek tarif sebenarnya di akun seller-mu.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden />}>
        <PageGate params={params} permission="settings">
          <Channels params={params} />
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

async function Channels({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  return <ChannelEditor channels={await listAllChannels(shop.id)} />;
}
