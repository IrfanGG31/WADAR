"use server";

import { OwnerReplyInput } from "@/core/chat/inbox";
import { permissionDenied } from "@/db/access";
import { getShop } from "@/db/shop";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
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
  const { error } = await supabase.from("messages").insert({
    tenant_id: shop.id,
    conversation_id: conversationId,
    direction: "out",
    author: "human",
    content: parsed.data.text,
  });
  return error ? { error: "Balasan belum terkirim. Coba lagi sebentar." } : {};
}
