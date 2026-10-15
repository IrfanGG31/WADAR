import { describe, expect, it } from "vitest";
import { fetchAllRows } from "./paginate";

/** A fake PostgREST endpoint over `n` rows that never returns more than `cap` per response. */
function endpoint(n: number, cap: number) {
  const rows = Array.from({ length: n }, (_, i) => i);
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { page, calls };
}

describe("fetchAllRows", () => {
  it("reads past the 1000-row cap in consecutive ranges", async () => {
    const { page, calls } = endpoint(2_345, 1_000);
    const rows = await fetchAllRows<number>(page);
    expect(rows).toHaveLength(2_345);
    expect(rows.at(-1)).toBe(2_344);
    expect(calls).toEqual([
      [0, 999],
      [1_000, 1_999],
      [2_000, 2_999],
    ]);
  });

  it("an exact multiple needs one extra (empty) page", async () => {
    const { page, calls } = endpoint(2_000, 1_000);
    expect(await fetchAllRows<number>(page)).toHaveLength(2_000);
    expect(calls).toHaveLength(3);
  });

  it("throws the PostgREST error", async () => {
    const err = { message: "boom" };
    await expect(fetchAllRows(async () => ({ data: null, error: err }))).rejects.toBe(err);
  });
});
