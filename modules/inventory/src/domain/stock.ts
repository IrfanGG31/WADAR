export interface StockLevelState {
  onHand: number;
  /** Moving-average HPP per unit; null = never received with a known cost. */
  avgCost: number | null;
}

export interface MovementInput {
  delta: number;
  /** Cost per unit for incoming stock; ignored for outgoing movements. */
  unitCost?: number | null;
  /** Explicit revaluation: set the average cost regardless of delta (owner edited HPP). */
  revalueTo?: number | null;
}

/**
 * Weighted moving average HPP (ARCHITECTURE §5.3). Integer rupiah only:
 * the multiplication runs in BigInt so large on-hand × cost products never
 * lose precision, and the result is rounded half-up to whole rupiah.
 *
 * Stock may go negative (UMKM reality — sold before it was recorded as
 * received). While on-hand is ≤ 0 an incoming cost simply becomes the new
 * average, since there's no positive quantity to average against.
 */
export function applyMovement(state: StockLevelState, movement: MovementInput): StockLevelState {
  const onHand = state.onHand + movement.delta;
  if (movement.revalueTo !== undefined && movement.revalueTo !== null) {
    return { onHand, avgCost: movement.revalueTo };
  }
  const incomingCost = movement.unitCost ?? null;
  if (movement.delta <= 0 || incomingCost === null) {
    return { onHand, avgCost: state.avgCost };
  }
  if (state.onHand <= 0 || state.avgCost === null) {
    return { onHand, avgCost: incomingCost };
  }
  const numerator = BigInt(state.onHand) * BigInt(state.avgCost) + BigInt(movement.delta) * BigInt(incomingCost);
  const denominator = BigInt(onHand);
  const avg = (numerator * 2n + denominator) / (denominator * 2n);
  return { onHand, avgCost: Number(avg) };
}

export type StockStatus = "aman" | "menipis" | "kritis";

/** Days-of-cover thresholds for the product list badges (PRD §8.2 "aman/menipis/kritis"). */
export const CRITICAL_DAYS = 3;
export const LOW_DAYS = 7;
/** Without sales history there's no rate; fall back to an absolute quantity. */
export const LOW_QTY_WITHOUT_HISTORY = 3;

export function stockStatus(onHand: number, daysLeft: number | null): StockStatus {
  if (onHand <= 0) return "kritis";
  if (daysLeft !== null) {
    if (daysLeft <= CRITICAL_DAYS) return "kritis";
    if (daysLeft <= LOW_DAYS) return "menipis";
    return "aman";
  }
  return onHand <= LOW_QTY_WITHOUT_HISTORY ? "menipis" : "aman";
}
