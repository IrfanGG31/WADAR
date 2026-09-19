import { describe, expect, it, vi } from "vitest";
import { EventBus } from "./event-bus.js";

describe("EventBus", () => {
  it("returns no consumers for an unregistered event type", () => {
    const bus = new EventBus();
    expect(bus.consumersFor("unknown.event")).toEqual([]);
  });

  it("registers and looks up a handler by event type + consumer", () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.registerHandler("platform.ping.created", "dummy-consumer", handler);

    expect(bus.consumersFor("platform.ping.created")).toEqual(["dummy-consumer"]);
    expect(bus.handlerFor("platform.ping.created", "dummy-consumer")).toBe(handler);
  });

  it("supports multiple consumers for the same event type", () => {
    const bus = new EventBus();
    bus.registerHandler("platform.ping.created", "consumer-a", vi.fn());
    bus.registerHandler("platform.ping.created", "consumer-b", vi.fn());

    expect(bus.consumersFor("platform.ping.created").sort()).toEqual([
      "consumer-a",
      "consumer-b",
    ]);
  });

  it("returns undefined for a handler that was never registered", () => {
    const bus = new EventBus();
    expect(bus.handlerFor("platform.ping.created", "nobody")).toBeUndefined();
  });
});
