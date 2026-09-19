import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

export interface CorrelationContext {
  correlationId: string;
}

export const correlationIdStorage = new AsyncLocalStorage<CorrelationContext>();

export function getCorrelationId(): string | undefined {
  return correlationIdStorage.getStore()?.correlationId;
}

/**
 * Fastify onRequest hook: reads/generates x-correlation-id, stores it in
 * AsyncLocalStorage for the rest of the request (pino logger, outbox writes,
 * BullMQ job data all read it from here — docs/ARCHITECTURE.md §10).
 */
export function correlationIdHook(
  request: { headers: Record<string, unknown> },
  _reply: unknown,
  done: () => void,
): void {
  const headerValue = request.headers["x-correlation-id"];
  const correlationId = typeof headerValue === "string" && headerValue.length > 0
    ? headerValue
    : randomUUID();
  correlationIdStorage.run({ correlationId }, done);
}
