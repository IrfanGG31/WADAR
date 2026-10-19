import { describe, expect, it } from "vitest";
import { CHANNEL_ADAPTERS } from "./adapter";

describe("channel adapters (ADR-002)", () => {
  it("refuse every webhook and send until a channel is built", async () => {
    for (const adapter of Object.values(CHANNEL_ADAPTERS)) {
      const req = { method: "POST", headers: {}, query: {}, rawBody: "{}" };
      expect((await adapter.verifyWebhook(req, {})).kind).toBe("rejected");
      expect(adapter.parseInbound("{}")).toEqual([]);
      expect(await adapter.sendText("+6281", "halo", {})).toMatchObject({ ok: false, retryable: false });
    }
  });
});
