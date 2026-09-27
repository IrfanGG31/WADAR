export type FeedSeverity = "critical" | "warning" | "info";

/** One "Hari ini perlu perhatian" item (PRD F3.8 / R3). */
export interface FeedItem {
  id: string;
  kind: "stock" | "catalog_quality" | "reconciliation" | "getting_started";
  severity: FeedSeverity;
  title: string;
  body: string;
  href: string;
  actionLabel: string;
}

export interface MetricCard {
  today: number;
  yesterday: number;
  /** Deterministic one-line context (PRD §4 "angka selalu punya konteks") — no LLM. */
  sentence: string;
  trend: "up" | "down" | "flat";
}

export interface DayPoint {
  day: string;
  moneyIn: number;
  netSales: number;
  profit: number;
}

export interface HomeView {
  asOf: string;
  today: string;
  feed: FeedItem[];
  /** null for roles without finance access (cashiers still get the feed). */
  cards: HomeCards | null;
  chart: DayPoint[];
}

export interface HomeCards {
  moneyIn: MetricCard;
  profit: MetricCard;
  balance: { total: number; walletCount: number; sentence: string };
}

export interface ProfitRow {
  key: string;
  name: string;
  qty?: number;
  orders?: number;
  netSales: number;
  cost: number;
  commission: number;
  profit: number;
  /** Profit / net sales, in basis points (1234 = 12,34%); null when there were no sales. */
  marginBps: number | null;
  /** Product rows only: some units were sold without an HPP, so profit is overstated. */
  costMissing?: boolean;
}

export interface ProfitBreakdown {
  from: string;
  to: string;
  by: "product" | "channel";
  rows: ProfitRow[];
  /** Products sold without an HPP — their profit is overstated (PRD F3.9). */
  missingCostCount: number;
}

export interface SummaryView {
  from: string;
  to: string;
  sales: number;
  discounts: number;
  netSales: number;
  costOfGoods: number;
  channelCommission: number;
  expenses: number;
  expensesByCategory: Array<{ category: string; label: string; amount: number }>;
  otherIncome: number;
  netProfit: number;
  moneyIn: number;
  moneyOut: number;
}
