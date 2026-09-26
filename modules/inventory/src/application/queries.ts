import { loadCatalogProducts } from "@wadar/catalog";
import type { StockItemView, StockMovementView } from "@wadar/contracts";
import { withTenantContext, type Db, type Tx } from "@wadar/platform";
import { stockStatus } from "../domain/stock.js";
import { forecastsForOutlet, levelsForOutlet, levelsForVariants, recentMovements } from "../infra/stock.repository.js";

export interface StockOverviewItem extends Omit<StockItemView, "photoUrl"> {
  photoPath: string | null;
}

export async function stockOverview(
  db: Db,
  tenantId: string,
  outletId: string,
  options: { search?: string; includeCost: boolean },
): Promise<StockOverviewItem[]> {
  return withTenantContext(db, tenantId, async (tx) => {
    const [products, levels, forecastRows] = await Promise.all([
      loadCatalogProducts(tx, tenantId, { search: options.search, includeCost: true }),
      levelsForOutlet(tx, tenantId, outletId),
      forecastsForOutlet(tx, tenantId, outletId),
    ]);
    const levelByVariant = new Map(levels.map((l) => [l.variantId, l]));
    const forecastByVariant = new Map(forecastRows.map((f) => [f.variantId, f]));
    const items: StockOverviewItem[] = [];
    for (const product of products) {
      for (const variant of product.variants) {
        if (variant.archived) continue;
        const level = levelByVariant.get(variant.id);
        const onHand = level?.onHand ?? 0;
        const daysLeft = forecastByVariant.get(variant.id)?.daysLeft ?? null;
        const item: StockOverviewItem = {
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          variantName: variant.name,
          sku: variant.sku,
          barcode: variant.barcode,
          price: variant.price,
          category: product.category,
          photoPath: product.photoPath,
          onHand,
          status: stockStatus(onHand, daysLeft),
          daysLeft,
          missing: product.missing,
        };
        if (options.includeCost) item.avgCost = level?.avgCost ?? variant.cost ?? 0;
        items.push(item);
      }
    }
    return items;
  });
}

export async function variantMovements(
  db: Db,
  tenantId: string,
  variantId: string,
  outletId: string | undefined,
  includeCost: boolean,
): Promise<StockMovementView[]> {
  const rows = await withTenantContext(db, tenantId, (tx) => recentMovements(tx, tenantId, variantId, outletId, 100));
  return rows.map((row) => {
    const view: StockMovementView = {
      id: row.id,
      variantId: row.variantId,
      delta: row.delta,
      reason: row.reason,
      balanceAfter: row.balanceAfter,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    };
    if (includeCost) view.unitCost = row.unitCost;
    return view;
  });
}

export interface StockSnapshot {
  onHand: number;
  avgCost: number | null;
}

/** Port for sales: current on-hand + moving-average HPP for the cart's variants. */
export async function getStockSnapshot(
  tx: Tx,
  tenantId: string,
  outletId: string,
  variantIds: string[],
): Promise<Map<string, StockSnapshot>> {
  const rows = await levelsForVariants(tx, tenantId, outletId, [...new Set(variantIds)]);
  return new Map(rows.map((row) => [row.variantId, { onHand: row.onHand, avgCost: row.avgCost }]));
}
