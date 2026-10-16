import { createHash } from "node:crypto";
import type { InsightCandidate } from "./insights";
import type { ConsultData } from "./tools";

/**
 * Cache for Konsultasi results (SPRINT-8D §5, TECH-SPEC §6.4 "Snapshot bisnis").
 * Keys carry a fingerprint of the data the answer was computed from, so a new
 * sale, stock movement, memory item or day never matches an old entry: that is
 * the invalidation. The TTL only bounds how long (and how much) we keep.
 */
export const CONSULT_CACHE_TTL_MS = 60 * 60 * 1000;
export const CONSULT_CACHE_MAX_ENTRIES = 200;

export interface TtlCache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  clear(): void;
  readonly size: number;
}

/** Map-backed LRU with a per-entry TTL. `now` is injected so tests don't sleep. */
export function createTtlCache<V>({
  ttlMs = CONSULT_CACHE_TTL_MS,
  maxEntries = CONSULT_CACHE_MAX_ENTRIES,
  now = Date.now,
}: { ttlMs?: number; maxEntries?: number; now?: () => number } = {}): TtlCache<V> {
  const entries = new Map<string, { value: V; expires: number }>();
  return {
    get(key) {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (hit.expires <= now()) {
        entries.delete(key);
        return undefined;
      }
      entries.delete(key); // re-insert → most recently used
      entries.set(key, hit);
      return hit.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, expires: now() + ttlMs });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value as string);
    },
    clear: () => entries.clear(),
    get size() {
      return entries.size;
    },
  };
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Fingerprint of everything the tools can read. Same data → same string; any change → a different one. */
export function dataVersion(data: ConsultData): string {
  return sha256(JSON.stringify(data)).slice(0, 24);
}

/** Case, spacing and trailing punctuation don't make a different question. */
export function normalizeQuestion(q: string): string {
  return q.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").replace(/[\s?!.]+$/u, "").trim();
}

export function askCacheKey(p: {
  scope: string;
  question: string;
  history: readonly { role: string; content: string }[];
  deep: boolean;
  version: string;
}): string {
  const history = sha256(p.history.map((t) => `${t.role}:${normalizeQuestion(t.content)}`).join("\n")).slice(0, 12);
  return ["ask", p.scope, p.version, p.deep ? "deep" : "fast", history, sha256(normalizeQuestion(p.question)).slice(0, 24)].join("|");
}

export function weeklyCacheKey(p: { scope: string; version: string; selected: readonly InsightCandidate[] }): string {
  const picked = sha256(p.selected.map((c) => `${c.dedupe_key}:${c.title}:${c.text}`).join("\n")).slice(0, 24);
  return ["weekly", p.scope, p.version, picked].join("|");
}
