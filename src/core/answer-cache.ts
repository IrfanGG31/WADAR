/**
 * Answer cache (PDF §C.1 Tabel 9 "caching jawaban FAQ dan ringkasan harian"):
 * a key → value store with a per-entry TTL that is read BEFORE a model is
 * called. Keys carry the tenant and a fingerprint of the data the answer was
 * built from, so a hit is always an answer to the same question over the same
 * data. Two implementations: in-memory (per serverless instance, tests) and
 * the `ai_answer_cache` table (shared across instances, src/db/answer-cache.ts),
 * usually layered.
 */
export interface AnswerStore {
  get<V>(key: string): Promise<V | null>;
  set<V>(key: string, value: V, ttlMs: number): Promise<void>;
}

export const ANSWER_CACHE_MAX_ENTRIES = 500;

/** Map-backed LRU with a per-entry TTL. `now` is injected so tests don't sleep. */
export function memoryAnswerStore({ now = Date.now, maxEntries = ANSWER_CACHE_MAX_ENTRIES }: { now?: () => number; maxEntries?: number } = {}): AnswerStore {
  const entries = new Map<string, { value: unknown; expires: number }>();
  return {
    async get<V>(key: string) {
      const hit = entries.get(key);
      if (!hit) return null;
      entries.delete(key);
      if (hit.expires <= now()) return null;
      entries.set(key, hit); // re-insert → most recently used
      return hit.value as V;
    },
    async set(key, value, ttlMs) {
      entries.delete(key);
      entries.set(key, { value, expires: now() + ttlMs });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value as string);
    },
  };
}

/** Memory first (no round trip), then the shared store; a shared hit warms the memory layer. */
export function layeredAnswerStore(memory: AnswerStore, shared: AnswerStore, warmTtlMs: number): AnswerStore {
  return {
    async get<V>(key: string) {
      const local = await memory.get<V>(key);
      if (local !== null) return local;
      const hit = await shared.get<V>(key);
      if (hit !== null) await memory.set(key, hit, warmTtlMs);
      return hit;
    },
    async set(key, value, ttlMs) {
      await memory.set(key, value, ttlMs);
      await shared.set(key, value, ttlMs);
    },
  };
}

/** A cache must never break a turn: read errors are misses, write errors are dropped. */
export async function safeGet<V>(store: AnswerStore, key: string): Promise<V | null> {
  try {
    return await store.get<V>(key);
  } catch {
    return null;
  }
}

export async function safeSet<V>(store: AnswerStore, key: string, value: V, ttlMs: number): Promise<void> {
  try {
    await store.set(key, value, ttlMs);
  } catch {
    /* a cache that cannot be written only costs a future model call */
  }
}
