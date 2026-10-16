import { describe, expect, it } from "vitest";
import { checkGrounding, collectEvidence, extractClaims, groundAnswer, type Evidence } from "./grounding";

const ev = (numbers: number[], percents: number[] = []): Evidence => ({ numbers, percents });

describe("extractClaims", () => {
  it("reads rupiah in Indonesian formats", () => {
    const c = extractClaims("Untung Rp1.250.000, modal Rp 500.000 dan komisi Rp75.500.");
    expect(c.map((x) => [x.kind, x.value])).toEqual([["rupiah", 1_250_000], ["rupiah", 500_000], ["rupiah", 75_500]]);
  });
  it("reads unit shorthand with decimals and widens the tolerance to the shown precision", () => {
    const [juta] = extractClaims("sekitar Rp1,2 juta");
    expect(juta.value).toBe(1_200_000);
    expect(juta.tolerance).toBe(51_000); // ±50.000 rounding + Rp1.000
    const [rb] = extractClaims("Rp850 rb");
    expect(rb.value).toBe(850_000);
    expect(extractClaims("Rp2,5 jt")[0].value).toBe(2_500_000);
  });
  it("reads percentages and 'persen'", () => {
    expect(extractClaims("margin 28,6% dan komisi 18 persen").map((x) => x.value)).toEqual([28.6, 18]);
  });
  it("ignores dates, years, times and day counts", () => {
    expect(extractClaims("pada 2026-10-14 (tahun 2026) jam 10:30, habis 3 hari lagi, 7 hari terakhir")).toEqual([]);
  });
  it("reads plain amounts ≥ 1.000 without Rp", () => {
    expect(extractClaims("omzet 1.250.000 minggu ini").map((x) => x.value)).toEqual([1_250_000]);
    expect(extractClaims("omzet 1250000").map((x) => x.value)).toEqual([1_250_000]);
  });
  it("reads IDR and 'rupiah'", () => {
    expect(extractClaims("IDR 1.250.000 dan IDR2,5 juta").map((x) => [x.kind, x.value])).toEqual([["rupiah", 1_250_000], ["rupiah", 2_500_000]]);
    expect(extractClaims("untung 75000 rupiah, lalu 1.250 rupiah").map((x) => [x.kind, x.value])).toEqual([["rupiah", 75_000], ["rupiah", 1_250]]);
  });
  it("reads counts with a unit", () => {
    expect(extractClaims("terjual 120 pcs dan 3 botol").map((x) => [x.kind, x.value])).toEqual([["count", 120], ["count", 3]]);
  });
  it("reads the direction written right before a number", () => {
    const c = extractClaims("omzet turun 30%, untung naik Rp77.340, lalu turun jadi Rp500.000");
    expect(c.map((x) => [x.value, x.direction ?? null])).toEqual([[77_340, "up"], [500_000, null], [30, "down"]]);
  });
});

