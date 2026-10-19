import { Bot, ClipboardCheck, MessageCircleQuestion, PackagePlus, Settings2 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CopyButton } from "@/components/copy-button";
import { PageGate } from "@/components/shell/page-gate";
import { Button } from "@/components/ui/button";
import { supplierMessage } from "@/core/agent";
import { formatCount } from "@/core/number-format";
import { getAgentSettings, listOpenAgentTasks } from "@/db/agent";
import { isConnectHubInstalled } from "@/db/ai-provider";
import { getShop } from "@/db/shop";
import { formatDateTime } from "@/lib/format-date";
import { shopPath } from "@/lib/routes";
import { SchemaPendingNotice } from "../pengaturan/koneksi/schema-pending-notice";
import { TaskActions } from "./task-actions";

export const metadata = { title: "Autopilot" };

type Params = PageProps<"/[slug]/autopilot">["params"];

/** Autopilot inbox (ADR-003): what the agent prepared; one tap to finish, ignored ones stay ignored. */
export default function AutopilotPage({ params }: PageProps<"/[slug]/autopilot">) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-navy">
          <Bot className="h-6 w-6 text-primary" aria-hidden />
          Autopilot
        </h1>
        <p className="text-sm text-muted-foreground">Disiapkan agent dari data tokomu. Yang sudah tidak perlu (stok sudah datang, FAQ sudah ada) hilang sendiri.</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" aria-hidden />}>
        <PageGate params={params} permission="settings">
          <Inbox params={params} />
        </PageGate>
      </Suspense>
    </div>
  );
}

async function Inbox({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const [installed, settings, tasks] = await Promise.all([isConnectHubInstalled(), getAgentSettings(shop.id), listOpenAgentTasks(shop.id)]);
  // Pembelian (ADR-005): a restock that became a draft purchase order is approved on the order page.
  const orderTasks = tasks.filter((t) => t.kind === "reorder" && t.payload.po_id);
  const reorders = tasks.filter((t) => t.kind === "reorder" && !t.payload.po_id);
  const faqs = tasks.filter((t) => t.kind === "faq");
  const items = reorders.map((t) => ({ item: String(t.payload.item ?? t.title), qty: Number(t.payload.qty ?? 0), unit: String(t.payload.unit ?? "pcs") }));
  const message = items.length ? supplierMessage(shop.name, items) : "";

  return (
    <div className="flex flex-col gap-6">
      {!installed && <SchemaPendingNotice />}
      {installed && !settings.enabled && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Autopilot sedang mati.{" "}
          <Link href={`${shopPath(slug, "pengaturan/koneksi")}#agent`} className="font-medium underline">
            Nyalakan di Pusat Koneksi
          </Link>
          .
        </p>
      )}

      {orderTasks.length > 0 && (
        <section className="rounded-2xl border border-border p-5" aria-labelledby="draf-pembelian">
          <h2 id="draf-pembelian" className="flex items-center gap-2 font-semibold">
            <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden />
            Pesanan pembelian menunggu persetujuan ({formatCount(orderTasks.length)})
          </h2>
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {orderTasks.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-sm text-muted-foreground">{t.body}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm">
                    <Link href={shopPath(slug, `stok/pembelian/${String(t.payload.po_id)}`)}>Buka & setujui</Link>
                  </Button>
                  <TaskActions taskIds={[t.id]} doneLabel="Sudah diurus" primary={false} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-border p-5" aria-labelledby="pesan-ulang">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="pesan-ulang" className="flex items-center gap-2 font-semibold">
            <PackagePlus className="h-5 w-5 text-primary" aria-hidden />
            Pesan ulang ke pemasok ({formatCount(reorders.length)})
          </h2>
          {reorders.length > 0 && <TaskActions taskIds={reorders.map((t) => t.id)} doneLabel="Sudah dipesan semua" />}
        </div>
        {reorders.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Tidak ada produk yang perlu dipesan sekarang.</p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <ul className="divide-y divide-border rounded-xl border border-border">
              {reorders.map((t) => (
                <li key={t.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{String(t.payload.item ?? t.title)}</p>
                    <p className="shrink-0 font-semibold tabular-nums text-navy">
                      +{formatCount(Number(t.payload.qty ?? 0))} {String(t.payload.unit ?? "")}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">{t.body}</p>
                  <TaskActions taskIds={[t.id]} doneLabel="Sudah dipesan" primary={false} />
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3 rounded-xl bg-surface p-4">
              <p className="text-sm font-medium">Pesan untuk pemasok</p>
              <p className="whitespace-pre-wrap rounded-lg bg-background p-3 text-sm leading-relaxed">{message}</p>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={message} label="Salin pesan" />
                <Button asChild size="sm">
                  <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
                    Kirim lewat WhatsApp
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Setelah barang datang, catat di Stok › Stok masuk. Tugasnya selesai sendiri saat stok cukup.</p>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border p-5" aria-labelledby="faq-baru">
        <h2 id="faq-baru" className="flex items-center gap-2 font-semibold">
          <MessageCircleQuestion className="h-5 w-5 text-primary" aria-hidden />
          Usulan FAQ ({formatCount(faqs.length)})
        </h2>
        {faqs.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Belum ada pertanyaan pembeli yang tidak bisa dijawab.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
            {faqs.map((t) => (
              <li key={t.id} className="flex flex-col gap-2 p-4">
                <p className="text-sm">&ldquo;{t.body}&rdquo;</p>
                <p className="text-xs text-muted-foreground">Ditanyakan pembeli · disiapkan {formatDateTime(t.created_at, shop.timezone)}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={shopPath(slug, `chat/${String(t.payload.conversation_id)}`)}>Buka chat & jadikan FAQ</Link>
                  </Button>
                  <TaskActions taskIds={[t.id]} doneLabel="Sudah dijawab" primary={false} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href={`${shopPath(slug, "pengaturan/koneksi")}#agent`}
        className="inline-flex w-fit items-center gap-2 text-sm font-medium text-primary hover:underline"
      >
        <Settings2 className="h-4 w-4" aria-hidden /> Atur Autopilot
      </Link>
    </div>
  );
}
