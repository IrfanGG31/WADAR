import "server-only";
import type { MemoryItem } from "@/core/consult/tools";
import { createClient } from "@/lib/supabase/server";
import { memoryQuery } from "./consult";

/** The owner's saved notes ("Yang WADAR tahu"), as the prompt sees them: pinned first, then newest. RLS: members only. */
export async function listMemory(tenantId: string): Promise<MemoryItem[]> {
  const supabase = await createClient();
  const { data, error } = await memoryQuery(supabase, tenantId);
  if (error) throw error;
  return (data ?? []) as MemoryItem[];
}

/** CON-4: changes the text of one note of this shop. false = no such note (already deleted / another shop). */
export async function updateMemory(tenantId: string, id: string, content: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("memory_items").update({ content }).eq("tenant_id", tenantId).eq("id", id).select("id");
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

/** CON-4: forgets one note of this shop. false = no such note. */
export async function deleteMemory(tenantId: string, id: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("memory_items").delete().eq("tenant_id", tenantId).eq("id", id).select("id");
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}
