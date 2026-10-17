/** "Yang WADAR tahu" (CON-4): the owner edits a saved note; same bounds as `memory_items.content`. */
export const MEMORY_MIN_CHARS = 3;
export const MEMORY_MAX_CHARS = 280;

export const MEMORY_KIND_LABEL = { preference: "Aturan", fact: "Fakta", decision: "Keputusan" } as const;

export function validateMemoryContent(raw: string): { ok: true; content: string } | { ok: false; error: string } {
  const content = raw.replace(/\s+/g, " ").trim();
  if (content.length < MEMORY_MIN_CHARS) return { ok: false, error: `Catatan minimal ${MEMORY_MIN_CHARS} huruf.` };
  if (content.length > MEMORY_MAX_CHARS) return { ok: false, error: `Catatan maksimal ${MEMORY_MAX_CHARS} huruf.` };
  return { ok: true, content };
}
