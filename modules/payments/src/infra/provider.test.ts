import { describe, expect, it } from "vitest";
import { SimulatorProvider, buildReferenceId, parseReferenceId, toProviderPayment } from "./provider.js";

const tenant = "01a0df39-a7cd-724e-b107-95005d6b51d9";
const intent = "01a0df39-a7ef-70f0-a2f3-dcbd23f05e48";

describe("reference id (carries the tenant through the unauthenticated webhook)", () => {
  it("round-trips and rejects anything else", () => {
    expect(parseReferenceId(buildReferenceId(tenant, intent))).toEqual({ tenantId: tenant, intentId: intent });
    expect(parseReferenceId("order-123")).toBeNull();
    expect(parseReferenceId(`${tenant}_${intent}_x`)).toBeNull();
  });
});

describe("toProviderPayment (Xendit qr.payment data)", () => {
  it("maps id, amount, source and time", () => {
    expect(
      toProviderPayment({
        id: "qrpy_123",
        reference_id: buildReferenceId(tenant, intent),
        amount: 125000,
        status: "SUCCEEDED",
        created: "2026-09-26T10:00:00Z",
        payment_detail: { source: "DANA" },
      }),
    ).toEqual({
      providerEventId: "qrpy_123",
      referenceId: `${tenant}_${intent}`,
      amount: 125_000,
      source: "DANA",
      paidAt: new Date("2026-09-26T10:00:00Z"),
    });
  });

  it("defaults the source to QRIS", () => {
    expect(toProviderPayment({ id: "x", reference_id: "r", amount: 1, status: "SUCCEEDED" }).source).toBe("QRIS");
  });
});

describe("SimulatorProvider", () => {
  it("never calls the network and embeds the reference", async () => {
    const qr = await new SimulatorProvider().createQris({ referenceId: "ref", amount: 1000 });
    expect(qr.qrString).toContain("ref");
    expect(await new SimulatorProvider().listQrPayments()).toEqual([]);
  });
});
