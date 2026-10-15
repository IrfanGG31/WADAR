import { describe, expect, it } from "vitest";
import { makeData } from "./fixture";
import { answerOffline, chooseTier, deepQuotaLeft, detectRemember, isDeepQuestion, planTools, periodFromQuestion } from "./question";

describe("detectRemember (CON-4)", () => {
  it.each([
    ["Ingat ya, jangan pernah diskon di atas 15%", "preference", "jangan pernah diskon di atas 15%"],
    ["Catat bahwa supplier serum libur tiap Minggu", "fact", "supplier serum libur tiap Minggu"],
    ["Selalu bandingkan dengan minggu lalu", "preference", "Selalu bandingkan dengan minggu lalu"],
    ["Jangan pernah rekomendasikan promo buy 1 get 1.", "preference", "Jangan pernah rekomendasikan promo buy 1 get 1"],
  ])("%s", (text, kind, content) => {
    expect(detectRemember(text)).toEqual({ kind, content });
  });
  it("is not triggered by questions or ordinary sentences", () => {
    expect(detectRemember("Apa yang harus selalu kupesan?")).toBeNull();
    expect(detectRemember("Berapa penjualan hari ini")).toBeNull();
    expect(detectRemember("ingat")).toBeNull();
  });
});

describe("deep analysis gate", () => {
  it("detects reasoning questions", () => {
    expect(isDeepQuestion("Kenapa untungku turun?")).toBe(true);
    expect(isDeepQuestion("Strategi apa untuk bulan depan")).toBe(true);
    expect(isDeepQuestion("Bagaimana cara menaikkan margin?")).toBe(true);
    expect(isDeepQuestion("Berapa penjualan hari ini?")).toBe(false);
  });
  it("deep quota is 20% of the month's consult calls, first one allowed", () => {
    expect(deepQuotaLeft(0, 0)).toBe(true);
    expect(deepQuotaLeft(4, 1)).toBe(false); // 1 of 5 = 20% already
    expect(deepQuotaLeft(9, 1)).toBe(true); // ceil(10 × 0.2) = 2
    expect(deepQuotaLeft(9, 2)).toBe(false);
  });
  it("is never automatic: needs the button, a deep question and quota", () => {
    const q = "Kenapa untungku turun?";
    expect(chooseTier({ question: q, deepRequested: false, totalThisMonth: 0, deepThisMonth: 0 })).toEqual({ tier: "consult_fast", reason: "fast" });
    expect(chooseTier({ question: q, deepRequested: true, totalThisMonth: 0, deepThisMonth: 0 })).toEqual({ tier: "consult_deep", reason: "deep" });
    expect(chooseTier({ question: "Berapa omzet?", deepRequested: true, totalThisMonth: 0, deepThisMonth: 0 }).reason).toBe("deep_not_applicable");
    expect(chooseTier({ question: q, deepRequested: true, totalThisMonth: 4, deepThisMonth: 1 })).toEqual({ tier: "consult_fast", reason: "deep_quota_exhausted" });
  });
});

describe("router", () => {
  it("period words", () => {
    expect(periodFromQuestion("untung bulan ini")).toBe("this_month");
    expect(periodFromQuestion("omzet kemarin")).toBe("yesterday");
    expect(periodFromQuestion("omzet")).toBe("7d");
  });
  it("falls back to the business snapshot", () => {
    expect(planTools("halo")).toEqual([{ name: "get_business_snapshot", args: {} }]);
  });
  it("never reads the question as a customer-chat input: the offline answer carries the tools it used", () => {
    const r = answerOffline("stok apa yang habis?", makeData());
    expect(r.runs.map((x) => x.name)).toEqual(["get_stock_status"]);
  });
});
