import type { ExpenseView, MoneyMovement, ProfitAndLoss, WalletView } from "@wadar/contracts/finance";
import { WALLET_TYPE_LABEL } from "@wadar/contracts/finance";
import { formatDateTimeId } from "@wadar/core/date";
import { formatRupiah } from "@wadar/core/money";
import { Card, CardContent } from "@wadar/ui-web";
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { apiFetchServer } from "../../../lib/api-client-server";
import { getAppContext } from "../../../lib/app-context";
import { PERIODS, parsePeriod, periodRange, type Period } from "./period";
import { VoidExpenseButton } from "./void-expense-button";
import { WalletActions } from "./wallet-actions";

type Tab = "ringkasan" | "masuk-keluar" | "dompet" | "pengeluaran";
const TABS: Array<{ key: Tab; label: string }> = [
  { key: "ringkasan", label: "Ringkasan" },
  { key: "masuk-keluar", label: "Masuk/Keluar" },
  { key: "dompet", label: "Dompet" },
  { key: "pengeluaran", label: "Pengeluaran" },
];

function href(tab: Tab, period: Period) {
  return `/keuangan?tab=${tab}&periode=${period}`;
}

export default async function KeuanganPage({ searchParams }: { searchParams: Promise<{ tab?: string; periode?: string }> }) {
  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === params.tab) ? (params.tab as Tab) : "ringkasan";
  const period = parsePeriod(params.periode);
  const { can, tenant } = await getAppContext();
  if (!can("finance:view")) redirect("/beranda");
  const range = periodRange(period, tenant.timezone);
  const query = `from=${range.from}&to=${range.to}`;
  const canManage = can("finance:manage");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Keuangan</h1>
          <p className="mt-1 text-sm text-muted-foreground">Uang masuk, uang keluar, dan untung tokomu — tercatat otomatis dari setiap transaksi.</p>
        </div>
        {canManage && (
          <Link href="/keuangan/pengeluaran/baru" className="inline-flex h-10 items-center gap-2 self-start rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Catat pengeluaran
          </Link>
        )}
      </div>

      <nav aria-label="Bagian keuangan" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href(t.key, period)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab !== "dompet" && (
        <div className="flex gap-2 overflow-x-auto">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={href(tab, p.key)}
              aria-current={period === p.key ? "page" : undefined}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm ${period === p.key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      )}

      {tab === "ringkasan" && <Summary query={query} />}
      {tab === "masuk-keluar" && <Movements query={query} timezone={tenant.timezone} />}
      {tab === "dompet" && <Wallets canManage={canManage} />}
      {tab === "pengeluaran" && <Expenses query={query} timezone={tenant.timezone} canManage={canManage} />}
    </div>
  );
}

