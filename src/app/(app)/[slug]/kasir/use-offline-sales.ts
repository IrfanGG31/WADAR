"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  dismissRejected,
  EMPTY_QUEUE,
  enqueueSale,
  flushQueue,
  mergeAfterFlush,
  parseQueue,
  queueStorageKey,
  serializeQueue,
  type OfflineQueue,
  type OfflineSalePayload,
} from "@/core/offline-sales";
import { recordSale } from "./actions";

function read(slug: string): OfflineQueue {
  try {
    return parseQueue(window.localStorage.getItem(queueStorageKey(slug)));
  } catch {
    return EMPTY_QUEUE;
  }
}

function write(slug: string, queue: OfflineQueue): boolean {
  try {
    window.localStorage.setItem(queueStorageKey(slug), serializeQueue(queue));
    return true;
  } catch {
    return false;
  }
}

/**
 * Offline sales on this device (POS-6): localStorage per shop, resent when the
 * Kasir opens and on the browser's `online` event. The storage is re-read
 * before every change so two tabs don't overwrite each other's entries;
 * a sale both tabs send is still recorded once (idempotency key).
 */
export function useOfflineSales(slug: string, onSynced: () => void) {
  const [queue, setQueue] = useState<OfflineQueue>(EMPTY_QUEUE);
  const [syncing, setSyncing] = useState(false);
  const inFlight = useRef(false);

  const sync = useCallback(async () => {
    if (inFlight.current || !navigator.onLine) return;
    const start = read(slug);
    if (start.pending.length === 0) return;
    inFlight.current = true;
    setSyncing(true);
    try {
      const result = await flushQueue(start, (p) => recordSale(slug, p));
      // Keep anything another tab queued (or dismissed) while we were sending.
      const merged = mergeAfterFlush(start, result.queue, read(slug));
      write(slug, merged);
      setQueue(merged);
      if (result.synced > 0) onSynced();
    } finally {
      inFlight.current = false;
      setSyncing(false);
    }
  }, [slug, onSynced]);

  useEffect(() => {
    // Mirror localStorage into state after mount, then resend what was left from earlier.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external store read once on mount
    setQueue(read(slug));
    void sync();
    const onOnline = () => void sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === queueStorageKey(slug)) setQueue(read(slug));
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("storage", onStorage);
    };
  }, [slug, sync]);

  /** Keep a sale that could not reach the server. Returns false when it could not be stored. */
  const enqueue = useCallback(
    (payload: OfflineSalePayload, meta: { total: number; items: number }): "queued" | "full" | "failed" => {
      const result = enqueueSale(read(slug), payload, { ...meta, now: new Date() });
      if (result.full) return "full";
      if (!write(slug, result.queue)) return "failed";
      setQueue(result.queue);
      return "queued";
    },
    [slug],
  );

  const dismiss = useCallback(
    (key: string) => {
      const next = dismissRejected(read(slug), key);
      write(slug, next);
      setQueue(next);
    },
    [slug],
  );

  return { queue, syncing, sync, enqueue, dismiss };
}
