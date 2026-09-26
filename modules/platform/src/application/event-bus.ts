import type { Tx } from "../infra/outbox.repository.js";

export interface EventMeta {
  eventId: string;
  eventType: string;
}

export type EventHandler = (tx: Tx, payload: unknown, tenantId: string, meta: EventMeta) => Promise<void>;

interface Registration {
  consumerName: string;
  handler: EventHandler;
}

/**
 * In-process registry mapping event type -> consumers interested in it
 * (ARCHITECTURE §4: "event bus in-process dengan envelope"). The outbox relay
 * consults this to decide which per-consumer BullMQ queues to publish to.
 */
export class EventBus {
  private readonly registrations = new Map<string, Registration[]>();

  registerHandler(eventType: string, consumerName: string, handler: EventHandler): void {
    const existing = this.registrations.get(eventType) ?? [];
    existing.push({ consumerName, handler });
    this.registrations.set(eventType, existing);
  }

  consumersFor(eventType: string): string[] {
    return (this.registrations.get(eventType) ?? []).map((r) => r.consumerName);
  }

  allConsumerNames(): string[] {
    const names = new Set<string>();
    for (const registrations of this.registrations.values()) {
      for (const r of registrations) names.add(r.consumerName);
    }
    return [...names];
  }

  handlerFor(eventType: string, consumerName: string): EventHandler | undefined {
    return this.registrations
      .get(eventType)
      ?.find((r) => r.consumerName === consumerName)?.handler;
  }
}
