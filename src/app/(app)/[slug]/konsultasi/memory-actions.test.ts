import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMemory = vi.fn<(t: string, id: string, c: string) => Promise<boolean>>(async () => true);
const deleteMemory = vi.fn<(t: string, id: string) => Promise<boolean>>(async () => true);
vi.mock("server-only", () => ({}));
vi.mock("@/db/shop", () => ({ getShop: async (slug: string) => ({ id: `tenant-of-${slug}` }) }));
vi.mock("@/db/memory", () => ({
  updateMemory: (...a: [string, string, string]) => updateMemory(...a),
  deleteMemory: (...a: [string, string]) => deleteMemory(...a),
}));
vi.spyOn(console, "error").mockImplementation(() => undefined);

const { deleteMemoryItem, updateMemoryItem } = await import("./memory-actions");

beforeEach(() => vi.clearAllMocks());

describe("updateMemoryItem", () => {
  it("saves the cleaned text for the shop of the slug", async () => {
    expect(await updateMemoryItem("glow", "m1", "  Diskon maks 10%  ")).toEqual({});
    expect(updateMemory).toHaveBeenCalledWith("tenant-of-glow", "m1", "Diskon maks 10%");
  });

  it("refuses too-short text without touching the database", async () => {
    expect(await updateMemoryItem("glow", "m1", "ok")).toMatchObject({ error: expect.any(String) });
    expect(updateMemory).not.toHaveBeenCalled();
  });

  it("an item that is gone, or a database error, gives a friendly message", async () => {
    updateMemory.mockResolvedValueOnce(false);
    expect((await updateMemoryItem("glow", "m1", "Diskon maks 10%")).error).toMatch(/tidak ditemukan/);
    updateMemory.mockRejectedValueOnce({ code: "42501", message: "permission denied" });
    expect((await updateMemoryItem("glow", "m1", "Diskon maks 10%")).error).toMatch(/belum tersimpan/);
  });
});

describe("deleteMemoryItem", () => {
  it("deletes the item of the shop of the slug", async () => {
    expect(await deleteMemoryItem("glow", "m1")).toEqual({});
    expect(deleteMemory).toHaveBeenCalledWith("tenant-of-glow", "m1");
  });

  it("a database error gives a friendly message", async () => {
    deleteMemory.mockRejectedValueOnce({ code: "42501", message: "permission denied" });
    expect((await deleteMemoryItem("glow", "m1")).error).toMatch(/belum terhapus/);
  });
});
