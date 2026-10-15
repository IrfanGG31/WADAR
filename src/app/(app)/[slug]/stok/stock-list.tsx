"use client";

import { AlertTriangle, ChevronRight, PackageOpen, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
        <PackageOpen className="h-10 w-10 text-muted-foreground" />
        <p className="max-w-sm text-muted-foreground">Belum ada produk. Tambah produk pertama untuk mulai mencatat stok.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari produk"
          aria-label="Cari produk"
          className="pl-9"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="Saring stok">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
            className={cn(
              "h-9 shrink-0 rounded-full border px-4 text-sm font-medium",
              filter === value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
            )}
          >
            {label} ({counts[value]})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-muted-foreground">
          Tidak ada produk yang cocok.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {shown.map((row) => (
            <li key={row.variantId}>
              <Link
                href={shopPath(slug, `stok/produk/${row.productId}`)}
                className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-muted"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">
                    {row.name}
                    {row.option && <span className="text-muted-foreground"> · {row.option}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>Min. {row.minStock} {row.unit}</span>
                    {row.category && <span>· {row.category}</span>}
                    {row.rate > 0 && <span>· laku {formatRate(row.rate)}</span>}
                    {(row.status === "kritis" || row.status === "menipis") && row.stockoutInDays !== null && (
                      <span className="text-foreground">· habis ±{row.stockoutInDays} hari</span>
                    )}
                    {row.status !== "aman" && row.reorderQty > 0 && (
                      <span className="text-foreground">
                        · pesan {row.reorderQty} {row.unit}
                      </span>
                    )}
                    {!row.costIsSet && (
                      <span className="inline-flex items-center gap-1 text-warning">
                        <AlertTriangle className="h-3 w-3" />
                        HPP belum diisi
                      </span>
                    )}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-lg font-semibold tabular-nums">
                    {row.onHand} <span className="text-xs font-normal text-muted-foreground">{row.unit}</span>
                  </span>
                  <Badge variant={STATUS_BADGE[row.status]}>{STOCK_STATUS_LABEL[row.status]}</Badge>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
