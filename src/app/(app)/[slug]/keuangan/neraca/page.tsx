import { CheckCircle2, CircleAlert } from "lucide-react";
import { Suspense } from "react";
import { PageGate } from "@/components/shell/page-gate";
import { balanceSheet, ENTRY_SOURCE_LABEL, profitAndLoss, shelfStock, stockReconciliation, type StatementLine } from "@/core/ledger";
import { formatRupiah, formatSignedRupiah } from "@/core/money";
import { getJournalView } from "@/db/journal";
import { getShop } from "@/db/shop";
import { formatIsoDate } from "@/lib/format-date";
import { shopToday } from "@/lib/shop-today";
import { cn } from "@/lib/utils";
import { KeuanganHeader } from "../keuangan-header";

export const metadata = { title: "Neraca & Jurnal" };

type Params = PageProps<"/[slug]/keuangan/neraca">["params"];

/**
 * Neraca & Jurnal (ADR-006): the double-entry ledger WADAR keeps by itself from sales, expenses,
 * purchases and stock — position today, profit this month, and the latest entries.
 */
export default function NeracaPage({ params, searchParams }: PageProps<"/[slug]/keuangan/neraca">) {
  return (
    <div className="flex flex-col gap-6">
      <KeuanganHeader params={params} searchParams={searchParams} active="keuangan/neraca" />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden />}>
        <PageGate params={params} permission="finance">
          <Ledger params={params} />
        </PageGate>
      </Suspense>
    </div>
  );
}

function Lines({ lines, total, totalLabel, signed }: { lines: StatementLine[]; total?: number; totalLabel?: string; signed?: boolean }) {
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {lines.map((l) => (
        <div key={l.code} className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{l.name}</dt>
          <dd className="tabular-nums">{signed && l.amount < 0 ? formatSignedRupiah(l.amount) : formatRupiah(l.amount)}</dd>
        </div>
      ))}
      {total !== undefined && (
        <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
          <dt>{totalLabel}</dt>
          <dd className="tabular-nums text-navy">{formatRupiah(total)}</dd>
        </div>
      )}
    </dl>
  );
}

async function Ledger({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const today = await shopToday(shop.timezone);
  const monthStart = `${today.slice(0, 8)}01`;
  const view = await getJournalView(shop.id, monthStart, today);

  if (!view.installed) {
    return (
      <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Neraca & jurnal sedang disiapkan: pembaruan database belum diterapkan. Ringkasan, margin, dan pengeluaran tetap berjalan seperti biasa.
      </p>
    );
  }

  const bs = balanceSheet(view.balances);
  const pl = profitAndLoss(view.balances);
  const ledgerStock = bs.assets.find((a) => a.code === "1-1300")?.amount ?? 0;
  const shelf = shelfStock(view.shelf);
  const stock = stockReconciliation(ledgerStock, shelf.value, shelf.units);
  const names = new Map(view.balances.map((b) => [b.account_code, b.name]));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Dibukukan otomatis dari penjualan, pengeluaran, pembelian, dan stok. Setiap catatan punya debit = kredit; yang salah dibalik, tidak dihapus.
      </p>

      <section className="flex flex-col gap-4 rounded-xl border border-border p-5" aria-labelledby="posisi">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="posisi" className="text-lg font-semibold text-navy">
            Posisi hari ini
          </h2>
          <span className={cn("inline-flex items-center gap-1 text-sm font-medium", bs.balanced ? "text-emerald-700" : "text-destructive")}>
            {bs.balanced ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <CircleAlert className="h-4 w-4" aria-hidden />}
            {bs.balanced ? "Seimbang" : "Tidak seimbang"}
          </span>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Yang dimiliki</p>
            <Lines lines={bs.assets} total={bs.totalAssets} totalLabel="Total aset" signed />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sumbernya</p>
            <Lines
              lines={[...bs.liabilities, ...bs.equity, { code: "laba", name: "Laba sejak awal", amount: bs.retainedProfit }]}
              total={bs.totalLiabilitiesAndEquity}
              totalLabel="Total kewajiban & modal"
              signed
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Kas & bank = uang masuk dan keluar yang tercatat di WADAR. Saldo kas sebelum memakai WADAR belum dicatat, jadi angkanya bisa minus.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-xl border border-border p-5" aria-labelledby="laba-rugi">
          <h2 id="laba-rugi" className="font-semibold text-navy">
            Laba rugi bulan ini
          </h2>
          <Lines lines={pl.revenue} />
          <Lines lines={pl.expenses.filter((e) => e.amount !== 0).map((e) => ({ ...e, amount: -e.amount }))} signed />
          <div className="flex justify-between gap-3 border-t border-border pt-2 text-sm font-semibold">
            <span>Laba bersih</span>
            <span className={cn("tabular-nums", pl.netProfit < 0 ? "text-destructive" : "text-navy")}>{pl.netProfit < 0 ? formatSignedRupiah(pl.netProfit) : formatRupiah(pl.netProfit)}</span>
          </div>
          <p className="text-xs text-muted-foreground">Penjualan dan HPP sama dengan angka di Ringkasan untuk hari yang sama.</p>
        </section>

        <section className="flex flex-col gap-3 rounded-xl border border-border p-5" aria-labelledby="nilai-stok">
          <h2 id="nilai-stok" className="font-semibold text-navy">
            Nilai stok
          </h2>
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Menurut jurnal</dt>
              <dd className="tabular-nums">{formatRupiah(ledgerStock)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Stok di rak × HPP rata-rata</dt>
              <dd className="tabular-nums">{formatRupiah(shelf.value)}</dd>
            </div>
          </dl>
          <p className={cn("text-sm", stock.withinRounding ? "text-emerald-700" : "text-amber-800")}>
            {stock.difference === 0
              ? "Cocok."
              : stock.withinRounding
                ? `Selisih ${formatSignedRupiah(stock.difference)} dari pembulatan HPP rata-rata. Wajar.`
                : `Selisih ${formatSignedRupiah(stock.difference)}. Ada stok yang dicatat tanpa harga modal; isi modalnya di Stok masuk.`}
          </p>
        </section>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="jurnal">
        <h2 id="jurnal" className="font-semibold text-navy">
          Jurnal terbaru
        </h2>
        {view.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada catatan.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
            {view.recent.map((e) => (
              <li key={e.id} className="flex flex-col gap-2 p-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {e.memo || ENTRY_SOURCE_LABEL[e.source_type] || e.source_type}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{ENTRY_SOURCE_LABEL[e.source_type] ?? ""}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{formatIsoDate(e.entry_date)}</span>
                </div>
                <table className="w-full text-xs">
                  <thead className="sr-only">
                    <tr>
                      <th>Akun</th>
                      <th>Debit</th>
                      <th>Kredit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.lines.map((l, i) => (
                      <tr key={i}>
                        <td className={cn("py-0.5", l.credit > 0 && "pl-6")}>{names.get(l.account_code) ?? l.account_code}</td>
                        <td className="w-28 py-0.5 text-right tabular-nums">{l.debit ? formatRupiah(l.debit) : ""}</td>
                        <td className="w-28 py-0.5 text-right tabular-nums">{l.credit ? formatRupiah(l.credit) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
