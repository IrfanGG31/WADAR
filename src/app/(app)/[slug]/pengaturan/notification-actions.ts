"use server";

import { z } from "zod";
import { permissionDenied } from "@/db/access";
import { getShop } from "@/db/shop";
import { createClient } from "@/lib/supabase/server";
import { isPushEndpoint } from "@/lib/web-push";
import type { ActionResult } from "./actions";

/** Notifikasi eskalasi (GAP #7): the switch, this device's push subscription, "sudah dibaca". */

const PrefsInput = z.object({ onEscalation: z.boolean() });

/** `PushSubscription.toJSON()` from the browser. */
const PushSubscriptionInput = z.object({
  endpoint: z.string().max(1000).refine(isPushEndpoint),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function saveNotificationPrefs(slug: string, input: unknown): Promise<ActionResult> {
  const parsed = PrefsInput.safeParse(input);
  if (!parsed.success) return { error: "Isian belum lengkap." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  const supabase = await createClient();
  // Every shop has its row (created on by the migration / trigger); the app may only update it.
  const { error } = await supabase
    .from("notification_prefs")
    .update({ on_escalation: parsed.data.onEscalation, updated_at: new Date().toISOString() })
    .eq("tenant_id", shop.id);
  return error ? { error: "Belum tersimpan. Coba lagi sebentar." } : {};
}

export async function savePushSubscription(slug: string, input: unknown): Promise<ActionResult> {
  const parsed = PushSubscriptionInput.safeParse(input);
  if (!parsed.success) return { error: "Perangkat ini belum bisa menerima notifikasi." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "chat");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      { tenant_id: shop.id, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth },
      // Same device again = nothing to do (the app has no UPDATE on subscriptions).
      { onConflict: "tenant_id,endpoint", ignoreDuplicates: true },
    );
  if (error) return { error: "Belum tersimpan. Coba lagi sebentar." };
  const { error: pe } = await supabase
    .from("notification_prefs")
    .update({ push_enabled: true, updated_at: new Date().toISOString() })
    .eq("tenant_id", shop.id);
  return pe ? { error: "Belum tersimpan. Coba lagi sebentar." } : {};
}

export async function markNotificationsRead(slug: string): Promise<ActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "chat");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("tenant_id", shop.id).is("read_at", null);
  return error ? { error: "Belum tersimpan. Coba lagi sebentar." } : {};
}
