/**
 * Stock-out prediction (ARCHITECTURE §5.3, PRD O4.2): exponentially
 * weighted daily sales rate, blending a fast (14-day span) and a slow
 * (28-day span) average so one busy day doesn't swing the estimate but a
 * real trend still shows within days.
 */
export function ewma(values: number[], span: number): number {
  if (values.length === 0) return 0;
  const alpha = 2 / (span + 1);
  let average = values[0]!;
  for (let i = 1; i < values.length; i++) average = alpha * values[i]! + (1 - alpha) * average;
  return average;
}

export interface ForecastResult {
  /** Units per day. */
  dailyRate: number;
  /** Whole days of cover left; null when there's no sales history to judge by. */
  daysLeft: number | null;
  /** Units to reorder to cover the next 14 days. */
  reorderQty: number;
}

export const FORECAST_HISTORY_DAYS = 28;
export const REORDER_COVER_DAYS = 14;

/** `dailyQty` = units sold per day, oldest → newest, exactly FORECAST_HISTORY_DAYS long (zeros included). */
export function forecastStock(dailyQty: number[], onHand: number): ForecastResult {
  const soldAnything = dailyQty.some((q) => q > 0);
  if (!soldAnything) return { dailyRate: 0, daysLeft: null, reorderQty: 0 };
  const dailyRate = 0.6 * ewma(dailyQty, 14) + 0.4 * ewma(dailyQty, 28);
  if (dailyRate <= 0) return { dailyRate: 0, daysLeft: null, reorderQty: 0 };
  const daysLeft = onHand <= 0 ? 0 : Math.floor(onHand / dailyRate);
  const reorderQty = Math.max(0, Math.ceil(dailyRate * REORDER_COVER_DAYS - Math.max(onHand, 0)));
  return { dailyRate, daysLeft, reorderQty };
}

export const LOW_STOCK_DAYS = 7;

/** A "low" alert fires when cover drops under LOW_STOCK_DAYS, at most once per 24 h per variant/outlet. */
export function shouldAlertLow(result: ForecastResult, lastAlertedAt: Date | null, now: Date): boolean {
  if (result.daysLeft === null || result.daysLeft >= LOW_STOCK_DAYS) return false;
  return lastAlertedAt === null || now.getTime() - lastAlertedAt.getTime() >= 24 * 60 * 60 * 1000;
}
