/**
 * Scheduled weekly insight (GAP #5, PDF Tabel 3 / Misi 1 "insight proaktif mingguan").
 * Once a week, for every shop: this week's top insights (src/core/consult/insights.ts) +
 * their narration are stored as one digest row per (shop, week). Running the job again in
 * the same week is a no-op per shop; a shop that fails does not stop the others.
 * Sending (email / WhatsApp) goes through `deliver` — no channel is configured yet, so the
 * default hook only records "not_configured".
 * Batches: with `batchSize`, one call handles at most that many shops (ordered by id) and
 * returns `next_cursor`; the next call passes it as `after`. Repeating a batch is a no-op.
 */
import { isoDateInZone } from "../period";
import { weekStart } from "./insights";

export interface DigestShop {
  id: string;
  name: string;
  slug: string;
  timezone: string;
}

export interface WeeklyDigest {
  tenant_id: string;
  /** Monday of the shop's local week, "YYYY-MM-DD". */
  week_start: string;
  text: string;
  points: string[];
  insight_keys: string[];
  engine: "llm" | "offline";
  model: string;
  source: string;
  generated_by: "cron" | "manual";
}

export type DigestContent = Omit<WeeklyDigest, "tenant_id" | "week_start" | "generated_by">;

export type DeliveryOutcome = { status: "not_configured" | "sent"; channel?: string } | { status: "failed"; error: string };

export interface WeeklyJobDeps {
  listShops(): Promise<DigestShop[]>;
  hasDigest(tenantId: string, weekStart: string): Promise<boolean>;
  /** Loads the shop's data, stores the week's insights and narrates them. */
  build(shop: DigestShop, today: string): Promise<DigestContent>;
  /** Insert-if-absent on (tenant_id, week_start). false = another run stored it first. */
  save(digest: WeeklyDigest): Promise<boolean>;
  deliver(shop: DigestShop, digest: WeeklyDigest): Promise<DeliveryOutcome>;
  markDelivery(tenantId: string, weekStart: string, outcome: DeliveryOutcome): Promise<void>;
}

export interface WeeklyJobResult {
  tenant_id: string;
  slug: string;
  week_start: string;
  status: "created" | "exists" | "failed";
  delivery?: DeliveryOutcome["status"];
  error?: string;
}

export interface WeeklyJobOptions {
  /** Max shops handled by this call (default: all). */
  batchSize?: number;
  /** Continue with shops whose id sorts after this one (the previous call's `next_cursor`). */
  after?: string | null;
}

export interface WeeklyJobReport {
  ran_at: string;
  /** Shops handled by this call. */
  shops: number;
  /** Shops left after this batch; 0 = the week is done. */
  remaining: number;
  /** Pass as `after` to run the next batch; null when nothing is left. */
  next_cursor: string | null;
  created: number;
  skipped: number;
  failed: number;
  results: WeeklyJobResult[];
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Shops run one after another (keeps database and model load flat); `batchSize` bounds one call. */
export async function runWeeklyInsightJob(deps: WeeklyJobDeps, now: Date, { batchSize, after }: WeeklyJobOptions = {}): Promise<WeeklyJobReport> {
  const pending = (await deps.listShops())
    .filter((s) => !after || s.id > after)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const size = batchSize && batchSize > 0 ? Math.floor(batchSize) : pending.length;
  const shops = pending.slice(0, size);
  const remaining = pending.length - shops.length;
  const results: WeeklyJobResult[] = [];
  for (const shop of shops) {
    const today = isoDateInZone(now, shop.timezone);
    const ws = weekStart(today);
    const base = { tenant_id: shop.id, slug: shop.slug, week_start: ws };
    try {
      if (await deps.hasDigest(shop.id, ws)) {
        results.push({ ...base, status: "exists" });
        continue;
      }
      const digest: WeeklyDigest = { ...(await deps.build(shop, today)), tenant_id: shop.id, week_start: ws, generated_by: "cron" };
      if (!(await deps.save(digest))) {
        results.push({ ...base, status: "exists" });
        continue;
      }
      let outcome: DeliveryOutcome;
      try {
        outcome = await deps.deliver(shop, digest);
      } catch (e) {
        outcome = { status: "failed", error: message(e) };
      }
      await deps.markDelivery(shop.id, ws, outcome).catch(() => {});
      results.push({ ...base, status: "created", delivery: outcome.status });
    } catch (e) {
      results.push({ ...base, status: "failed", error: message(e) });
    }
  }
  const count = (s: WeeklyJobResult["status"]) => results.filter((r) => r.status === s).length;
  return {
    ran_at: now.toISOString(),
    shops: shops.length,
    remaining,
    next_cursor: remaining > 0 ? shops[shops.length - 1].id : null,
    created: count("created"), skipped: count("exists"), failed: count("failed"),
    results,
  };
}

/** Delivery hook until email (Resend, verified domain) / WhatsApp (Cloud API) are configured: nothing is sent. */
export async function notConfiguredDelivery(): Promise<DeliveryOutcome> {
  return { status: "not_configured" };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** "19 Okt 2026" for a calendar date "YYYY-MM-DD". */
function weekLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Plain-text email / WhatsApp body for a digest (what a future sender sends; numbers come from the digest as stored). */
export function digestMessage(shop: Pick<DigestShop, "name" | "slug">, digest: WeeklyDigest, appUrl: string): { subject: string; body: string } {
  const lines = [digest.text, "", ...digest.points.map((p) => `• ${p}`), "", `Buka Beranda: ${appUrl.replace(/\/$/, "")}/${encodeURIComponent(shop.slug)}/beranda`];
  return { subject: `Insight mingguan ${shop.name} — minggu ${weekLabel(digest.week_start)}`, body: lines.join("\n").replace(/\n{3,}/g, "\n\n") };
}

export function digestCaption(digest: Pick<WeeklyDigest, "week_start" | "generated_by">): string {
  return `${digest.generated_by === "cron" ? "Disusun otomatis" : "Disusun"} untuk minggu ${weekLabel(digest.week_start)}`;
}
