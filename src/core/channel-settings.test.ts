import { describe, expect, it } from "vitest";
import { ChannelFeeInput, NewChannelInput, canDeactivate, estimateFee } from "./channel-settings";

describe("channel settings (FIN-2)", () => {
  it("validates commission", () => {
    expect(ChannelFeeInput.safeParse({ fee_pct: 12.5, fee_fixed: 1250, is_active: true }).success).toBe(true);
    expect(ChannelFeeInput.safeParse({ fee_pct: -1, fee_fixed: 0, is_active: true }).success).toBe(false);
    expect(ChannelFeeInput.safeParse({ fee_pct: 75, fee_fixed: 0, is_active: true }).error?.issues[0].message).toMatch(/salah ketik/);
    expect(ChannelFeeInput.safeParse({ fee_pct: 1.2345, fee_fixed: 0, is_active: true }).success).toBe(false);
    expect(ChannelFeeInput.safeParse({ fee_pct: 10, fee_fixed: 10.5, is_active: true }).success).toBe(false);
  });

  it("new channel needs a known kind and a name", () => {
    expect(NewChannelInput.safeParse({ kind: "tokopedia", name: "Tokopedia", fee_pct: 10, fee_fixed: 1000 }).success).toBe(true);
    expect(NewChannelInput.safeParse({ kind: "lazada", name: "Lazada", fee_pct: 10, fee_fixed: 0 }).success).toBe(false);
    expect(NewChannelInput.safeParse({ kind: "other", name: " ", fee_pct: 0, fee_fixed: 0 }).success).toBe(false);
  });

  it("the cashier channel stays on", () => {
    expect(canDeactivate("pos")).toBe(false);
    expect(canDeactivate("shopee")).toBe(true);
  });

  it("estimates the fee like app.estimate_platform_fee", () => {
    expect(estimateFee(200_000, 12, 1250)).toBe(25_250);
    expect(estimateFee(99_999, 12.5, 0)).toBe(12_500); // 12.499,875 → half up
    expect(estimateFee(10, 15, 0)).toBe(2); // 1,5 → 2
    expect(estimateFee(0, 0, 0)).toBe(0);
    expect(estimateFee(0, 10, 1000)).toBe(1000);
    expect(estimateFee(900_000_000_000, 19.999, 0)).toBe(179_991_000_000);
  });
});
