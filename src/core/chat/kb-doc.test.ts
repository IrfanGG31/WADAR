import { describe, expect, it } from "vitest";
import { chunkDocument, DocInput, docFileProblem, normalizeDocText } from "./kb-doc";

describe("normalizeDocText (KB-2)", () => {
  it("cleans line endings, blank runs, and control characters", () => {
    expect(normalizeDocText("﻿A  \r\nB\r\n\r\n\r\n\r\nC\u0007")).toBe("A\nB\n\nC");
  });
});

describe("chunkDocument", () => {
  it("keeps short docs as one chunk headed by the title", () => {
    expect(chunkDocument("Panduan ukuran", "S: 50 cm\nM: 54 cm")).toEqual([
      { content: "Panduan ukuran\nS: 50 cm\nM: 54 cm", metadata: { kind: "doc", title: "Panduan ukuran", part: "1" } },
    ]);
  });

  it("packs paragraphs up to the limit and splits long ones at sentence ends", () => {
    const para = "Kalimat pendek ini diulang. ".repeat(10).trim(); // 279 chars
    const chunks = chunkDocument("T", [para, para, para, para].join("\n\n"), 600);
    expect(chunks).toHaveLength(2);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(602);
    const long = chunkDocument("T", "Satu dua tiga. ".repeat(200), 300);
    expect(long.length).toBeGreaterThan(5);
    expect(long.every((c) => c.content.length <= 302 && /\.$/.test(c.content))).toBe(true);
    expect(long.map((c) => c.metadata.part)).toEqual(long.map((_, i) => String(i + 1)));
  });
});

describe("DocInput / docFileProblem", () => {
  it("validates title and length", () => {
    expect(DocInput.safeParse({ title: "Ok", text: "x".repeat(30) }).success).toBe(false);
    expect(DocInput.safeParse({ title: "Cara rawat", text: "pendek" }).success).toBe(false);
    expect(DocInput.parse({ title: " Cara rawat ", text: "Cuci dengan air dingin, jangan diperas." }).title).toBe("Cara rawat");
  });

  it("accepts text files only, within the size limit", () => {
    expect(docFileProblem("sop.txt", 1000)).toBeNull();
    expect(docFileProblem("katalog.pdf", 1000)).toMatch(/\.txt/);
    expect(docFileProblem("besar.txt", 300_000)).toMatch(/200 KB/);
  });
});
