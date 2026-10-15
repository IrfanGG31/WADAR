"use server";

import { getAi } from "@/ai";
import { FaqInput, faqChunk } from "@/core/chat/kb";
import { StoreProfileInput } from "@/core/chat/store-policies";
import { getShop } from "@/db/shop";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
  /** Free-text note shown after a successful save (e.g. "tanpa embedding"). */
  note?: string;
}

/** Kebijakan toko + persona asisten (KB-1, CHT-3). */
export async function saveStoreProfile(slug: string, input: unknown): Promise<ActionResult> {
  const parsed = StoreProfileInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum lengkap." };

  const shop = await getShop(slug);
  const supabase = await createClient();
  const { error } = await supabase
    .from("store_profile")
    .update({ policies: parsed.data.policies, persona: parsed.data.persona })
    .eq("tenant_id", shop.id);
  return error ? { error: "Belum tersimpan. Coba lagi sebentar." } : {};
}

/**
 * Tambah FAQ: one document + one chunk, searched by text immediately. The vector is added when
 * the embedding model answers; without an API key it stays text-only and the status is still `ready`.
 */
export async function addFaq(slug: string, input: unknown): Promise<ActionResult> {
  const parsed = FaqInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum lengkap." };

  const shop = await getShop(slug);
  const supabase = await createClient();
  const chunk = faqChunk(parsed.data);

  const { data: doc, error: de } = await supabase
    .from("kb_documents")
    .insert({ tenant_id: shop.id, kind: "faq", title: parsed.data.question, status: "processing" })
    .select("id")
    .single();
  if (de || !doc) return { error: "FAQ belum tersimpan. Coba lagi sebentar." };

  const { error: ce } = await supabase
    .from("kb_chunks")
    .insert({ tenant_id: shop.id, document_id: doc.id, content: chunk.content, metadata: chunk.metadata });
  if (ce) {
    await supabase.from("kb_documents").update({ status: "failed", error: "Isi FAQ gagal disimpan." }).eq("id", doc.id);
    return { error: "FAQ belum tersimpan. Coba lagi sebentar." };
  }

  let note: string | undefined;
  try {
    const result = await getAi().run("embed", { texts: [chunk.content], purpose: "document" });
    const vector = result.output?.[0];
    if (vector) {
      const { error: ee } = await supabase
        .from("kb_chunks")
        .update({ embedding: JSON.stringify(vector) })
        .eq("document_id", doc.id);
      if (ee) throw ee;
    } else {
      note = "FAQ tersimpan dan bisa dicari lewat kata kunci. Pencarian makna aktif setelah kunci AI dipasang.";
    }
  } catch (e) {
    // The FAQ is still searchable by text; say so instead of marking it ready silently.
    await supabase
      .from("kb_documents")
      .update({ status: "ready", error: `Embedding gagal: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) })
      .eq("id", doc.id);
    return { note: "FAQ tersimpan, tetapi embedding gagal. Pencarian lewat kata kunci tetap jalan." };
  }
  await supabase.from("kb_documents").update({ status: "ready", error: null }).eq("id", doc.id);
  return { note };
}

export async function deleteFaq(slug: string, documentId: string): Promise<ActionResult> {
  const shop = await getShop(slug);
  const supabase = await createClient();
  const { error } = await supabase.from("kb_documents").delete().eq("tenant_id", shop.id).eq("id", documentId).eq("kind", "faq");
  return error ? { error: "FAQ belum terhapus. Coba lagi sebentar." } : {};
}