describe("checkGrounding", () => {
  it("passes amounts within Rp1.000 and percents within 1 point", () => {
    expect(checkGrounding("Untung Rp897.560 (naik 3,4%)", ev([897_000], [3.0])).ok).toBe(true);
  });
  it("fails when an amount or percent is off", () => {
    const r = checkGrounding("Untung Rp900.000 dan margin 40%", ev([897_560], [28.6]));
    expect(r.ok).toBe(false);
    expect(r.ungrounded.map((c) => c.text)).toEqual(["Rp900.000", "40%"]);
  });
  it("compares absolute values (a drop of Rp77.340 matches -77340)", () => {
    const e = collectEvidence({ delta: -77_340, delta_pct: -10.7 });
    expect(checkGrounding("turun Rp77.340 (10,7%)", e).ok).toBe(true);
  });
  it("rejects the wrong direction: 'turun 30%' when the data rose 30%", () => {
    const e = collectEvidence({ R_delta: 300_000, R_delta_pct: 30 });
    expect(checkGrounding("Omzet turun 30%.", e).ok).toBe(false);
    expect(checkGrounding("Omzet turun Rp300.000.", e).ok).toBe(false);
    expect(checkGrounding("Omzet naik 30% (Rp300.000).", e).ok).toBe(true);
  });
  it("reads the direction of template sentences in the evidence", () => {
    const e = collectEvidence("Untung bersih turun Rp77.340 (10,7%).");
    expect(checkGrounding("untung naik Rp77.340", e).ok).toBe(false);
    expect(checkGrounding("untung turun Rp77.340", e).ok).toBe(true);
  });
  it("checks plain numbers, IDR, rupiah and counts against the evidence", () => {
    const e = collectEvidence({ R: 1_250_000, q: 12 });
    expect(checkGrounding("Omzet 1.250.000, terjual 12 pcs.", e).ok).toBe(true);
    for (const bad of ["Omzet 9.999.999.", "Omzet IDR 9.999.999.", "Omzet 9999999 rupiah.", "Terjual 120 pcs."]) {
      expect(checkGrounding(bad, e).ok, bad).toBe(false);
    }
  });
  it("an empty or whitespace answer fails", () => {
    expect(checkGrounding("", ev([1])).ok).toBe(false);
    expect(checkGrounding("  \n ", ev([1]))).toMatchObject({ ok: false, empty: true });
  });
  it("marks claims that only echo the question", () => {
    const r = checkGrounding("Omzet turun 33%.", ev([], [5]), "kenapa omzet turun 33%?");
    expect(r.ok).toBe(false);
    expect(r.fromQuestion.map((c) => c.text)).toEqual(["33%"]);
  });
  it("does not let a rupiah claim match a percent value", () => {
    expect(checkGrounding("Rp28", collectEvidence({ margin_pct: 28 })).ok).toBe(false);
  });
});

describe("collectEvidence", () => {
  it("walks nested results and the numbers inside template strings", () => {
    const e = collectEvidence({ rows: [{ R: 1000, margin_pct: 12.5 }] }, "Komisi 21,2% dari Rp192.240");
    expect(e.numbers).toEqual(expect.arrayContaining([1000, 192_240]));
    expect(e.percents).toEqual(expect.arrayContaining([12.5, 21.2]));
  });
});

describe("groundAnswer", () => {
  const base = { evidence: () => ev([500_000]), template: () => "TEMPLATE Rp500.000" };

  it("accepts a grounded first draft", async () => {
    const r = await groundAnswer({ ...base, generate: async () => "Untung Rp500.000." });
    expect(r).toMatchObject({ source: "model", attempts: 1, text: "Untung Rp500.000." });
  });

  it("regenerates once with feedback and accepts the corrected draft", async () => {
    const feedbacks: (string | undefined)[] = [];
    const r = await groundAnswer({
      ...base,
      generate: async (fb) => {
        feedbacks.push(fb);
        return fb ? "Untung Rp500.000." : "Untung Rp900.000.";
      },
    });
    expect(r).toMatchObject({ source: "regenerated", attempts: 2 });
    expect(feedbacks[0]).toBeUndefined();
    expect(feedbacks[1]).toContain("Rp900.000");
  });

  it("replaces the answer with the template after two failures and reports what was wrong", async () => {
    let calls = 0;
    const rejected: number[] = [];
    const r = await groundAnswer({
      ...base,
      generate: async () => `Untung Rp${++calls}.000.000.`,
      onReject: ({ attempt }) => rejected.push(attempt),
    });
    expect(calls).toBe(2);
    expect(r).toMatchObject({ source: "template", attempts: 2, text: "TEMPLATE Rp500.000" });
    expect(r.rejected.map((c) => c.text)).toEqual(["Rp2.000.000"]);
    expect(rejected).toEqual([1, 2]);
  });

  it("regenerates an empty draft, then falls back to the template", async () => {
    const feedbacks: (string | undefined)[] = [];
    const r = await groundAnswer({
      ...base,
      generate: async (fb) => {
        feedbacks.push(fb);
        return " ";
      },
    });
    expect(feedbacks[1]).toMatch(/kosong/i);
    expect(r).toMatchObject({ source: "template", text: "TEMPLATE Rp500.000" });
  });

  it("uses evidence gathered while drafting (tool calls happen inside generate)", async () => {
    const seen: number[] = [];
    const r = await groundAnswer({
      generate: async () => {
        seen.push(250_000);
        return "Komisi Rp250.000.";
      },
      evidence: () => ev(seen),
      template: () => "T",
    });
    expect(r.source).toBe("model");
  });
});
