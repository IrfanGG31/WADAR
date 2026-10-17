"use server";

import { validateMemoryContent } from "@/core/consult/memory";
import { deleteMemory, updateMemory } from "@/db/memory";
import { permissionDenied } from "@/db/access";
import { getShop } from "@/db/shop";

type ActionResult = { error?: string };

const errorCode = (e: unknown) => (typeof e === "object" && e && "code" in e ? String(e.code) : "unknown");

/**
 * CON-4 "Yang WADAR tahu": the owner corrects or forgets a saved note. The Konsultasi cache
 * keys carry a fingerprint of the memory items, so the next answer already reads the change.
 * Before migration 20261017024634 (UPDATE/DELETE grants) is applied, both fail with a message.
 */
export async function updateMemoryItem(slug: string, id: string, content: string): Promise<ActionResult> {
  const checked = validateMemoryContent(content);
  if (!checked.ok) return { error: checked.error };
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "consult");
  if (denied) return { error: denied };
  try {
    if (!(await updateMemory(shop.id, id, checked.content))) return { error: "Catatan tidak ditemukan. Muat ulang halaman." };
  } catch (e) {
    console.error("memory update failed", errorCode(e));
    return { error: "Catatan belum tersimpan. Coba lagi sebentar." };
  }
  return {};
}

export async function deleteMemoryItem(slug: string, id: string): Promise<ActionResult> {
  const shop = await getShop(slug);
  const denied = await permissionDenied(shop.id, "consult");
  if (denied) return { error: denied };
  try {
    await deleteMemory(shop.id, id);
  } catch (e) {
    console.error("memory delete failed", errorCode(e));
    return { error: "Catatan belum terhapus. Coba lagi sebentar." };
  }
  return {};
}
