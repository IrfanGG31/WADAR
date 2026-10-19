import { Suspense } from "react";
import { PageGate } from "@/components/shell/page-gate";
import { expensesByCategory } from "@/core/expense";
import { formatRupiah } from "@/core/money";
import { lastDays } from "@/core/period";
import { listExpenses } from "@/db/expenses";
import { getShop } from "@/db/shop";
import { shopToday } from "@/lib/shop-today";
import { KeuanganHeader } from "../keuangan-header";
import { ExpenseForm } from "./expense-form";
import { ExpenseList } from "./expense-list";

export const metadata = { title: "Pengeluaran" };

type Params = PageProps<"/[slug]/keuangan/pengeluaran">["params"];

/** FIN-1: record operating expenses; they feed "untung bersih" on every Keuangan screen. */
export default function PengeluaranPage({ params, searchParams }: PageProps<"/[slug]/keuangan/pengeluaran">) {
  return (
    <div className="flex flex-col gap-6">
      <KeuanganHeader params={params} searchParams={searchParams} active="keuangan/pengeluaran" />
      <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-muted" aria-hidden />}>
        <PageGate params={params} permission="finance">
          <Expenses params={params} />
        </PageGate>
      </Suspense>
    </div>
  );
}

async function Expenses({ params }: { params: Params }) {
  const { slug } = await params;
  const shop = await getShop(slug);
  const today = await shopToday(shop.timezone);
  const rows = await listExpenses(shop.id, lastDays(today, 30));
  const { total, categories } = expensesByCategory(rows);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-6">
        <ExpenseForm today={today} />
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm" aria-labelledby="per-kategori">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <h2 id="per-kategori" className="font-semibold">30 hari terakhir</h2>
            <p className="text-lg font-semibold tabular-nums">{formatRupiah(total)}</p>
          </div>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada pengeluaran.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {categories.map((c) => (
                <li key={c.category} className="flex flex-col gap-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span>{c.category}</span>
                    <span className="tabular-nums">
                      {formatRupiah(c.amount)} <span className="text-muted-foreground">· {c.share_pct}%</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div className="h-full rounded-full bg-primary" style={{ width: `${c.share_pct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="flex flex-col gap-3" aria-labelledby="riwayat-pengeluaran">
        <h2 id="riwayat-pengeluaran" className="font-semibold">Riwayat</h2>
        <ExpenseList rows={rows} />
      </section>
    </div>
  );
}
