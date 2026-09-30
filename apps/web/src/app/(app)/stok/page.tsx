import type { StockItemView } from "@wadar/contracts/inventory";
import { formatRupiah } from "@wadar/core/money";
import { Badge, Card, CardContent } from "@wadar/ui-web";
import { AlertTriangle, FileSpreadsheet, Package, Plus, Search } from "lucide-react";
import Link from "next/link";
import { apiFetchServer } from "../../../lib/api-client-server";
import { getAppContextWith } from "../../../lib/app-context";
import { StatusBadge, MissingBadges } from "./stock-badges";

type Filter = "semua" | "perhatian" | "belum-lengkap";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "semua", label: "Semua" },
  { key: "perhatian", label: "Hampir habis" },
  { key: "belum-lengkap", label: "Data belum lengkap" },
];

function daysLeftSentence(item: StockItemView): string {
  if (item.onHand <= 0) return item.onHand < 0 ? "Stok di sistem minus — cek stok fisik." : "Stok sudah habis.";
  if (item.daysLeft !== null) return `Diperkirakan habis ±${item.daysLeft} hari lagi.`;
  return `Tinggal ${item.onHand} — belum ada data penjualan untuk menebak kapan habis.`;
}

export default async function StokPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; filter?: string }>;
}) {
  const { search, filter: rawFilter } = await searchParams;
  const filter: Filter = rawFilter === "perhatian" || rawFilter === "belum-lengkap" ? rawFilter : "semua";
  const { activeOutlet, can, data } = await getAppContextWith((outletId) => {
    const query = new URLSearchParams({ outletId: outletId ?? "" });
    if (search) query.set("search", search);
    return apiFetchServer<Array<StockItemView>>(`/v1/stock?${query}`);
  });
  if (!activeOutlet) {
    return <p className="p-6 text-sm text-muted-foreground">Belum ada outlet. Tambah outlet dulu di Pengaturan Toko.</p>;
  }
  const items = await data;

  const attention = items.filter((i) => i.status !== "aman");
  const incomplete = items.filter((i) => i.missing.length > 0);
  const shown = filter === "perhatian" ? attention : filter === "belum-lengkap" ? incomplete : items;
  const critical = [...attention].sort((a, b) => (a.daysLeft ?? a.onHand) - (b.daysLeft ?? b.onHand)).slice(0, 3);
  const canManage = can("catalog:manage");

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Produk &amp; Stok</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length} produk di {activeOutlet.name}
            {attention.length > 0 && <span className="font-medium text-destructive"> • {attention.length} perlu perhatian</span>}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Link
              href="/stok/impor"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
            >
              <FileSpreadsheet className="h-4 w-4" /> Impor
            </Link>
            <Link
              href="/stok/baru"
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Tambah Produk
            </Link>
          </div>
        )}
      </div>

      <form className="relative" role="search">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Cari nama, SKU, atau scan barcode"
          aria-label="Cari produk"
          className="h-11 w-full rounded-full border border-border bg-background pl-9 pr-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
        {filter !== "semua" && <input type="hidden" name="filter" value={filter} />}
      </form>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => {
          const count = f.key === "perhatian" ? attention.length : f.key === "belum-lengkap" ? incomplete.length : items.length;
          const params = new URLSearchParams();
          if (search) params.set("search", search);
          if (f.key !== "semua") params.set("filter", f.key);
          return (
            <Link
              key={f.key}
              href={`/stok${params.size ? `?${params}` : ""}`}
              aria-current={filter === f.key ? "page" : undefined}
              className={`whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium ${
                filter === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
              }`}
            >
              {f.label} ({count})
            </Link>
          );
        })}
      </div>

      {filter === "semua" && !search && critical.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {critical.map((item) => (
            <Card key={item.variantId} className="overflow-hidden border-destructive/30 bg-destructive/5 shadow-sm">
              <CardContent className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/stok/${item.productId}`} className="font-semibold hover:underline">
                      {item.productName}
                      {item.variantName && <span className="text-muted-foreground"> · {item.variantName}</span>}
                    </Link>
                    {item.sku && <p className="mt-0.5 text-xs text-muted-foreground">SKU: {item.sku}</p>}
                  </div>
                  <p className={`shrink-0 text-lg font-bold ${item.onHand <= 0 ? "text-destructive" : ""}`}>{item.onHand}</p>
                </div>
                <div className="flex items-start gap-2 text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="text-sm font-medium leading-tight">{daysLeftSentence(item)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Package className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">{search ? `Tidak ada produk yang cocok dengan "${search}".` : "Belum ada produk di sini."}</p>
            {canManage && !search && (
              <p className="text-sm text-muted-foreground">
                Mulai dengan <Link href="/stok/baru" className="font-medium text-primary underline">tambah produk</Link> atau{" "}
                <Link href="/stok/impor" className="font-medium text-primary underline">impor dari Excel</Link>.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
          {shown.map((item) => (
            <li key={item.variantId}>
              <Link href={`/stok/${item.productId}`} className="flex items-center gap-3 p-3 hover:bg-muted/50 sm:p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                  {item.photoUrl ? (
                    <img src={item.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Package className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {item.productName}
                    {item.variantName && <span className="text-muted-foreground"> · {item.variantName}</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={item.status} />
                    <MissingBadges missing={item.missing} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold">{item.onHand}</p>
                  <p className="text-xs text-muted-foreground">{formatRupiah(item.price)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {shown.length > 0 && filter === "belum-lengkap" && (
        <p className="text-sm text-muted-foreground">
          <Badge variant="warning" className="mr-1">Tips</Badge>
          Lengkapi HPP supaya untung per produk dihitung akurat.
        </p>
      )}
    </div>
  );
}
