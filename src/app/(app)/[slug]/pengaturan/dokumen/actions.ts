"use server";

import { revalidatePath } from "next/cache";
import { getAi } from "@/ai";
import { chunkDocument, DocInput } from "@/core/chat/kb-doc";
import { permissionDenied } from "@/db/access";
import { getShop } from "@/db/shop";
import { shopPath } from "@/lib/routes";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "../actions";

const EMBED_BATCH = 50;

/**
 * KB-2: save a text document as chat knowledge — document row (processing) → chunks → embeddings
 * → ready. Without embeddings the chunks are still found by keyword, and the page says so.
 */
export async function addDocument(slug: string, input: unknown): Promise<ActionResult> {
  const parsed = DocInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Isian belum lengkap." };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const chunks = chunkDocument(parsed.data.title, parsed.data.text);

  const { data: doc, error: de } = await supabase
    .from("kb_documents")
    .insert({ tenant_id: shop.id, kind: "doc", title: parsed.data.title, status: "processing" })
    .select("id")
    .single();
  if (de || !doc) return { error: "Dokumen belum tersimpan. Coba lagi sebentar." };
  const done = (note?: string) => {
    revalidatePath(shopPath(slug, "pengaturan/dokumen"));
    return { note };
  };

  const { data: rows, error: ce } = await supabase
    .from("kb_chunks")
    .insert(chunks.map((c) => ({ tenant_id: shop.id, document_id: doc.id, content: c.content, metadata: c.metadata })))
    .select("id");
  if (ce || !rows) {
    await supabase.from("kb_documents").update({ status: "failed", error: "Isi dokumen gagal disimpan." }).eq("id", doc.id);
    revalidatePath(shopPath(slug, "pengaturan/dokumen"));
    return { error: "Dokumen belum tersimpan. Coba lagi sebentar." };
  }

  try {
    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const result = await getAi().run("embed", { texts: batch.map((c) => c.content), purpose: "document" });
      const vectors = result.output;
      if (!vectors) {
        await supabase.from("kb_documents").update({ status: "ready", error: null }).eq("id", doc.id);
        return done("Dokumen tersimpan dan bisa dicari lewat kata kunci.");
      }
      for (let j = 0; j < batch.length; j++) {
        const id = (rows[i + j] as { id: string } | undefined)?.id;
        const vector = vectors[j];
        if (!id || !vector) continue;
        const { error: ee } = await supabase.from("kb_chunks").update({ embedding: JSON.stringify(vector) }).eq("id", id);
        if (ee) throw ee;
      }
    }
  } catch (e) {
    // Provider messages can carry key fragments: log, never store or show.
    console.error("doc embedding failed", e);
    await supabase.from("kb_documents").update({ status: "ready", error: "Embedding gagal. Pencarian lewat kata kunci tetap jalan." }).eq("id", doc.id);
    return done("Dokumen tersimpan, tetapi embedding gagal. Pencarian lewat kata kunci tetap jalan.");
  }
  await supabase.from("kb_documents").update({ status: "ready", error: null }).eq("id", doc.id);
  return done();
}

export async function deleteDocument(slug: string, documentId: string): Promise<ActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "settings");
  if (denied) return { error: denied };
  const supabase = await createClient();
  const { error } = await supabase.from("kb_documents").delete().eq("tenant_id", shop.id).eq("id", documentId).eq("kind", "doc");
  if (error) return { error: "Dokumen belum terhapus. Coba lagi sebentar." };
  revalidatePath(shopPath(slug, "pengaturan/dokumen"));
  return {};
}
