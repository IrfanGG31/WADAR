import { describe, expect, it } from "vitest";
import { correlationIdHook, correlationIdStorage, getCorrelationId } from "./correlation-id.js";

describe("correlation id", () => {
  it("returns undefined outside of a request context", () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it("reuses an incoming x-correlation-id header", async () => {
    await new Promise<void>((resolve) => {
      correlationIdHook(
        { headers: { "x-correlation-id": "incoming-123" } },
        {},
        () => {
          expect(getCorrelationId()).toBe("incoming-123");
          resolve();
        },
      );
    });
  });

  it("generates a correlation id when the header is missing", async () => {
    await new Promise<void>((resolve) => {
      correlationIdHook({ headers: {} }, {}, () => {
        expect(getCorrelationId()).toMatch(/^[0-9a-f-]{36}$/);
        resolve();
      });
    });
  });

  it("isolates correlation ids across concurrent contexts", async () => {
    const results = await Promise.all(
      ["a", "b"].map(
        (id) =>
          new Promise<string | undefined>((resolve) => {
            correlationIdStorage.run({ correlationId: id }, () => {
              resolve(getCorrelationId());
            });
          }),
      ),
    );
    expect(results).toEqual(["a", "b"]);
  });
});
