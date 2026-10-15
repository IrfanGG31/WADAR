import { describe, expect, it } from "vitest";
import { GLOW_CARDS, GLOW_KB } from "./fixtures/glow-by-sari";
import {
  coreName,
  fuseKb,
  lexicalRank,
  nameMatchScore,
  rankProductCards,
  reciprocalRankFusion,
  searchTerms,
  trigramCandidates,
  trigrams,
  trigramSimilarity,
  type KbCandidate,
} from "./retrieval";

describe("trigrams / trigramSimilarity = Postgres pg_trgm", () => {
  it("builds the same trigram set as show_trgm", () => {
    // select show_trgm('Vit C') → {"  c","  v"," c "," vi","it ",vit}
    expect([...trigrams("Vit C")].sort()).toEqual(["  c", "  v", " c ", " vi", "it ", "vit"]);
  });

  // Reference values from `select similarity(a, b)` on Postgres 16.2 + pg_trgm 1.6.
  it.each([
    ["word", "two words", 0.36363637],
    ["serum vit c", "Serum Vit C 20ml", 0.7058824],
    ["toner", "Hyaluronic Toner 100ml", 0.26086956],
    ["serum", "Serum Niacinamide 10%", 0.2857143],
    ["serum vitc", "serum vit c", 0.64285713],
    ["lip serum", "Lip Serum", 1],
    ["sunscreen spf50", "Sunscreen SPF50 40ml", 0.75],
  ])("similarity(%s, %s) = %f", (a, b, expected) => {
    expect(trigramSimilarity(a, b)).toBeCloseTo(expected, 6);
  });

  it("is 0 for empty input", () => {
    expect(trigramSimilarity("", "serum")).toBe(0);
  });
});

describe("product name matching", () => {
  it("drops size tokens from names", () => {
    expect(coreName("Hyaluronic Toner 100ml")).toBe("hyaluronic toner");
    expect(coreName("Toner Pad 60 Lembar")).toBe("toner pad");
    expect(coreName("Sunscreen SPF50 40ml")).toBe("sunscreen");
    expect(coreName("Retinol Serum 0.3%")).toBe("retinol serum");
  });

  it("scores the named product inside a whole sentence", () => {
    const vitC = GLOW_CARDS.find((c) => c.name === "Serum Vit C 20ml")!;
    expect(nameMatchScore("serum vit c ready? bisa COD?", vitC)).toBe(1);
    expect(nameMatchScore("serum vitc ready?", vitC)).toBeGreaterThan(0.3);
    expect(nameMatchScore("ongkir ke surabaya", vitC)).toBeLessThan(0.3);
  });

  it("keeps only candidates above 0.3, best first", () => {
    const hits = trigramCandidates("harga serum niacinamide berapa?", GLOW_CARDS);
    expect(hits[0].card.name).toBe("Serum Niacinamide 10%");
    expect(hits.every((h) => h.score > 0.3)).toBe(true);
  });

  it("returns at most 5 cards, all variants of the matched product first", () => {
    const cards = rankProductCards("lip serum ada warna apa aja?", GLOW_CARDS);
    expect(cards.length).toBeLessThanOrEqual(5);
    expect(cards.slice(0, 3).map((c) => c.option_label)).toEqual(["Pink", "Nude", "Berry"]);
  });

  it("whole name words find products trigram similarity misses", () => {
    const names = rankProductCards("toner ada?", GLOW_CARDS).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["Hyaluronic Toner 100ml", "Exfoliating Toner AHA BHA", "Toner Pad 60 Lembar"]));
  });

  it("fuses catalog-embedding hits in (a semantic match with no shared name)", () => {
    const names = rankProductCards("pelembap buat kulit berminyak", GLOW_CARDS, ["Moisturizer Gel 50g"]).map((c) => c.name);
    expect(names[0]).toBe("Moisturizer Gel 50g");
  });

  it("finds nothing for a message that names no product", () => {
    expect(rankProductCards("tokonya buka jam berapa?", GLOW_CARDS)).toEqual([]);
  });
});

describe("reciprocalRankFusion (k = 60)", () => {
  it("adds 1/(k + rank) over lists", () => {
    const fused = reciprocalRankFusion([{ ids: ["a", "b", "c"] }, { ids: ["b", "d"] }]);
    const score = Object.fromEntries(fused.map((f) => [f.id, f.score]));
    expect(score.a).toBeCloseTo(1 / 61, 12);
    expect(score.b).toBeCloseTo(1 / 62 + 1 / 61, 12);
    expect(score.c).toBeCloseTo(1 / 63, 12);
    expect(score.d).toBeCloseTo(1 / 62, 12);
    expect(fused.map((f) => f.id)).toEqual(["b", "a", "d", "c"]);
  });

  it("breaks ties by first appearance", () => {
    const fused = reciprocalRankFusion([{ ids: ["x"] }, { ids: ["y"] }]);
    expect(fused.map((f) => f.id)).toEqual(["x", "y"]);
  });

  it("applies per-item weights", () => {
    const fused = reciprocalRankFusion([{ ids: ["doc", "faq"] }], { weight: (id) => (id === "faq" ? 1.2 : 1) });
    expect(fused[0].id).toBe("faq"); // 1.2/62 > 1/61
  });
});

describe("fuseKb", () => {
  const snip = (id: string, kind: "faq" | "doc", vec: number | null, txt: number | null): KbCandidate => ({
    id,
    kind,
    content: id,
    vec_rank: vec,
    txt_rank: txt,
  });

  it("returns the top 3 of vector + text with FAQ ×1.2, and the best score", () => {
    const { snippets, retrievalScore } = fuseKb([
      snip("d1", "doc", 1, null),
      snip("f1", "faq", 2, 1),
      snip("d2", "doc", null, 2),
      snip("d3", "doc", 3, 3),
      snip("f2", "faq", null, 4),
    ]);
    expect(snippets.map((s) => s.id)).toEqual(["f1", "d3", "f2"]);
    expect(retrievalScore).toBeCloseTo(1.2 * (1 / 62 + 1 / 61), 12);
    expect(snippets[0]).not.toHaveProperty("vec_rank");
  });

  it("works with the text side alone (no embeddings yet)", () => {
    const { snippets } = fuseKb([snip("a", "doc", null, 1), snip("b", "doc", null, 2)]);
    expect(snippets.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("is empty when nothing matched", () => {
    expect(fuseKb([])).toEqual({ snippets: [], retrievalScore: 0 });
  });
});

describe("searchTerms / lexicalRank", () => {
  it("keeps content words only", () => {
    expect(searchTerms("Kak, ongkir ke Surabaya brp ya?")).toEqual(["ongkir", "surabaya"]);
    expect(searchTerms("Halo kak")).toEqual([]);
  });

  it("ranks snippets by matched terms", () => {
    const ranked = lexicalRank(searchTerms("apakah semua produk sudah bpom?"), GLOW_KB);
    expect(ranked[0]).toBe("faq1");
  });
});
