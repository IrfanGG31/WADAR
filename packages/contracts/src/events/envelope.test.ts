import { describe, expect, it } from "vitest";
import { EventEnvelope } from "./envelope.js";

const validEnvelope = {
  id: "018f2f1e-7b1a-7b1a-8b1a-000000000001",
  type: "platform.ping.created",
  version: 1,
  tenantId: "018f2f1e-7b1a-7b1a-8b1a-000000000002",
  occurredAt: "2026-09-19T10:00:00.000Z",
  correlationId: "corr-123",
  actor: { kind: "system" as const },
  payload: { message: "hello" },
};

describe("EventEnvelope", () => {
  it("accepts a valid envelope", () => {
    const result = EventEnvelope.safeParse(validEnvelope);
    expect(result.success).toBe(true);
  });

  it("accepts an optional causationId", () => {
    const result = EventEnvelope.safeParse({ ...validEnvelope, causationId: "cmd-1" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid id", () => {
    const result = EventEnvelope.safeParse({ ...validEnvelope, id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid tenantId", () => {
    const result = EventEnvelope.safeParse({ ...validEnvelope, tenantId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid actor.kind", () => {
    const result = EventEnvelope.safeParse({
      ...validEnvelope,
      actor: { kind: "alien" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer version", () => {
    const result = EventEnvelope.safeParse({ ...validEnvelope, version: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects a missing correlationId", () => {
    const { correlationId: _correlationId, ...withoutCorrelation } = validEnvelope;
    const result = EventEnvelope.safeParse(withoutCorrelation);
    expect(result.success).toBe(false);
  });
});
