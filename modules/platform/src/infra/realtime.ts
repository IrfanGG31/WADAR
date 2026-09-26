import type { Redis } from "ioredis";

export interface RealtimeMessage {
  event: string;
  payload: unknown;
  at: string;
}

export type RealtimeListener = (message: RealtimeMessage) => void;

function channelFor(tenantId: string): string {
  return `realtime:tenant:${tenantId}`;
}

/**
 * Per-tenant server→client push (docs/ARCHITECTURE.md §6.3), carried over
 * Redis pub/sub between the worker (publisher) and every api instance
 * (subscribers, which fan out to SSE clients) — see
 * docs/adr/004-realtime-sse-over-redis.md for why this replaced Supabase
 * Realtime private channels.
 *
 * A Redis connection in subscriber mode can't issue normal commands, so
 * subscriptions share one dedicated connection, created lazily (the worker
 * only publishes and never needs it), with per-channel reference counting.
 */
export class RealtimeBroker {
  private subscriber: Redis | undefined;
  private readonly listeners = new Map<string, Set<RealtimeListener>>();

  constructor(private readonly publisher: Redis) {}

  async publish(tenantId: string, event: string, payload: unknown): Promise<void> {
    const message: RealtimeMessage = { event, payload, at: new Date().toISOString() };
    await this.publisher.publish(channelFor(tenantId), JSON.stringify(message));
  }

  async subscribe(tenantId: string, listener: RealtimeListener): Promise<() => Promise<void>> {
    const subscriber = this.ensureSubscriber();
    const channel = channelFor(tenantId);
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
      await subscriber.subscribe(channel);
    }
    set.add(listener);

    return async () => {
      const current = this.listeners.get(channel);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        this.listeners.delete(channel);
        await subscriber.unsubscribe(channel);
      }
    };
  }

  async close(): Promise<void> {
    this.listeners.clear();
    await this.subscriber?.quit();
  }

  private ensureSubscriber(): Redis {
    if (this.subscriber) return this.subscriber;
    const subscriber = this.publisher.duplicate();
    subscriber.on("error", () => {});
    subscriber.on("message", (channel: string, raw: string) => {
      const set = this.listeners.get(channel);
      if (!set) return;
      let message: RealtimeMessage;
      try {
        message = JSON.parse(raw) as RealtimeMessage;
      } catch {
        return;
      }
      for (const listener of set) listener(message);
    });
    this.subscriber = subscriber;
    return subscriber;
  }
}
