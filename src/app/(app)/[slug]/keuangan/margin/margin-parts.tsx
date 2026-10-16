import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { CURRENT_LABEL, type ChannelMarginRow, type ProductMarginRow, type WarningRow } from "@/core/finance-insight";
import { formatRupiah } from "@/core/money";
import { formatCount, formatPercent } from "@/core/number-format";
import { shopPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

/* Presentational pieces of the Margin tab; rows arrive computed by src/core/finance-insight.ts. */

const SEVERITY: Record<WarningRow["severity"], { label: string; variant: "danger" | "warning" | "muted" }> = {
  3: { label: "Penting", variant: "danger" },
  2: { label: "Perhatian", variant: "warning" },
  1: { label: "Info", variant: "muted" },
};

export function Warnings({ slug, rows, periodLabel = CURRENT_LABEL }: { slug: string; rows: WarningRow[]; periodLabel?: string }) {
  if (rows.length === 0) {
    return (
      <section className="flex items-center gap-3 rounded-xl border border-border p-4 text-sm">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
        Tidak ada peringatan margin {periodLabel}.
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50/60 p-4" aria-labelledby="peringatan">
      <h2 id="peringatan" className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
        Peringatan margin ({formatCount(rows.length)})
      </h2>
      <ul className="divide-y divide-amber-200">
        {rows.map((w) => (
          <li key={w.key} className="flex flex-col gap-1 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={SEVERITY[w.severity].variant}>{SEVERITY[w.severity].label}</Badge>
              <span className="text-sm font-medium">{w.title}</span>
            </div>
            <p className="text-sm text-slate-700">{w.detail}</p>
            <Link
              href={w.anchor ? `#${w.anchor}` : shopPath(slug, "keuangan/detail")}
              className="inline-flex min-h-11 items-center self-start rounded-md text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              Lihat datanya
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Horizontal margin meter, 0–100% (negative margins show an empty red track). */
function MarginMeter({ pct }: { pct: number }) {
  return (
    <div className={cn("h-1.5 w-full rounded-full", pct < 0 ? "bg-red-200" : "bg-muted")}>
      <div className="h-1.5 rounded-full bg-primary/80" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

export function ChannelMargins({ rows }: { rows: ChannelMarginRow[] }) {
  return (
    <section id="kanal" className="scroll-mt-20 rounded-xl border border-border p-4" aria-labelledby="margin-kanal">
      <h2 id="margin-kanal" className="mb-3 text-sm font-semibold">
        Margin per kanal
      </h2>
      <ColumnHeads first="Kanal" cols={["Penjualan", "Komisi", "Untung kotor"]} template={CHANNEL_GRID} />
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((c) => (
          <li key={c.key} className={cn("flex flex-col gap-2 py-3 md:grid md:items-center md:gap-4", CHANNEL_GRID)}>
            <div className="flex items-center gap-2">
              <span className="font-medium">{c.label}</span>
              {c.thinnest && <Badge variant="warning">Paling tipis</Badge>}
            </div>
            <dl className="flex flex-col gap-1 text-sm sm:grid sm:grid-cols-3 sm:gap-2 md:contents">
              <Cell label="Penjualan" value={formatRupiah(c.R)} />
              <Cell label="Komisi" value={formatRupiah(c.F)} sub={formatPercent(c.fee_pct)} />
              <Cell label="Untung kotor" value={formatRupiah(c.GP)} />
            </dl>
            <div className="flex items-center gap-3">
              <span className={cn("w-16 shrink-0 text-right text-sm font-semibold tabular-nums", (c.margin_pct ?? 0) < 0 && "text-red-700")}>
                {c.margin_pct === null ? "—" : formatPercent(c.margin_pct)}
              </span>
              {c.margin_pct !== null && <MarginMeter pct={c.margin_pct} />}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProductMargins({ rows }: { rows: ProductMarginRow[] }) {
  return (
    <section id="produk" className="scroll-mt-20 rounded-xl border border-border p-4" aria-labelledby="margin-produk">
      <h2 id="margin-produk" className="mb-3 text-sm font-semibold">
        Margin per produk
      </h2>
      <ColumnHeads first="Produk" cols={["Terjual", "Penjualan", "Untung kotor"]} template={PRODUCT_GRID} />
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((p) => (
          <li key={p.key} className={cn("flex flex-col gap-2 py-3 md:grid md:items-center md:gap-4", PRODUCT_GRID)}>
            <span className="min-w-0 font-medium">{p.label}</span>
            <dl className="flex flex-col gap-1 text-sm sm:grid sm:grid-cols-3 sm:gap-2 md:contents">
              <Cell label="Terjual" value={formatCount(p.q)} />
              <Cell label="Penjualan" value={formatRupiah(p.R)} />
              <Cell label="Untung kotor" value={p.missing_cost && p.margin_pct === null ? "—" : formatRupiah(p.GP)} />
            </dl>
            <div className="flex items-center gap-3">
              {p.margin_pct === null ? (
                <Badge variant="warning">HPP belum diisi</Badge>
              ) : (
                <>
                  <span className={cn("w-16 shrink-0 text-right text-sm font-semibold tabular-nums", p.margin_pct < 0 && "text-red-700")}>
                    {formatPercent(p.margin_pct)}
                  </span>
                  <MarginMeter pct={p.margin_pct} />
                </>
              )}
            </div>
            {p.missing_cost && p.margin_pct !== null && (
              <p className="text-xs text-amber-800 md:col-span-5">Sebagian penjualan belum ada HPP; margin dihitung dari yang ada HPP saja.</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Full class strings so Tailwind sees them.
const CHANNEL_GRID = "md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)]";
const PRODUCT_GRID = "md:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)]";

function ColumnHeads({ first, cols, template }: { first: string; cols: string[]; template: string }) {
  return (
    <div className={cn("hidden gap-4 border-b border-border pb-2 text-xs text-muted-foreground md:grid", template)} aria-hidden>
      <span>{first}</span>
      {cols.map((c) => (
        <span key={c} className="text-right">
          {c}
        </span>
      ))}
      <span className="pl-[4.75rem]">Margin</span>
    </div>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2 sm:block">
      <dt className="text-xs text-muted-foreground md:sr-only">{label}</dt>
      <div className="flex items-baseline gap-1.5 sm:block md:text-right">
        <dd className="tabular-nums">{value}</dd>
        {sub && <dd className="text-xs text-muted-foreground">({sub})</dd>}
      </div>
    </div>
  );
}
