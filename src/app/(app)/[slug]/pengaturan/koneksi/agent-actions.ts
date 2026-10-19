"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { permissionDenied } from "@/db/access";
import { runAgentForShop } from "@/db/agent";
import { isSchemaPending, SCHEMA_PENDING_MESSAGE } from "@/db/schema-pending";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const Settings = z.object({ enabled: z.boolean(), auto_reorder: z.boolean(), auto_faq: z.boolean(), auto_reply: z.boolean() });

function refresh(slug: string) {
  revalidatePath(shopPath(slug, "pengaturan/koneksi"));
  revalidatePath(shopPath(slug, "autopilot"));
  revalidatePath(shopPath(slug, "beranda"));
}

export async function saveAgentSettings(slug: string, input: unknown): Promise<{ error?: string }> {
  const parsed = Settings.safeParse(input);
  if (!parsed.success) return { error: "Isian belum lengkap." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_agent_settings", {
    p_tenant_id: shop.id,
    p_enabled: parsed.data.enabled,
    p_auto_reorder: parsed.data.auto_reorder,
    p_auto_faq: parsed.data.auto_faq,
    p_auto_reply: parsed.data.auto_reply,
  });
  if (error) return { error: isSchemaPending(error) ? SCHEMA_PENDING_MESSAGE : "Belum tersimpan. Coba lagi sebentar." };
  refresh(slug);
  return {};
}

export async function closeAgentTask(slug: string, taskId: string, status: "done" | "dismissed"): Promise<{ error?: string }> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_agent_task", { p_task_id: taskId, p_status: status });
  if (error) return { error: isSchemaPending(error) ? SCHEMA_PENDING_MESSAGE : "Belum tersimpan. Coba lagi sebentar." };
  refresh(slug);
  return {};
}

/** "Jalankan sekarang": the same pass the daily job makes, for this shop only (owner). */
export async function runAgentNow(slug: string): Promise<{ error?: string; note?: string }> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  try {
    const r = await runAgentForShop(createAdminClient(), shop.id);
    refresh(slug);
    const waiting = r.open > 0 ? ` ${r.open} tugas menunggu di Autopilot.` : "";
    if (r.created || r.closed) return { note: `${r.created} tugas baru, ${r.closed} selesai sendiri.${waiting}` };
    return { note: r.open ? `Tidak ada yang baru.${waiting}` : "Tidak ada yang perlu disiapkan sekarang." };
  } catch (e) {
    console.error("agent run failed", e);
    return { error: "Autopilot belum bisa jalan sekarang. Coba lagi sebentar." };
  }
}
