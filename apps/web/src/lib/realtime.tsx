"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getWebEnv } from "./env";
import { createClient } from "./supabase/client";
import { getActiveTenantIdClient } from "./tenant-cookie";

type Listener = (payload: unknown) => void;

interface RealtimeContextValue {
  subscribe: (event: string, listener: Listener) => () => void;
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/**
 * One authenticated SSE connection per tab (docs/adr/004): fetch + stream
 * reader so the JWT stays in the Authorization header, reconnect with
 * exponential backoff (1 s → 30 s), dedupe by payload id.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Map<string, Set<Listener>>());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let stopped = false;
    let controller: AbortController | undefined;
    let retry = 0;
    const seen = new Set<string>();

    const dispatch = (event: string, data: string) => {
      let payload: unknown;
      try {
        payload = JSON.parse(data);
      } catch {
        return;
      }
      const id = (payload as { paymentId?: string; orderId?: string }).paymentId ?? undefined;
      if (id) {
        if (seen.has(`${event}:${id}`)) return;
        seen.add(`${event}:${id}`);
      }
      listeners.current.get(event)?.forEach((listener) => listener(payload));
    };

    async function connect() {
      while (!stopped) {
        controller = new AbortController();
        try {
          const {
            data: { session },
          } = await createClient().auth.getSession();
          const tenantId = getActiveTenantIdClient();
          if (!session || !tenantId) throw new Error("no session");
          const res = await fetch(`${getWebEnv().NEXT_PUBLIC_API_URL}/v1/events/stream`, {
            headers: { authorization: `Bearer ${session.access_token}`, "x-tenant-id": tenantId, accept: "text/event-stream" },
            signal: controller.signal,
            cache: "no-store",
          });
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
          setConnected(true);
          retry = 0;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let boundary: number;
            while ((boundary = buffer.indexOf("\n\n")) !== -1) {
              const block = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              let event = "message";
              const dataLines: string[] = [];
              for (const line of block.split("\n")) {
                if (line.startsWith("event: ")) event = line.slice(7);
                else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
              }
              if (dataLines.length > 0) dispatch(event, dataLines.join("\n"));
            }
          }
        } catch {
          // fall through to backoff
        }
        setConnected(false);
        if (stopped) return;
        const delay = Math.min(30_000, 1_000 * 2 ** retry++);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    void connect();
    return () => {
      stopped = true;
      controller?.abort();
    };
  }, []);

  const value: RealtimeContextValue = {
    connected,
    subscribe: (event, listener) => {
      const set = listeners.current.get(event) ?? new Set();
      set.add(listener);
      listeners.current.set(event, set);
      return () => set.delete(listener);
    },
  };

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/** Subscribe to one realtime event for the lifetime of the component. */
export function useTenantEvent<T>(event: string, handler: (payload: T) => void): { connected: boolean } {
  const context = useContext(RealtimeContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!context) return;
    return context.subscribe(event, (payload) => handlerRef.current(payload as T));
  }, [context, event]);
  return { connected: context?.connected ?? false };
}
