"use client";

import { AlertTriangle, ChevronRight, PackageOpen, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatCount } from "@/core/number-format";
import { STOCK_STATUS_LABEL, type StockStatus } from "@/core/stock-level";
import { formatRate } from "@/core/stock-insight";
import { shopPath } from "@/lib/routes";
import { cn } from "@/lib/utils";

export interface StockRow {
  productId: string;
  variantId: string;
  name: string;
  option: string | null;
  category: string | null;
  unit: string;
  onHand: number;
  minStock: number;
  costIsSet: boolean;
  /** From forecastStock (src/core/stock.ts) — velocity-aware, not just on-hand vs minimum. */
  status: StockStatus;
  rate: number;
  stockoutInDays: number | null;
  reorderQty: number;
}

type Filter = "semua" | "menipis" | "aman";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "semua", label: "Semua" },
  { value: "menipis", label: "Stok Menipis" },
  { value: "aman", label: "Stok Aman" },
];

const STATUS_BADGE: Record<StockStatus, "danger" | "warning" | "success"> = {
  habis: "danger",
  kritis: "danger",
  menipis: "warning",
  aman: "success",
};

const STATUS_ORDER: Record<StockStatus, number> = { habis: 0, kritis: 1, menipis: 2, aman: 3 };

/** Stok Produk tab: every variant with its stock, minimum, forecast status and sell rate; filter and search on the client. */
export function StockList({ slug, rows }: { slug: string; rows: StockRow[] }) {
  const [filter, setFilter] = useState<Filter>("semua");
  const [query, setQuery] = useState("");

  const withStatus = useMemo(
    () =>
      rows
        .slice()
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name)),
    [rows],
  );
  const counts = {
    semua: withStatus.length,
    menipis: withStatus.filter((r) => r.status !== "aman").length,
    aman: withStatus.filter((r) => r.status === "aman").length,
  };
  const needle = query.trim().toLowerCase();
  const shown = withStatus.filter(
    (r) =>
      (filter === "semua" || (filter === "aman") === (r.status === "aman")) &&
      (!needle || `${r.name} ${r.option ?? ""} ${r.category ?? ""}`.toLowerCase().includes(needle)),
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <PackageOpen className="h-10 w-10 text-muted-foreground" aria-hidden />
        <p className="max-w-sm text-muted-foreground">Belum ada produk. Tambah produk pertama untuk mulai mencatat stok.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari produk"
          aria-label="Cari produk"
          className="pl-9"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Saring stok">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              filter === value ? "border-navy bg-navy text-white" : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {label} ({formatCount(counts[value])})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
          Tidak ada produk yang cocok.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          {shown.map((row) => (
            <li key={row.variantId}>
              <Link
                href={shopPath(slug, `stok/produk/${row.productId}`)}
                className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">
                    {row.name}
                    {row.option && <span className="text-muted-foreground"> · {row.option}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>
                      Min. {formatCount(row.minStock)} {row.unit}
                    </span>
                    {row.category && <span>· {row.category}</span>}
                    {row.rate > 0 && <span>· laku {formatRate(row.rate)}</span>}
                    {(row.status === "kritis" || row.status === "menipis") && row.stockoutInDays !== null && (
                      <span className="text-foreground">· habis ±{formatCount(row.stockoutInDays)} hari</span>
                    )}
                    {row.status !== "aman" && row.reorderQty > 0 && (
                      <span className="text-foreground">
                        · pesan {formatCount(row.reorderQty)} {row.unit}
                      </span>
                    )}
                    {!row.costIsSet && (
                      <span className="inline-flex items-center gap-1 text-amber-800">
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        HPP belum diisi
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex w-24 shrink-0 flex-col items-end gap-1.5 sm:w-32">
                  <span className="flex items-center gap-2">
                    {/* Only problems get a badge; a column of green "Aman" badges hides the ones that matter. */}
                    {row.status !== "aman" && <Badge variant={STATUS_BADGE[row.status]}>{STOCK_STATUS_LABEL[row.status]}</Badge>}
                    <span className="text-lg font-semibold tabular-nums">
                      {formatCount(row.onHand)} <span className="text-xs font-normal text-muted-foreground">{row.unit}</span>
                    </span>
                  </span>
                  <StockBar onHand={row.onHand} minStock={row.minStock} status={row.status} />
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const BAR_TONE: Record<StockStatus, string> = { habis: "bg-red-500", kritis: "bg-red-500", menipis: "bg-amber-500", aman: "bg-primary/35" };

/** Stock against three times the minimum — a glance at "how far from reorder", not a precise figure. */
function StockBar({ onHand, minStock, status }: { onHand: number; minStock: number; status: StockStatus }) {
  const scale = Math.max(minStock * 3, 1);
  const pct = Math.max(onHand > 0 ? 4 : 0, Math.min(100, Math.round((Math.max(onHand, 0) / scale) * 100)));
  const minPct = Math.min(100, Math.round((minStock / scale) * 100));
  return (
    <span className="relative block h-1.5 w-full rounded-full bg-muted" aria-hidden>
      <span className={`absolute inset-y-0 left-0 rounded-full ${BAR_TONE[status]}`} style={{ width: `${pct}%` }} />
      <span className="absolute -inset-y-0.5 w-px bg-foreground/30" style={{ left: `${minPct}%` }} />
    </span>
  );
}
