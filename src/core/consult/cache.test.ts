import { describe, expect, it } from "vitest";
import { askCacheKey, createTtlCache, dailyInsightKey, dataVersion, normalizeQuestion, weeklyCacheKey } from "./cache";
import { makeData } from "./fixture";
import { selectInsights, weeklyCandidates } from "./insights";

describe("createTtlCache", () => {
  it("returns a value until its TTL passes, then forgets it", () => {
    let t = 0;
    const c = createTtlCache<string>({ ttlMs: 1000, now: () => t });
    c.set("a", "x");
    t = 999;
    expect(c.get("a")).toBe("x");
    t = 1000;
    expect(c.get("a")).toBeUndefined();
    expect(c.size).toBe(0);
  });

  it("evicts the least recently used entry past maxEntries", () => {
    const c = createTtlCache<number>({ maxEntries: 2 });
    c.set("a", 1);
    c.set("b", 2);
    c.get("a"); // a is now the freshest
    c.set("c", 3);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
    expect(c.get("c")).toBe(3);
  });

  it("set refreshes the TTL and clear empties it", () => {
    let t = 0;
    const c = createTtlCache<string>({ ttlMs: 1000, now: () => t });
    c.set("a", "x");
    t = 900;
    c.set("a", "y");
    t = 1500;
    expect(c.get("a")).toBe("y");
    c.clear();
    expect(c.get("a")).toBeUndefined();
  });
});

describe("dataVersion", () => {
  it("is stable for equal data and changes when a sale, stock level or memory changes", () => {
    const base = makeData();
    expect(dataVersion(makeData())).toBe(dataVersion(base));

    // makeData shares its arrays between calls, so build changed copies instead of mutating.
    const sold = makeData({ lines: base.lines.map((l, i) => (i === 0 ? { ...l, qty: l.qty + 1 } : l)) });
    expect(dataVersion(sold)).not.toBe(dataVersion(base));

    const restocked = makeData({ stock: base.stock.map((r, i) => (i === 0 ? { ...r, on_hand: r.on_hand + 1 } : r)) });
    expect(dataVersion(restocked)).not.toBe(dataVersion(base));

    const remembered = makeData({ memory: [...base.memory, { id: "m2", kind: "fact", content: "modal Rp5 jt", pinned: true }] });
    expect(dataVersion(remembered)).not.toBe(dataVersion(base));

    expect(dataVersion({ ...makeData(), today: "2026-10-17" })).not.toBe(dataVersion(base));
  });
});

describe("askCacheKey", () => {
  const p = { scope: "t1", question: "Kenapa untungku turun?", history: [], deep: false, version: "v1" };

  it("ignores case, spacing and trailing punctuation", () => {
    expect(normalizeQuestion("  Kenapa   UNTUNGKU turun ?! ")).toBe("kenapa untungku turun");
    expect(askCacheKey({ ...p, question: "kenapa untungku  turun???" })).toBe(askCacheKey(p));
  });

  it("separates tenants, data versions, deep mode, history and different questions", () => {
    const k = askCacheKey(p);
    expect(askCacheKey({ ...p, scope: "t2" })).not.toBe(k);
    expect(askCacheKey({ ...p, version: "v2" })).not.toBe(k);
    expect(askCacheKey({ ...p, deep: true })).not.toBe(k);
    expect(askCacheKey({ ...p, history: [{ role: "user", content: "halo" }] })).not.toBe(k);
    expect(askCacheKey({ ...p, question: "Stok apa yang menipis?" })).not.toBe(k);
  });
});

describe("weeklyCacheKey", () => {
  it("depends on the tenant, data version and the selected insights", () => {
    const data = makeData();
    const selected = selectInsights(weeklyCandidates(data), new Set());
    const k = weeklyCacheKey({ scope: "t1", version: "v1", selected });
    expect(weeklyCacheKey({ scope: "t1", version: "v1", selected })).toBe(k);
    expect(weeklyCacheKey({ scope: "t2", version: "v1", selected })).not.toBe(k);
    expect(weeklyCacheKey({ scope: "t1", version: "v2", selected })).not.toBe(k);
    expect(weeklyCacheKey({ scope: "t1", version: "v1", selected: selected.slice(1) })).not.toBe(k);
  });
});

describe("dailyInsightKey", () => {
  it("depends on tenant, day and the selected insights — not on every sale", () => {
    const selected = selectInsights(weeklyCandidates(makeData()), new Set());
    const k = dailyInsightKey({ scope: "t1", day: "2026-10-17", selected });
    expect(dailyInsightKey({ scope: "t1", day: "2026-10-17", selected })).toBe(k);
    expect(dailyInsightKey({ scope: "t2", day: "2026-10-17", selected })).not.toBe(k);
    expect(dailyInsightKey({ scope: "t1", day: "2026-10-18", selected })).not.toBe(k);
    expect(dailyInsightKey({ scope: "t1", day: "2026-10-17", selected: selected.slice(1) })).not.toBe(k);
  });
});
