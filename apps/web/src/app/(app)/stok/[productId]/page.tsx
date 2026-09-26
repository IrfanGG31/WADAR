import type { ProductView } from "@wadar/contracts/catalog";
import type { StockItemView, StockMovementView } from "@wadar/contracts/inventory";
import { STOCK_REASON_LABEL } from "@wadar/contracts/inventory";
import { formatRupiah } from "@wadar/core/money";
import { formatDateTimeId } from "@wadar/core/date";
import { Card, CardContent, CardHeader, CardTitle } from "@wadar/ui-web";
import { ArrowLeft, Package } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, apiFetchServer } from "../../../../lib/api-client-server";
import { getAppContext } from "../../../../lib/app-context";
import { MissingBadges, StatusBadge } from "../stock-badges";
import { AdjustStockForm } from "./adjust-stock-form";
import { EditVariantForm } from "./edit-variant-form";
import { PhotoUpload } from "./photo-upload";

export default async function ProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  const { activeOutlet, can, tenant } = await getAppContext();

  let product: ProductView;
  try {
    product = await apiFetchServer<ProductView>(`/v1/products/${productId}`);
  } catch (error) {
    if (error instanceof ApiError && (error.problem.status === 404 || error.problem.status === 400)) notFound();
    throw error;
  }
  const stock = activeOutlet
    ? await apiFetchServer<StockItemView[]>(`/v1/stock?outletId=${activeOutlet.id}&search=${encodeURIComponent(product.name)}`)
    : [];
  const stockByVariant = new Map(stock.filter((s) => s.productId === product.id).map((s) => [s.variantId, s]));
  const activeVariants = product.variants.filter((v) => !v.archived);
  const movements = await Promise.all(
    activeVariants.map((v) =>
      apiFetchServer<StockMovementView[]>(
        `/v1/stock/variants/${v.id}/movements${activeOutlet ? `?outletId=${activeOutlet.id}` : ""}`,
      ),
    ),
  );
  const canEdit = can("catalog:manage");
  const canAdjust = can("inventory:manage");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-6">
      <Link href="/stok" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Produk &amp; Stok
      </Link>

      <div className="flex items-start gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
          {product.photoUrl ? (
            <img src={product.photoUrl} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <Package className="h-8 w-8 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
          {product.category && <p className="text-sm text-muted-foreground">{product.category}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <MissingBadges missing={product.missing} />
          </div>
          {canEdit && <PhotoUpload productId={product.id} hasPhoto={product.photoUrl !== null} />}
        </div>
      </div>

      {activeVariants.map((variant, index) => {
        const level = stockByVariant.get(variant.id);
        return (
          <Card key={variant.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
              <div>
                <CardTitle className="text-lg">{variant.name || "Stok & harga"}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatRupiah(variant.price)}
                  {(level?.avgCost ?? variant.cost) != null && ` · modal rata-rata ${formatRupiah((level?.avgCost ?? variant.cost)!)}`}
                  {variant.sku && ` · SKU ${variant.sku}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{level?.onHand ?? 0}</p>
                {level && <StatusBadge status={level.status} />}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {level?.daysLeft != null && (
                <p className="text-sm">Dengan laju jual sekarang, stok ini cukup ±{level.daysLeft} hari lagi.</p>
              )}
              {canEdit && <EditVariantForm variant={variant} />}
              {canAdjust && activeOutlet && (
                <AdjustStockForm variantId={variant.id} outletId={activeOutlet.id} outletName={activeOutlet.name} currentOnHand={level?.onHand ?? 0} />
              )}
              <div>
                <h3 className="mb-2 text-sm font-semibold">Riwayat stok</h3>
                {(movements[index] ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada pergerakan stok.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                    {movements[index]!.slice(0, 20).map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p className="font-medium">{STOCK_REASON_LABEL[m.reason]}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatDateTimeId(m.createdAt, tenant.timezone)}
                            {m.note && ` · ${m.note}`}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`font-semibold ${m.delta < 0 ? "text-destructive" : "text-emerald-700"}`}>
                            {m.delta > 0 ? `+${m.delta}` : m.delta}
                          </p>
                          <p className="text-xs text-muted-foreground">sisa {m.balanceAfter}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
