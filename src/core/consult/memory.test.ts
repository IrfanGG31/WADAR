import { describe, expect, it } from "vitest";
import { MEMORY_MAX_CHARS, validateMemoryContent } from "./memory";

describe("validateMemoryContent (CON-4 ubah memori)", () => {
  it("trims and collapses whitespace", () => {
    expect(validateMemoryContent("  Jangan  diskon\n di atas 10%  ")).toEqual({ ok: true, content: "Jangan diskon di atas 10%" });
  });

  it("rejects text shorter than 3 or longer than the column allows", () => {
    expect(validateMemoryContent(" ab ")).toMatchObject({ ok: false });
    expect(validateMemoryContent("x".repeat(MEMORY_MAX_CHARS + 1))).toMatchObject({ ok: false });
    expect(validateMemoryContent("x".repeat(MEMORY_MAX_CHARS))).toMatchObject({ ok: true });
  });
});
