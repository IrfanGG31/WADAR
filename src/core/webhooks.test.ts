import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { nextAttemptDelay, signWebhook, webhookBody, WebhookInput, webhookUrlProblem } from "./webhooks";

describe("webhooks", () => {
  it("accepts only public https addresses and known events", () => {
    expect(webhookUrlProblem("https://hooks.zapier.com/hooks/catch/1/abc")).toBeNull();
    expect(webhookUrlProblem("http://example.com")).toContain("https");
    expect(webhookUrlProblem("https://127.0.0.1/x")).toContain("internal");
    expect(webhookUrlProblem("https://localhost/x")).toContain("internal");
    expect(WebhookInput.safeParse({ url: "https://x.example.com", events: [] }).error?.issues[0]?.message).toBe("Pilih minimal satu kejadian.");
    expect(WebhookInput.safeParse({ url: "https://x.example.com", events: ["sale.deleted"] }).success).toBe(false);
  });

  it("signs timestamp + body so the receiver can verify it", () => {
    const body = webhookBody({ id: "e1", type: "sale.created", created_at: "2026-10-20T01:00:00Z", payload: { total: 100000 } }, "glow");
    expect(JSON.parse(body)).toEqual({ id: "e1", type: "sale.created", created_at: "2026-10-20T01:00:00Z", shop: "glow", data: { total: 100000 } });
    const sig = signWebhook("whsec_x", body, 1760922000);
    expect(sig).toBe(`t=1760922000,v1=${createHmac("sha256", "whsec_x").update(`1760922000.${body}`).digest("hex")}`);
  });

  it("retries with growing pauses, then gives up", () => {
    expect([1, 2, 3, 4, 5].map(nextAttemptDelay)).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 43_200_000]);
    expect(nextAttemptDelay(6)).toBeNull();
  });
});