async function Summary({ query }: { query: string }) {
  const pnl = await apiFetchServer<ProfitAndLoss>(`/v1/finance/profit-and-loss?${query}`);
  const row = (label: string, amount: number, negative = false) => (
    <div className={`flex items-center justify-between ${negative ? "text-destructive" : ""}`}>
      <span className={negative ? "" : "text-muted-foreground"}>{label}</span>
      <span>{negative ? `- ${formatRupiah(amount)}` : formatRupiah(amount)}</span>
    </div>
  );
  return (
    <Card className="relative overflow-hidden shadow-md">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-blue-400 to-primary" />
      <CardContent className="flex flex-col gap-3 p-6 font-mono text-sm md:p-8">
        {row("Penjualan", pnl.sales)}
        {pnl.discounts > 0 && row("Diskon", pnl.discounts, true)}
        {row("Modal barang (HPP)", pnl.costOfGoods, true)}
        {pnl.channelCommission > 0 && row("Komisi marketplace", pnl.channelCommission, true)}
        {pnl.expensesByCategory.map((e) => (
          <div key={e.category}>{row(e.label, e.amount, true)}</div>
        ))}
        {pnl.otherIncome > 0 && row("Pemasukan lain", pnl.otherIncome)}
        <div className="my-2 border-t-2 border-dashed border-border" />
        <div className={`flex items-center justify-between text-lg font-bold ${pnl.netProfit >= 0 ? "text-primary" : "text-destructive"}`}>
          <span className="font-sans">{pnl.netProfit >= 0 ? "Untung bersih" : "Rugi"}</span>
          <span>{formatRupiah(Math.abs(pnl.netProfit))}</span>
        </div>
        {pnl.sales > 0 && pnl.costOfGoods === 0 && (
          <p className="font-sans text-xs text-muted-foreground">
            Modal barang masih Rp0 — isi HPP di <Link href="/stok?filter=belum-lengkap" className="underline">Produk &amp; Stok</Link> supaya untungnya akurat.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

async function Movements({ query, timezone }: { query: string; timezone: string }) {
  const movements = await apiFetchServer<MoneyMovement[]>(`/v1/finance/movements?${query}`);
  const totalIn = movements.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0);
  const totalOut = movements.filter((m) => m.amount < 0).reduce((s, m) => s - m.amount, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Uang masuk</p><p className="text-xl font-bold text-emerald-700">{formatRupiah(totalIn)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Uang keluar</p><p className="text-xl font-bold text-destructive">{formatRupiah(totalOut)}</p></CardContent></Card>
      </div>
      {movements.length === 0 ? (
        <p className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">Belum ada uang masuk/keluar di periode ini.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-background">
          {movements.map((m) => (
            <li key={`${m.entryId}-${m.walletId}`} className="flex items-center gap-3 p-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${m.amount >= 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                {m.amount >= 0 ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.description}</p>
                <p className="text-xs text-muted-foreground">{formatDateTimeId(m.occurredAt, timezone)} · {m.walletName}</p>
              </div>
              <p className={`shrink-0 font-semibold ${m.amount >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                {m.amount >= 0 ? "+" : "-"}
                {formatRupiah(Math.abs(m.amount))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

async function Wallets({ canManage }: { canManage: boolean }) {
  const wallets = await apiFetchServer<WalletView[]>("/v1/finance/wallets");
  const total = wallets.reduce((s, w) => s + w.balance, 0);
  return (
    <div className="flex flex-col gap-4">
      <Card className="bg-primary text-primary-foreground">
        <CardContent className="p-5">
          <p className="text-sm opacity-90">Saldo semua dompet</p>
          <p className="text-3xl font-bold">{formatRupiah(total)}</p>
        </CardContent>
      </Card>
      <ul className="grid gap-3 sm:grid-cols-2">
        {wallets.map((w) => (
          <li key={w.id}>
            <Card>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{w.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {WALLET_TYPE_LABEL[w.type]}
                    {w.defaultFor && " · dipakai Kasir"}
                  </p>
                </div>
                <p className={`text-lg font-bold ${w.balance < 0 ? "text-destructive" : ""}`}>{formatRupiah(w.balance)}</p>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {canManage && <WalletActions wallets={wallets} />}
    </div>
  );
}

async function Expenses({ query, timezone, canManage }: { query: string; timezone: string; canManage: boolean }) {
  const expenses = await apiFetchServer<ExpenseView[]>(`/v1/finance/expenses?${query}`);
  const total = expenses.filter((e) => !e.voided).reduce((s, e) => s + e.amount, 0);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Total pengeluaran: <span className="font-semibold text-foreground">{formatRupiah(total)}</span></p>
      {expenses.length === 0 ? (
        <p className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">Belum ada pengeluaran di periode ini.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-background">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className={`text-sm font-medium ${e.voided ? "line-through text-muted-foreground" : ""}`}>{e.note || e.categoryLabel}</p>
                <p className="text-xs text-muted-foreground">
                  {e.categoryLabel} · {e.walletName} · {formatDateTimeId(e.occurredAt, timezone)}
                  {e.voided && " · dibatalkan"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <p className="font-semibold">{formatRupiah(e.amount)}</p>
                {canManage && !e.voided && <VoidExpenseButton expenseId={e.id} />}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
