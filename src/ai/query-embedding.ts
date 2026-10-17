import { normalizeText } from "@/core/chat/text";
import type { Ai } from "./run";

/** Turns a buyer question into a query vector, or null (offline, timeout, provider error). Never throws. */
export type QueryEmbedder = (text: string) => Promise<number[] | null>;

/** The widget waits this long at most; past it the turn uses keyword search alone. */
export const QUERY_EMBED_TIMEOUT_MS = 2000;
export const QUERY_EMBED_TTL_MS = 6 * 60 * 60 * 1000;
export const QUERY_EMBED_MAX_ENTRIES = 500;

/**
 * Query embeddings for KB search with a per-instance cache keyed by the
 * normalized question ("Bisa COD?" and "bisa cod" share one call). Only real
 * vectors are cached: an offline / failed answer is retried on the next turn.
 */
export function createQueryEmbedder(
  ai: Pick<Ai, "run">,
  {
    now = Date.now,
    ttlMs = QUERY_EMBED_TTL_MS,
    maxEntries = QUERY_EMBED_MAX_ENTRIES,
    timeoutMs = QUERY_EMBED_TIMEOUT_MS,
  }: { now?: () => number; ttlMs?: number; maxEntries?: number; timeoutMs?: number } = {},
): QueryEmbedder {
  const cache = new Map<string, { vector: number[]; expiresAt: number }>();

  return async (text) => {
    const key = normalizeText(text);
    if (!key) return null;
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now()) {
      // Refresh recency so the oldest entry is evicted first.
      cache.delete(key);
      cache.set(key, hit);
      return hit.vector;
    }
    cache.delete(key);
    try {
      const result = await ai.run("embed", { texts: [text], purpose: "query" }, { timeoutMs });
      const vector = result.engine === "offline" ? null : (result.output?.[0] ?? null);
      if (!vector) return null;
      cache.set(key, { vector, expiresAt: now() + ttlMs });
      while (cache.size > maxEntries) cache.delete(cache.keys().next().value!);
      return vector;
    } catch (e) {
      console.error("query embedding failed", e);
      return null;
    }
  };
}
