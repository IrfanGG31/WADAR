"use server";

import { OwnerReplyInput } from "@/core/chat/inbox";
import { permissionDenied } from "@/db/access";
import { getShop } from "@/db/shop";
import { deliverToConnector, type ConnectorDeliveryResult } from "@/lib/connector-delivery";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
  /** Saved, but the buyer's Telegram/WhatsApp did not get it (the thread shows a resend button). */
  warning?: string;
}

function deliveryWarning(d: ConnectorDeliveryResult | null): ActionResult {
  return d && !d.ok ? { warning: `Tersimpan, tapi belum terkirim ke ${d.channel}: ${d.reason}` } : {};
}

/** Ambil alih: the AI stops answering this conversation until it is handed back. */
export async function takeOver(slug: string, conversationId: string): Promise<ActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "chat");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ mode: "human" })
    .eq("tenant_id", shop.id)
    .eq("id", conversationId);
  return error ? { error: "Belum bisa mengambil alih. Coba lagi sebentar." } : {};
}

/** Kembalikan ke AI: back to automatic answers, no longer waiting for the owner. */
export async function returnToAi(slug: string, conversationId: string): Promise<ActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "chat");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversations")
    .update({ mode: "ai", status: "open", escalation_reason: null })
    .eq("tenant_id", shop.id)
    .eq("id", conversationId);
  return error ? { error: "Belum bisa dikembalikan ke AI. Coba lagi sebentar." } : {};
}

/** A manual reply; it also takes the conversation over and clears "belum bisa dijawab". */
export async function sendReply(slug: string, conversationId: string, input: unknown): Promise<ActionResult> {
  const parsed = OwnerReplyInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Balasan belum valid." };

  const shop = await getShop(slug);

  const denied = await permissionDenied(shop.id, "chat");

  if (denied) return { error: denied };
  const supabase = await createClient();
  // An id of another shop's conversation updates nothing (no error): require the row back before inserting.
  const { data: conv, error: ce } = await supabase
    .from("conversations")
    .update({ mode: "human", status: "open" })
    .eq("tenant_id", shop.id)
    .eq("id", conversationId)
    .select("id")
    .maybeSingle();
  if (ce || !conv) return { error: "Percakapan tidak ditemukan." };
  const { data: message, error } = await supabase
    .from("messages")
    .insert({
      tenant_id: shop.id,
      conversation_id: conversationId,
      direction: "out",
      author: "human",
      content: parsed.data.text,
    })
    .select("id")
    .single();
  if (error) return { error: "Balasan belum terkirim. Coba lagi sebentar." };
  // A Telegram/WhatsApp chat (direct connector): WADAR sends the reply itself.
  if (!message?.id) return {};
  return deliveryWarning(
    await deliverToConnector({ tenantId: shop.id, conversationId, messageId: message.id as string, text: parsed.data.text }),
  );
}

/** Kirim ulang: one more try for a reply that did not reach the buyer's Telegram/WhatsApp. */
export async function resendMessage(slug: string, messageId: string): Promise<ActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "chat");
  if (denied) return { error: denied };
  const supabase = await createClient();
  // Read as the user (RLS): a message of another shop is not found.
  const { data: m } = await supabase
    .from("messages")
    .select("id, conversation_id, content, direction")
    .eq("tenant_id", shop.id)
    .eq("id", messageId)
    .maybeSingle();
  if (!m || m.direction !== "out" || !m.content) return { error: "Pesan tidak ditemukan." };
  const { data: previous } = await supabase.from("message_deliveries").select("status, attempts").eq("message_id", messageId).maybeSingle();
  if (previous?.status === "sent") return {};
  const d = await deliverToConnector({
    tenantId: shop.id,
    conversationId: m.conversation_id as string,
    messageId,
    text: m.content as string,
    previousAttempts: (previous?.attempts as number | undefined) ?? 0,
  });
  if (!d) return { error: "Chat ini tidak tersambung ke Telegram/WhatsApp." };
  return d.ok ? {} : { error: `Belum terkirim ke ${d.channel}: ${d.reason}` };
}
