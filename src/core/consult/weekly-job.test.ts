import { describe, expect, it, vi } from "vitest";
import { digestCaption, digestMessage, runWeeklyInsightJob, type DigestShop, type WeeklyDigest, type WeeklyJobDeps } from "./weekly-job";

const GLOW: DigestShop = { id: "t1", name: "Glow Beauty", slug: "glow", timezone: "Asia/Jakarta" };
const KOPI: DigestShop = { id: "t2", name: "Kopi Dimas", slug: "kopi", timezone: "Asia/Jakarta" };
// Monday 19 Oct 2026, 07.00 WIB — when the Vercel Cron fires (00.00 UTC).
const MONDAY_7_WIB = new Date("2026-10-19T00:00:00Z");

/** In-memory digest table with the same (tenant_id, week_start) uniqueness as SQL. */
function deps(shops: DigestShop[], overrides: Partial<WeeklyJobDeps> = {}) {
  const table = new Map<string, WeeklyDigest>();
  const key = (t: string, w: string) => `${t}:${w}`;
  const d: WeeklyJobDeps = {
    listShops: async () => shops,
    hasDigest: async (t, w) => table.has(key(t, w)),
    build: vi.fn(async (shop: DigestShop, today: string) => ({
      text: `Ringkasan ${shop.name} ${today}`,
      points: ["Stok menipis: Serum tinggal 2"],
      insight_keys: ["low_stock:svc-20"],
      engine: "offline" as const,
      model: "offline:template-v1",
      source: "offline",
    })),
    save: async (digest) => {
      if (table.has(key(digest.tenant_id, digest.week_start))) return false;
      table.set(key(digest.tenant_id, digest.week_start), digest);
      return true;
    },
    deliver: vi.fn(async () => ({ status: "not_configured" as const })),
    markDelivery: vi.fn(async () => {}),
    ...overrides,
  };
  return { d, table };
}

describe("runWeeklyInsightJob", () => {
  it("stores exactly one digest per shop for the shop's current week", async () => {
    const { d, table } = deps([GLOW, KOPI]);
    const report = await runWeeklyInsightJob(d, MONDAY_7_WIB);
    expect(report).toMatchObject({ shops: 2, created: 2, skipped: 0, failed: 0 });
    expect([...table.keys()]).toEqual(["t1:2026-10-19", "t2:2026-10-19"]);
    expect(table.get("t1:2026-10-19")).toMatchObject({ generated_by: "cron", text: "Ringkasan Glow Beauty 2026-10-19", points: ["Stok menipis: Serum tinggal 2"] });
    expect(d.build).toHaveBeenCalledWith(GLOW, "2026-10-19");
  });

  it("is safe to run again: the same week is skipped without loading data or re-sending", async () => {
    const { d, table } = deps([GLOW, KOPI]);
    await runWeeklyInsightJob(d, MONDAY_7_WIB);
    const again = await runWeeklyInsightJob(d, new Date("2026-10-21T03:00:00Z"));
    expect(again).toMatchObject({ created: 0, skipped: 2, failed: 0 });
    expect(again.results.map((r) => r.status)).toEqual(["exists", "exists"]);
    expect(table.size).toBe(2);
    expect(d.build).toHaveBeenCalledTimes(2);
    expect(d.deliver).toHaveBeenCalledTimes(2);
  });

  it("a new week makes a new digest", async () => {
    const { d, table } = deps([GLOW]);
    await runWeeklyInsightJob(d, MONDAY_7_WIB);
    await runWeeklyInsightJob(d, new Date("2026-10-26T00:00:00Z"));
    expect([...table.keys()]).toEqual(["t1:2026-10-19", "t1:2026-10-26"]);
  });

  it("the week follows the shop's time zone (Sunday 23.00 UTC is already Monday in WIB)", async () => {
    const utcShop = { ...KOPI, timezone: "UTC" };
    const { d, table } = deps([GLOW, utcShop]);
    await runWeeklyInsightJob(d, new Date("2026-10-18T23:00:00Z"));
    expect([...table.keys()]).toEqual(["t1:2026-10-19", "t2:2026-10-12"]);
  });

  it("one shop failing does not stop the others", async () => {
    const { d, table } = deps([GLOW, KOPI], {
      build: async (shop) => {
        if (shop.id === "t1") throw new Error("fin_daily timeout");
        return { text: "ok", points: [], insight_keys: [], engine: "offline", model: "offline:template-v1", source: "offline" };
      },
    });
    const report = await runWeeklyInsightJob(d, MONDAY_7_WIB);
    expect(report).toMatchObject({ created: 1, failed: 1 });
    expect(report.results[0]).toMatchObject({ slug: "glow", status: "failed", error: "fin_daily timeout" });
    expect([...table.keys()]).toEqual(["t2:2026-10-19"]);
  });

  it("a concurrent run that saved first wins; this run neither duplicates nor delivers", async () => {
    const { d } = deps([GLOW], { hasDigest: async () => false, save: async () => false });
    const report = await runWeeklyInsightJob(d, MONDAY_7_WIB);
    expect(report.results[0].status).toBe("exists");
    expect(d.deliver).not.toHaveBeenCalled();
  });

  it("delivery goes through the hook once per new digest; a failed send keeps the digest", async () => {
    const deliver = vi.fn(async () => {
      throw new Error("smtp down");
    });
    const { d, table } = deps([GLOW], { deliver });
    const report = await runWeeklyInsightJob(d, MONDAY_7_WIB);
    expect(report.results[0]).toMatchObject({ status: "created", delivery: "failed" });
    expect(table.size).toBe(1);
    expect(d.markDelivery).toHaveBeenCalledWith("t1", "2026-10-19", { status: "failed", error: "smtp down" });
  });

  it("without a configured channel the digest is marked not_configured (no email/WA credentials yet)", async () => {
    const { d } = deps([GLOW]);
    const report = await runWeeklyInsightJob(d, MONDAY_7_WIB);
    expect(report.results[0].delivery).toBe("not_configured");
    expect(d.markDelivery).toHaveBeenCalledWith("t1", "2026-10-19", { status: "not_configured" });
  });
});

describe("digestMessage / digestCaption", () => {
  const digest: WeeklyDigest = {
    tenant_id: "t1",
    week_start: "2026-10-19",
    text: "Ada 1 hal yang perlu perhatianmu minggu ini.",
    points: ["Stok menipis: Serum tinggal 2"],
    insight_keys: [],
    engine: "offline",
    model: "offline:template-v1",
    source: "offline",
    generated_by: "cron",
  };

  it("builds the plain-text body a future email/WA sender would send", () => {
    const m = digestMessage(GLOW, digest, "https://wadar.example");
    expect(m.subject).toBe("Insight mingguan Glow Beauty — minggu 19 Okt 2026");
    expect(m.body).toContain("Ada 1 hal yang perlu perhatianmu minggu ini.");
    expect(m.body).toContain("• Stok menipis: Serum tinggal 2");
    expect(m.body).toContain("https://wadar.example/glow/beranda");
  });

  it("captions the Beranda card by who made it", () => {
    expect(digestCaption(digest)).toBe("Disusun otomatis untuk minggu 19 Okt 2026");
    expect(digestCaption({ ...digest, generated_by: "manual" })).toBe("Disusun untuk minggu 19 Okt 2026");
  });
});
