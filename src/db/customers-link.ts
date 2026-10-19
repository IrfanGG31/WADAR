import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePhone } from "@/core/phone";

/**
 * CRM link (ADR-004): when a WhatsApp buyer's number already belongs to a customer (from Kasir or an
 * import), the chat is attached to that customer, so the inbox shows who is writing. Never creates
 * a customer: a chat alone is not a purchase. Idempotent; a chat already linked is left alone.
 * `externalUserId` is a WhatsApp id ("6281234567890", "15551234567") or what an API bot sent ("0812…").
 */
export async function linkChatToCustomer(db: SupabaseClient, tenantId: string, channel: "whatsapp", externalUserId: string): Promise<void> {
  const phone = normalizePhone(externalUserId) ?? normalizePhone(`+${externalUserId.replace(/^\+/, "")}`);
  if (!phone) return;
  const { data: customer, error } = await db.from("customers").select("id").eq("tenant_id", tenantId).eq("phone_e164", phone).maybeSingle();
  if (error || !customer) return;
  await db
    .from("conversations")
    .update({ customer_id: customer.id })
    .eq("tenant_id", tenantId)
    .eq("channel", channel)
    .eq("external_user_id", externalUserId)
    .is("customer_id", null);
}
