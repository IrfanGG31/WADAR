/**
 * "Dampak Mingguan" (Ruang Demo): time WADAR saves an owner over the last 7 days, from real
 * counts. The per-item minutes are deliberately conservative and shown next to the result,
 * so a judge can check the arithmetic.
 */

export const IMPACT_ASSUMPTIONS = {
  /** Writing a paper note + adding it up at closing, per transaction. */
  secondsPerSale: 40,
  /** Reading and typing one answer to a buyer on WhatsApp. */
  secondsPerAiReply: 90,
  /** Counting the cash drawer and writing the daily recap. */
  minutesPerDailyRecap: 20,
} as const;

export interface ImpactInput {
  sales: number;
  aiReplies: number;
  days: number;
}

export interface Impact {
  minutesFromSales: number;
  minutesFromChat: number;
  minutesFromRecap: number;
  minutesTotal: number;
}

const whole = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

export function weeklyImpact(input: ImpactInput): Impact {
  const a = IMPACT_ASSUMPTIONS;
  const minutesFromSales = Math.round((whole(input.sales) * a.secondsPerSale) / 60);
  const minutesFromChat = Math.round((whole(input.aiReplies) * a.secondsPerAiReply) / 60);
  const minutesFromRecap = whole(input.days) * a.minutesPerDailyRecap;
  return { minutesFromSales, minutesFromChat, minutesFromRecap, minutesTotal: minutesFromSales + minutesFromChat + minutesFromRecap };
}

/** 754 → "12,6 jam"; under an hour → "45 menit". */
export function formatDuration(minutes: number): string {
  const m = whole(minutes);
  if (m < 60) return `${m} menit`;
  const tenths = Math.round(m / 6);
  const hours = Math.floor(tenths / 10);
  const rest = tenths % 10;
  return rest === 0 ? `${hours} jam` : `${hours},${rest} jam`;
}
