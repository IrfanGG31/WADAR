import "server-only";
import { layeredAnswerStore, memoryAnswerStore } from "@/core/answer-cache";
import { buildBerandaInsight, dailyBerandaInsight, type BerandaInsight } from "@/core/consult/beranda-insight";
import { DAILY_INSIGHT_TTL_MS } from "@/core/consult/cache";
import { createClient } from "@/lib/supabase/server";
import { tableAnswerStore } from "./answer-cache";
import { getWeeklyInsights, loadConsultData } from "./consult";
import type { Shop } from "./shop";

/** Per instance; keys carry the tenant. Shared across instances via `ai_answer_cache` (owner's client, RLS). */
const memory = memoryAnswerStore();

/**
 * Beranda "Insight untukmu" for the shop's day (CON-5): cached per tenant + day, so only the
 * first open of the day loads 14 days of data and ranks the insights. Before migration
 * 20261017100000 is applied the table layer is a miss and only the memory layer caches.
 */
export async function getBerandaInsight(shop: Shop, today: string): Promise<BerandaInsight & { cached: boolean }> {
  const supabase = await createClient();
  const store = layeredAnswerStore(memory, tableAnswerStore(supabase, shop.id), DAILY_INSIGHT_TTL_MS);
  return dailyBerandaInsight(store, shop.id, today, async () => {
    const data = await loadConsultData(shop, today, { historyDays: 14 });
    const weekly = await getWeeklyInsights(shop, data, { persist: false });
    return buildBerandaInsight({ today, selected: weekly.selected, data });
  });
}
