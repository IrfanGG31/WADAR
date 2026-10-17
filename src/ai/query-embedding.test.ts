import { describe, expect, it, vi } from "vitest";
import { createQueryEmbedder } from "./query-embedding";
import type { Ai } from "./run";

type Run = Ai["run"];

function fakeAi(answer: () => { output: number[][] | null; engine: "llm" | "offline" } | Promise<never>) {
  const run = vi.fn(async (_task: string, input: { texts: string[] }, opts?: { timeoutMs?: number }) => {
    void input;
    void opts;
    return answer();
  });
  return { ai: { run: run as unknown as Run }, run };
}

describe("createQueryEmbedder", () => {
  it("embeds the question once per normalized text and reuses the vector", async () => {
    const { ai, run } = fakeAi(() => ({ output: [[0.1, 0.2]], engine: "llm" }));
    const embed = createQueryEmbedder(ai, { timeoutMs: 1500 });

    expect(await embed("Bisa COD?")).toEqual([0.1, 0.2]);
    expect(await embed("  bisa   cod ")).toEqual([0.1, 0.2]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBe("embed");
    expect(run.mock.calls[0]?.[1]).toEqual({ texts: ["Bisa COD?"], purpose: "query" });
    expect(run.mock.calls[0]?.[2]).toEqual({ timeoutMs: 1500 });
  });

  it("returns null without caching when the route answered offline (no key / provider down)", async () => {
    const { ai, run } = fakeAi(() => ({ output: null, engine: "offline" }));
    const embed = createQueryEmbedder(ai);

    expect(await embed("ongkir ke bandung")).toBeNull();
    expect(await embed("ongkir ke bandung")).toBeNull();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("never throws: a provider error means keyword-only search", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { ai } = fakeAi(() => Promise.reject(new Error("boom")));
    expect(await createQueryEmbedder(ai)("retur?")).toBeNull();
    error.mockRestore();
  });

  it("skips empty questions and expires entries after the TTL", async () => {
    let t = 0;
    const { ai, run } = fakeAi(() => ({ output: [[1]], engine: "llm" }));
    const embed = createQueryEmbedder(ai, { now: () => t, ttlMs: 1000 });

    expect(await embed("  ?! ")).toBeNull();
    expect(run).not.toHaveBeenCalled();
    await embed("jam buka");
    t = 1001;
    await embed("jam buka");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("evicts the least recently used entry past maxEntries", async () => {
    const { ai, run } = fakeAi(() => ({ output: [[1]], engine: "llm" }));
    const embed = createQueryEmbedder(ai, { maxEntries: 2 });

    await embed("a1");
    await embed("b2");
    await embed("a1"); // a1 is now the most recent
    await embed("c3"); // evicts b2
    await embed("a1");
    expect(run).toHaveBeenCalledTimes(3);
    await embed("b2");
    expect(run).toHaveBeenCalledTimes(4);
  });
});
