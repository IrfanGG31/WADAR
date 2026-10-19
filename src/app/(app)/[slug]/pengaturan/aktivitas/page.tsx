import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageGate } from "@/components/shell/page-gate";
import { describeAudit } from "@/core/audit";
import { listAudit } from "@/db/audit";
import { getShop } from "@/db/shop";
import { formatDateTime } from "@/lib/format-date";
import { shopPath } from "@/lib/routes";

export const metadata = { title: "Riwayat aktivitas" };

type Params = PageProps<"/[slug]/pengaturan/aktivitas">["params"];

/**
 * POS-5: who did the sensitive things — void, price change, stock adjustment/opname, commission,
 * staff role, expense void, data export. Written by the database itself (triggers/RPCs), owner-only.
 */
export default function AktivitasPage({ params }: PageProps<"/[slug]/pengaturan/aktivitas">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <BackLink params={params} />
        <h1 className="text-2xl font-semibold tracking-tight">Riwayat aktivitas</h1>
        <p className="text-sm text-muted-foreground">
          Pembatalan transaksi, ubah harga, penyesuaian stok, ubah peran, dan unduhan data tercatat otomatis. Tidak bisa diubah atau dihapus.
        </p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden />}>
        <PageGate params={params} permission="settings">
          <Entries params={params} />
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

async function Entries({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const entries = await listAudit(shop.id);
  if (entries.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
        Belum ada aktivitas penting yang tercatat.
      </p>
    );
  }
  return (
    <ol className="divide-y divide-border rounded-xl border border-border bg-card">
      {entries.map((e) => {
        const { title, detail } = describeAudit(e, e.subject);
        return (
          <li key={e.id} className="flex flex-col gap-0.5 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <p className="font-medium">{title}</p>
              <time dateTime={e.created_at} className="text-xs text-muted-foreground tabular-nums">
                {formatDateTime(e.created_at, shop.timezone)}
              </time>
            </div>
            {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
            <p className="text-xs text-muted-foreground">oleh {e.actor ?? (e.actor_id ? "anggota yang sudah keluar" : "sistem")}</p>
          </li>
        );
      })}
    </ol>
  );
}
