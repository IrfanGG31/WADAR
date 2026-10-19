import { Bot, CheckCircle2, ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageGate } from "@/components/shell/page-gate";
import { formatRupiah } from "@/core/money";
import { formatCount } from "@/core/number-format";
import { formatPhone } from "@/core/phone";
import { billAmount, overpaidAmount, purchaseOrderMessage, sumLines, whatsappLink } from "@/core/purchasing";
import { can } from "@/core/roles";
import { getMyRole } from "@/db/access";
import { getPurchaseOrder } from "@/db/purchasing";
import { getShop } from "@/db/shop";
import { formatDateTime } from "@/lib/format-date";
import { shopPath } from "@/lib/routes";
import { OrderActions, PayForm, ReceiveForm } from "../order-controls";
import { PurchaseStatusBadge } from "../status-badge";

export const metadata = { title: "Pesanan pembelian" };

type Params = PageProps<"/[slug]/stok/pembelian/[id]">["params"];

export default function PurchaseOrderPage({ params }: PageProps<"/[slug]/stok/pembelian/[id]">) {
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Suspense fallback={<div className="h-11 w-28" aria-hidden />}>
        <BackLink params={params} />
      </Suspense>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" aria-hidden />}>
        <PageGate params={params} permission="stock_in">
          <Order params={params} />
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

async function Order({ params }: { params: Params }) {
  const { slug, id } = await params;
  const shop = await getShop(slug);
  const [po, role] = await Promise.all([getPurchaseOrder(shop.id, id), getMyRole(shop.id)]);
  if (!po) notFound();
  const { order: o, lines, payments } = po;
  const owner = can(role, "purchase");
  const open = o.status === "ordered" || o.status === "partial";
  const message = purchaseOrderMessage(
    shop.name,
    o.number,
    lines.map((l) => ({ title: l.title, qty: l.qty, unit: l.unit, unit_cost: l.unit_cost })),
    o.note,
  );
  const remaining = lines.map((l) => ({ ...l, remaining: Math.max(l.qty - l.received_qty, 0) })).filter((l) => l.remaining > 0);
  const bill = billAmount(o);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-navy">{o.number}</h1>
          <PurchaseStatusBadge status={o.status} />
          {o.source === "autopilot" && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Bot className="h-3.5 w-3.5" aria-hidden /> Disiapkan Autopilot
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {o.supplier_name ?? "Pemasok belum dipilih"}
          {o.supplier_phone && ` · ${formatPhone(o.supplier_phone)}`} · dibuat {formatDateTime(o.created_at, shop.timezone)}
          {o.ordered_at && ` · dipesan ${formatDateTime(o.ordered_at, shop.timezone)}`}
          {o.received_at && ` · diterima ${formatDateTime(o.received_at, shop.timezone)}`}
        </p>
        {o.note && <p className="text-sm">Catatan: {o.note}</p>}
        {o.status === "draft" && !o.supplier_id && owner && (
          <p className="text-sm text-amber-800">Pilih pemasok dulu (Ubah) supaya pesanan bisa dikirim lewat WhatsApp.</p>
        )}
      </div>

      <OrderActions
        id={o.id}
        status={o.status}
        canPurchase={owner}
        whatsappHref={owner ? whatsappLink(o.supplier_phone, message) : null}
      />

      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border sm:hidden">
        {lines.map((l) => (
          <li key={l.id} className="flex flex-col gap-0.5 p-3 text-sm">
            <span className="font-medium [overflow-wrap:anywhere]">{l.title}</span>
            <span className="text-muted-foreground">
              Dipesan {formatCount(l.qty)} {l.unit} · datang {formatCount(l.received_qty)}
              {owner && ` · ${formatRupiah(l.unit_cost)}/${l.unit}`}
            </span>
            {owner && <span className="tabular-nums">{formatRupiah(sumLines([l]))}</span>}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Barang</th>
              <th className="px-3 py-2 text-right font-medium">Dipesan</th>
              <th className="px-3 py-2 text-right font-medium">Datang</th>
              {owner && <th className="px-3 py-2 text-right font-medium">Modal / unit</th>}
              {owner && <th className="px-3 py-2 text-right font-medium">Subtotal</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2 [overflow-wrap:anywhere]">{l.title}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCount(l.qty)} {l.unit}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCount(l.received_qty)}</td>
                {owner && <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(l.unit_cost)}</td>}
                {owner && <td className="px-3 py-2 text-right tabular-nums">{formatRupiah(sumLines([l]))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {owner && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Total pesanan", formatRupiah(o.total)],
            ["Barang diterima", formatRupiah(o.received_total)],
            ["Sudah dibayar", formatRupiah(o.paid_total)],
            ["Sisa tagihan", formatRupiah(o.outstanding)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border p-3">
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-lg font-semibold tabular-nums text-navy">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {open && remaining.length > 0 && (
        <section className="rounded-2xl border border-border p-5">
          {/* key: after a partial receipt the form starts again from what is still expected. */}
          <ReceiveForm
            key={remaining.map((l) => `${l.variant_id}:${l.remaining}`).join(",")}
            id={o.id}
            lines={remaining.map((l) => ({ variant_id: l.variant_id, title: l.title, unit: l.unit, remaining: l.remaining, unit_cost: l.unit_cost }))}
          />
        </section>
      )}

      {owner && o.status !== "draft" && o.status !== "canceled" && (o.outstanding > 0 || payments.length > 0) && (
        <section className="flex flex-col gap-4 rounded-2xl border border-border p-5">
          {/* key: a new bill (goods arrived, part paid) starts the form from the new remaining amount. */}
          {o.outstanding > 0 ? (
            <PayForm key={o.outstanding} id={o.id} outstanding={o.outstanding} />
          ) : (
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Lunas
              {overpaidAmount(o) > 0 && (
                <span className="font-normal text-muted-foreground">· lebih bayar {formatRupiah(overpaidAmount(o))}, jadi saldo di pemasok</span>
              )}
            </p>
          )}
          {o.status === "ordered" && o.outstanding > 0 && (
            <p className="text-xs text-muted-foreground">Barang belum datang: membayar sekarang dicatat sebagai uang muka ke pemasok (tagihan {formatRupiah(bill)}).</p>
          )}
          {payments.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">
                    {formatDateTime(p.paid_at, shop.timezone)} · {p.method}
                  </span>
                  <span className="tabular-nums">{formatRupiah(p.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
