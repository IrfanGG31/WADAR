import type { FeedItem, HomeView, MetricCard } from "@wadar/contracts/insights";
import { formatDateKeyShort } from "@wadar/core/date";
import { formatRupiah, formatRupiahCompact } from "@wadar/core/money";
import { Card, CardContent, TrendChart } from "@wadar/ui-web";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Info, Minus, PackagePlus, ShoppingCart, Wallet } from "lucide-react";
import Link from "next/link";
import { apiFetchServer } from "../../../lib/api-client-server";
import { getAppContext } from "../../../lib/app-context";
import { LiveRefresh } from "./live-refresh";

const SEVERITY_STYLE: Record<FeedItem["severity"], { box: string; icon: typeof AlertTriangle }> = {
  critical: { box: "border-red-200 bg-red-50 text-red-900", icon: AlertTriangle },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-950", icon: AlertTriangle },
  info: { box: "border-blue-200 bg-blue-50 text-blue-950", icon: Info },
};

function TrendIcon({ trend }: { trend: MetricCard["trend"] }) {
  if (trend === "up") return <ArrowUp className="h-3.5 w-3.5" />;
  if (trend === "down") return <ArrowDown className="h-3.5 w-3.5" />;
  return <Minus className="h-3.5 w-3.5" />;
}

/**
 * Beranda (PRD §8.2 after v1.1/R3): "Hari ini perlu perhatian" FIRST, then
 * the 3 money cards with a one-line context each, then a 7-day chart. One
 * API call to insights read models (ARCHITECTURE §5.4) — no raw ledger reads.
 */
export default async function BerandaPage() {
  const { activeOutlet, can, tenant } = await getAppContext();
  const home = await apiFetchServer<HomeView>(
    `/v1/insights/home${activeOutlet ? `?outletId=${activeOutlet.id}` : ""}`,
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <LiveRefresh />
      <div>
        <p className="text-sm text-muted-foreground">{tenant.name}</p>
        <h1 className="text-2xl font-bold tracking-tight">Hari ini perlu perhatian</h1>
      </div>

      {home.feed.length === 0 ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex items-center gap-3 p-4 text-emerald-900">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">Semua aman. Tidak ada yang perlu kamu urus sekarang.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {home.feed.slice(0, 6).map((item) => {
            const style = SEVERITY_STYLE[item.severity];
            const Icon = style.icon;
            return (
              <li key={item.id}>
                <Link href={item.href} className={`flex items-start gap-3 rounded-xl border p-4 transition-colors hover:brightness-95 ${style.box}`}>
                  <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug">{item.title}</p>
                    <p className="mt-0.5 text-sm opacity-90">{item.body}</p>
                  </div>
                  <span className="shrink-0 self-center text-sm font-semibold underline underline-offset-2">{item.actionLabel}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {home.cards && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MoneyCard title="Uang masuk hari ini" value={home.cards.moneyIn.today} card={home.cards.moneyIn} icon={<ArrowDown className="h-5 w-5" />} />
            <MoneyCard title="Untung bersih hari ini" value={home.cards.profit.today} card={home.cards.profit} icon={<Wallet className="h-5 w-5" />} />
            <Card className="shadow-sm">
              <CardContent className="flex flex-col gap-2 p-5">
                <p className="text-sm font-medium text-muted-foreground">Saldo semua dompet</p>
                <p className={`text-2xl font-bold tabular-nums ${home.cards.balance.total < 0 ? "text-destructive" : ""}`}>{formatRupiah(home.cards.balance.total)}</p>
                <p className="text-sm text-muted-foreground">{home.cards.balance.sentence}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">7 hari terakhir</h2>
                <Link href="/keuangan?tab=untung&periode=7-hari" className="text-sm font-medium text-primary underline">
                  Untung per produk
                </Link>
              </div>
              <TrendChart
                points={home.chart.map((d) => ({ label: formatDateKeyShort(d.day).split(",")[0]!, value: d.netSales, line: d.profit }))}
                format={(v) => formatRupiahCompact(v)}
                barLabel="Penjualan"
                lineLabel="Untung"
              />
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {can("cashier:operate") && <QuickLink href="/kasir" icon={<ShoppingCart className="h-5 w-5" />} label="Buka Kasir" />}
        {can("finance:manage") && <QuickLink href="/keuangan/pengeluaran/baru" icon={<Wallet className="h-5 w-5" />} label="Catat pengeluaran" />}
        {can("catalog:manage") && <QuickLink href="/stok/baru" icon={<PackagePlus className="h-5 w-5" />} label="Tambah produk" />}
        {can("cashier:operate") && <QuickLink href="/layar-kasir" icon={<ArrowDown className="h-5 w-5" />} label="Layar Kasir" />}
      </div>
    </div>
  );
}

function MoneyCard({ title, value, card, icon }: { title: string; value: number; card: MetricCard; icon: React.ReactNode }) {
  const trendColor = card.trend === "up" ? "text-emerald-700" : card.trend === "down" ? "text-amber-700" : "text-muted-foreground";
  return (
    <Card className="shadow-sm">
      <CardContent className="flex flex-col gap-2 p-5">
        <div className="flex items-center justify-between text-muted-foreground">
          <p className="text-sm font-medium">{title}</p>
          {icon}
        </div>
        <p className={`text-2xl font-bold tabular-nums ${value < 0 ? "text-destructive" : ""}`}>{formatRupiah(value)}</p>
        <p className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
          <TrendIcon trend={card.trend} /> Kemarin {formatRupiah(card.yesterday)}
        </p>
        <p className="text-sm text-muted-foreground">{card.sentence}</p>
      </CardContent>
    </Card>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-2 rounded-xl border border-border bg-background p-3 text-sm font-medium hover:bg-muted">
      <span className="text-primary">{icon}</span>
      {label}
    </Link>
  );
}
