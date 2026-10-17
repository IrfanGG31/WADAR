import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WeeklyDigestSummary } from "./weekly-digest";

/** GAP #5: Beranda shows the digest the weekly job stored, not a fresh computation. */
describe("WeeklyDigestSummary", () => {
  const digest = {
    week_start: "2026-10-19",
    text: "Ada 2 hal yang perlu perhatianmu minggu ini; yang paling mendesak: stok menipis.",
    generated_by: "cron" as const,
    engine: "offline" as const,
  };

  it("renders the stored narration with a caption saying the job made it", () => {
    const html = renderToStaticMarkup(createElement(WeeklyDigestSummary, { digest }));
    expect(html).toContain("Ada 2 hal yang perlu perhatianmu minggu ini; yang paling mendesak: stok menipis.");
    expect(html).toContain("Disusun otomatis untuk minggu 19 Okt 2026");
  });

  it("nothing stored → nothing rendered (the card keeps its live fallback)", () => {
    expect(renderToStaticMarkup(createElement(WeeklyDigestSummary, { digest: null }))).toBe("");
  });
});
