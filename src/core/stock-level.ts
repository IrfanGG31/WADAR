/** Stock status by level alone; src/core/stock.ts refines it with sales velocity (TECH-SPEC §7.1). */
export type StockStatus = "habis" | "kritis" | "menipis" | "aman";

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  habis: "Habis",
  kritis: "Kritis",
  menipis: "Menipis",
  aman: "Aman",
};

export function levelStatus(onHand: number, minStock: number): StockStatus {
  if (onHand <= 0) return "habis";
  if (onHand <= minStock) return "menipis";
  return "aman";
}
