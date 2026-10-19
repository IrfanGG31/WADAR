import { describe, expect, it } from "vitest";
import { CHANNEL_ADAPTERS } from "./adapter";
import { INTEGRATIONS } from "./integrations";

describe("channel adapters (ADR-002)", () => {
  it("refuse every webhook and send until a channel is built", async () => {
    for (const adapter of Object.values(CHANNEL_ADAPTERS)) {
      const req = { method: "POST", headers: {}, query: {}, rawBody: "{}" };
      expect((await adapter.verifyWebhook(req, {})).kind).toBe("rejected");
      expect(adapter.parseInbound("{}")).toEqual([]);
      expect(await adapter.sendText("+6281", "halo", {})).toMatchObject({ ok: false, retryable: false });
    }
  });

  it("lists each planned integration once, with secrets marked", () => {
    const keys = INTEGRATIONS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    const wa = INTEGRATIONS.find((i) => i.key === "whatsapp");
    expect(wa?.fields.filter((f) => f.secret).map((f) => f.key)).toEqual(["access_token", "app_secret"]);
  });
});
