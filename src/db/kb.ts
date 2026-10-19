import "server-only";
import { parsePersona, parsePolicies, type StorePersona, type StorePolicies } from "@/core/chat/store-policies";
import type { KbStatus } from "@/core/chat/kb";
import { createClient } from "@/lib/supabase/server";

export async function getStoreProfile(tenantId: string): Promise<{ policies: StorePolicies; persona: StorePersona }> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("store_profile").select("policies, persona").eq("tenant_id", tenantId).maybeSingle();
  if (error) throw error;
  return { policies: parsePolicies(data?.policies), persona: parsePersona(data?.persona) };
}

export interface FaqRow {
  id: string;
  question: string;
  answer: string;
  status: KbStatus;
  error: string | null;
  embedded: boolean;
}

export async function listFaqs(tenantId: string): Promise<FaqRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kb_documents")
    .select("id, title, status, error, kb_chunks(metadata, embedding)")
    .eq("tenant_id", tenantId)
    .eq("kind", "faq")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((d) => {
    const chunk = (d.kb_chunks as { metadata: { question?: string; answer?: string }; embedding: unknown }[] | null)?.[0];
    return {
      id: d.id as string,
      question: chunk?.metadata?.question ?? (d.title as string | null) ?? "",
      answer: chunk?.metadata?.answer ?? "",
      status: d.status as KbStatus,
      error: d.error as string | null,
      embedded: Boolean(chunk?.embedding),
    };
  });
}

export interface DocRow {
  id: string;
  title: string;
  status: KbStatus;
  error: string | null;
  chunks: number;
  created_at: string;
}

/** KB-2: the owner's uploaded documents with their processing state. */
export async function listDocs(tenantId: string): Promise<DocRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kb_documents")
    .select("id, title, status, error, created_at, kb_chunks(count)")
    .eq("tenant_id", tenantId)
    .eq("kind", "doc")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map((d) => ({
    id: d.id as string,
    title: (d.title as string | null) ?? "Dokumen",
    status: d.status as KbStatus,
    error: d.error as string | null,
    chunks: ((d.kb_chunks as { count: number }[] | null)?.[0]?.count as number) ?? 0,
    created_at: d.created_at as string,
  }));
}
