"use client";

import { Search, Snail } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatRupiah } from "@/core/money";
import { formatCount } from "@/core/number-format";
import { STOCK_STATUS_LABEL, type StockStatus } from "@/core/stock-level";
import {
  countByStatus,
  DEFAULT_FORECAST_FILTER,
  filterForecastRows,
  formatDaysLeft,
  formatRate,
  type ForecastFilter,
  type ForecastRow,
  type StatusFilter,
} from "@/core/stock-insight";
import { shopPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "semua", label: "Semua" },
  { value: "habis", label: STOCK_STATUS_LABEL.habis },
  { value: "kritis", label: STOCK_STATUS_LABEL.kritis },
  { value: "menipis", label: STOCK_STATUS_LABEL.menipis },
  { value: "aman", label: STOCK_STATUS_LABEL.aman },
];

const STATUS_BADGE: Record<StockStatus, "danger" | "warning" | "success"> = {
  habis: "danger",
  kritis: "danger",
  menipis: "warning",
  aman: "success",
};

const chip = (on: boolean) =>
  cn(
    "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    on ? "border-navy bg-navy text-white" : "border-border bg-card text-muted-foreground hover:text-foreground",
  );

/**
 * Prediksi & Rekomendasi table (STK-1..4): every number is a field of a
 * {@link ForecastRow} built by forecastStock on the server; this component
 * only filters and lays them out (cards on phones, a table from md up).
 */
export function ForecastTable({ slug, rows, categories }: { slug: string; rows: ForecastRow[]; categories: string[] }) {
  const [filter, setFilter] = useState<ForecastFilter>(DEFAULT_FORECAST_FILTER);
  const counts = useMemo(() => countByStatus(rows), [rows]);
  const shown = useMemo(() => filterForecastRows(rows, filter), [rows, filter]);
  const set = (patch: Partial<ForecastFilter>) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <section className="flex flex-col gap-3" aria-labelledby="prediksi-title">
      <h2 id="prediksi-title" className="text-sm font-semibold">
        Prediksi per produk
      </h2>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={filter.query}
          onChange={(e) => set({ query: e.target.value })}
          placeholder="Cari produk"
          aria-label="Cari produk"
          className="pl-9"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Saring status">
        {STATUS_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter.status === value}
            onClick={() => set({ status: value })}
            className={chip(filter.status === value)}
          >
            {label} ({formatCount(counts[value])})
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filter.category ?? ""}
          onChange={(e) => set({ category: e.target.value || null })}
          aria-label="Kategori"
          className="h-11 min-w-0 max-w-full rounded-full border border-border bg-background px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <option value="">Semua kategori</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={filter.restockOnly}
          onClick={() => set({ restockOnly: !filter.restockOnly })}
          className={chip(filter.restockOnly)}
        >
          Perlu restock saja
        </button>
        <button
          type="button"
          aria-pressed={filter.slowOnly}
          onClick={() => set({ slowOnly: !filter.slowOnly })}
          className={chip(filter.slowOnly)}
        >
          Lambat laku
        </button>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {formatCount(shown.length)} dari {formatCount(rows.length)} produk
      </p>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
          Tidak ada produk yang cocok dengan saringan ini.
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3 md:hidden">
            {shown.map((row) => (
              <ForecastCard key={row.variant_id} slug={slug} row={row} />
            ))}
          </ul>
          <ForecastGrid slug={slug} rows={shown} />
        </>
      )}
    </section>
  );
}

function ForecastCard({ slug, row }: { slug: string; row: ForecastRow }) {
  return (
    <li className="rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={shopPath(slug, `stok/produk/${row.product_id}`)}
          className="min-w-0 rounded-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {row.title}
        </Link>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={STATUS_BADGE[row.status]}>{STOCK_STATUS_LABEL[row.status]}</Badge>
          {row.slow_moving && <SlowBadge />}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-3">
        <Stat label="Stok" value={`${formatCount(row.on_hand)} ${row.unit}`} />
        <Stat label="Laku" value={formatRate(row.rate)} />
        <Stat label="Habis" value={formatDaysLeft(row)} />
        <Stat label="Stok pengaman" value={formatCount(row.safety_stock)} />
        <Stat label="Titik pesan" value={formatCount(row.rop)} />
        <Stat label="Saran pesan" value={row.reorder_qty > 0 ? `${formatCount(row.reorder_qty)} ${row.unit}` : "—"} strong />
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">{row.narrative}</p>
    </li>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", strong && "font-semibold")}>{value}</dd>
    </div>
  );
}

function SlowBadge() {
  return (
    <Badge variant="muted" className="gap-1">
      <Snail className="h-3 w-3" aria-hidden />
      Lambat laku
    </Badge>
  );
}

function ForecastGrid({ slug, rows }: { slug: string; rows: ForecastRow[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs text-slate-700">
          <tr>
            <th className="px-4 py-2 font-medium">Produk</th>
            <th className="px-3 py-2 text-right font-medium">Stok</th>
            <th className="px-3 py-2 text-right font-medium">Laju jual</th>
            <th className="px-3 py-2 text-right font-medium" title="Stok pengaman (SS)">
              Stok pengaman
            </th>
            <th className="px-3 py-2 text-right font-medium" title="Titik pesan ulang (ROP)">
              Titik pesan
            </th>
            <th className="px-3 py-2 text-right font-medium">Habis dalam</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Saran pesan</th>
            <th className="px-4 py-2 text-right font-medium">Modal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.variant_id} className="align-top">
              <td className="px-4 py-3">
                <Link
                  href={shopPath(slug, `stok/produk/${row.product_id}`)}
                  className="rounded-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {row.title}
                </Link>
                <p className="mt-0.5 max-w-xs text-xs text-muted-foreground">{row.narrative}</p>
              </td>
              <td className="px-3 py-3 text-right tabular-nums">
                {formatCount(row.on_hand)} <span className="text-xs text-muted-foreground">{row.unit}</span>
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{formatRate(row.rate)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatCount(row.safety_stock)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatCount(row.rop)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatDaysLeft(row)}</td>
              <td className="px-3 py-3">
                <div className="flex flex-col items-start gap-1">
                  <Badge variant={STATUS_BADGE[row.status]}>{STOCK_STATUS_LABEL[row.status]}</Badge>
                  {row.slow_moving && <SlowBadge />}
                </div>
              </td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums">
                {row.reorder_qty > 0 ? `${formatCount(row.reorder_qty)} ${row.unit}` : "—"}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                {row.slow_moving ? formatRupiah(row.idle_capital) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
