import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nextAttemptDelay, signWebhook, webhookBody } from "@/core/webhooks";
import { openSecret } from "@/lib/secret-box";
import { createClient } from "@/lib/supabase/server";
import { isSchemaPending } from "./schema-pending";

export interface WebhookEndpointView {
  id: string;
  url: string;
  events: string[];
  created_at: string;
  last_delivery_at: string | null;
  last_status: number | null;
  last_error: string | null;
}

/** Owner's list (RLS); `installed` false before migration webhooks. */
export async function listWebhookEndpoints(tenantId: string): Promise<{ installed: boolean; endpoints: WebhookEndpointView[] }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webhook_endpoints")
    .select("id, url, events, created_at, last_delivery_at, last_status, last_error")
    .eq("tenant_id", tenantId)
    .order("created_at");
  if (error) {
    if (isSchemaPending(error)) return { installed: false, endpoints: [] };
    throw error;
  }
  return { installed: true, endpoints: (data ?? []) as WebhookEndpointView[] };
}

interface DueRow {
  event_id: string;
  endpoint_id: string;
  attempts: number;
  outbox_events: { id: string; type: string; created_at: string; payload: Record<string, unknown> } | null;
  webhook_endpoints: { url: string; secret_cipher: string } | null;
}

/**
 * Sends what is due for one shop (service role): fan new events out, POST each pending delivery
 * (5 s timeout), record the outcome, schedule a retry with backoff. Safe to call often — from
 * `after()` when something happened, and from the daily cron as a catch-up.
 */
export async function dispatchWebhooks(
  db: SupabaseClient,
  tenantId: string,
  { fetchFn = fetch, now = new Date(), limit = 30 }: { fetchFn?: typeof fetch; now?: Date; limit?: number } = {},
): Promise<{ sent: number; failed: number }> {
  const queued = await db.rpc("queue_webhook_deliveries", { p_tenant_id: tenantId });
  if (queued.error) {
    if (isSchemaPending(queued.error)) return { sent: 0, failed: 0 };
    throw queued.error;
  }
  const { data: due, error } = await db
    .from("webhook_deliveries")
    .select("event_id, endpoint_id, attempts, outbox_events(id, type, created_at, payload), webhook_endpoints(url, secret_cipher)")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    // A little slack: the delivery's due time comes from the database clock, a moment after `now`.
    .lte("next_attempt_at", new Date(now.getTime() + 5_000).toISOString())
    .order("next_attempt_at")
    .limit(limit);
  if (error) throw error;
  const { data: shop } = await db.from("tenants").select("slug").eq("id", tenantId).maybeSingle();

  let sent = 0;
  let failed = 0;
  for (const d of (due ?? []) as unknown as DueRow[]) {
    if (!d.outbox_events || !d.webhook_endpoints) continue;
    const body = webhookBody(d.outbox_events, (shop?.slug as string) ?? "");
    let status = 0;
    let problem: string | null = null;
    try {
      const secret = openSecret(d.webhook_endpoints.secret_cipher);
      const res = await fetchFn(d.webhook_endpoints.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "WADAR-Webhook/1",
          "x-wadar-event": d.outbox_events.type,
          "x-wadar-delivery": `${d.event_id}:${d.endpoint_id}`,
          "x-wadar-signature": signWebhook(secret, body, Math.floor(now.getTime() / 1000)),
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });
      status = res.status;
      if (!res.ok) problem = `HTTP ${res.status}`;
    } catch (e) {
      problem = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "Tidak menjawab dalam 5 detik" : "Alamat tidak bisa dihubungi";
    }
    const attempts = d.attempts + 1;
    const wait = problem ? nextAttemptDelay(attempts) : null;
    await db
      .from("webhook_deliveries")
      .update({
        status: problem ? (wait === null ? "failed" : "pending") : "sent",
        attempts,
        last_error: problem,
        next_attempt_at: new Date(now.getTime() + (wait ?? 0)).toISOString(),
      })
      .eq("event_id", d.event_id)
      .eq("endpoint_id", d.endpoint_id);
    await db
      .from("webhook_endpoints")
      .update({ last_delivery_at: now.toISOString(), last_status: status || null, last_error: problem })
      .eq("id", d.endpoint_id);
    if (problem) failed += 1;
    else sent += 1;
  }
  return { sent, failed };
}
