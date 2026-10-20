import "server-only";
import { after } from "next/server";
import { dispatchWebhooks } from "@/db/webhooks";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * After the response: deliver this shop's new webhook events (ADR-007). Never fails the request —
 * without a service role, or outside a request (tests), it does nothing; the daily cron catches up.
 */
export function scheduleWebhookDispatch(tenantId: string): void {
  try {
    after(async () => {
      try {
        await dispatchWebhooks(createAdminClient(), tenantId);
      } catch (e) {
        console.error("webhook dispatch failed", e instanceof Error ? e.message : e);
      }
    });
  } catch {
    // Not inside a request scope.
  }
}
