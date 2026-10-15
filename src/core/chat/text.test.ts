import { describe, expect, it } from "vitest";
import { extractAmounts, findForbiddenTerms, findPhoneNumbers, hasPhrase, normalizeText } from "./text";

describe("normalizeText", () => {
  it("lowercases, strips punctuation and spells out chat abbreviations", () => {
    expect(normalizeText("Kak, serum Vit-C rdy gk??")).toBe("kak serum vit c ready tidak");
    expect(normalizeText("Brp ongkirnya ke Sby?")).toBe("berapa ongkir ke sby");
    expect(normalizeText("  ")).toBe("");
  });

  it("drops diacritics", () => {
    expect(normalizeText("Café crème")).toBe("cafe creme");
  });
});

describe("hasPhrase", () => {
  it("matches whole words and phrases only", () => {
    expect(hasPhrase("bisa cod tidak", "cod")).toBe(true);
    expect(hasPhrase("codet", "cod")).toBe(false);
    expect(hasPhrase("paket belum sampai nih", "belum sampai")).toBe(true);
  });
});

describe("extractAmounts", () => {
  it("reads the usual ways of writing rupiah", () => {
    expect(extractAmounts("Harganya Rp89.000 ya")).toEqual([89_000]);
    expect(extractAmounts("Rp 1.250.000")).toEqual([1_250_000]);
    expect(extractAmounts("cuma Rp89rb kak")).toEqual([89_000]);
    expect(extractAmounts("89 ribu aja")).toEqual([89_000]);
    expect(extractAmounts("89k")).toEqual([89_000]);
    expect(extractAmounts("Rp1,2 jt")).toEqual([1_200_000]);
    expect(extractAmounts("1.5 jt")).toEqual([1_500_000]);
    expect(extractAmounts("Rp89.000,00")).toEqual([89_000]);
    expect(extractAmounts("IDR 65000")).toEqual([65_000]);
  });

  it("reads ranges as two amounts", () => {
    expect(extractAmounts("Pulau Jawa Rp12.000–Rp25.000 (2–4 hari)")).toEqual([12_000, 25_000]);
  });

  it("ignores numbers that are not money", () => {
    expect(extractAmounts("Serum Vit C 20ml, SPF50, sisa 3 pcs, 10%, Toner Pad 60 Lembar, 2–4 hari, 10 kg")).toEqual([]);
  });
});

describe("findForbiddenTerms", () => {
  it("finds internal-data words, including suffixed forms", () => {
    expect(findForbiddenTerms("HPP-nya Rp38.000")).toEqual(["hpp"]);
    expect(findForbiddenTerms("modalnya murah, margin besar")).toEqual(["modal", "margin"]);
    expect(findForbiddenTerms("Keuntungan toko dan saldo")).toEqual(["keuntungan", "saldo"]);
    expect(findForbiddenTerms("labanya")).toEqual(["laba"]);
    expect(findForbiddenTerms("harga beli dari supplier")).toEqual(["harga beli"]);
  });

  it("does not flag ordinary words that merely contain the letters", () => {
    expect(findForbiddenTerms("Kakak beruntung, stok masih ada")).toEqual([]);
    expect(findForbiddenTerms("Jangan kelabakan, admin bantu")).toEqual([]);
    expect(findForbiddenTerms("Serum Vit C ready, harganya Rp89.000")).toEqual([]);
  });
});

describe("findPhoneNumbers", () => {
  it("finds Indonesian mobile numbers in several spellings", () => {
    expect(findPhoneNumbers("WA 0812-2700-3456 atau +62 813 1111 2222")).toEqual(["0812-2700-3456", "+62 813 1111 2222"]);
    expect(findPhoneNumbers("6281399998888")).toEqual(["6281399998888"]);
  });

  it("does not mistake prices for phone numbers", () => {
    expect(findPhoneNumbers("Rp89.000 dan Rp1.250.000")).toEqual([]);
  });
});

describe("audit hardening (D6 T2, T3, T9)", () => {
  it.each(["+62-812-2700-3456", "+62 812-2700-3456", "+62.812.2700.3456", "0812 2700 3456", "6281227003456", "08122700 3456"])(
    "finds the phone number %s",
    (n) => {
      expect(findPhoneNumbers(`Hubungi ${n} ya`)).toHaveLength(1);
    },
  );

  it("does not swallow digits that follow the number", () => {
    expect(findPhoneNumbers("WA 0812-2700-3456, 20 pcs ready")).toEqual(["0812-2700-3456"]);
  });

  it("reads dotted thousands with a unit as thousands", () => {
    expect(extractAmounts("harganya 1.500 rb")).toEqual([1_500_000]);
    expect(extractAmounts("10.000 ribu")).toEqual([10_000_000]);
    expect(extractAmounts("Rp 1.250 rb")).toEqual([1_250_000]);
    expect(extractAmounts("1.5 jt, 1,2 jt, 89 ribu")).toEqual([1_500_000, 1_200_000, 89_000]);
  });

  it("treats a bare dotted-thousands number as an amount", () => {
    expect(extractAmounts("cuma 85.000 aja")).toEqual([85_000]);
    expect(extractAmounts("jam 09.00 sampai 20.00, 20ml, SPF50")).toEqual([]);
  });

  it("matches forbidden terms as whole words", () => {
    expect(findForbiddenTerms("modalitas pembayaran, beruntung banget")).toEqual([]);
    expect(findForbiddenTerms("modalnya 50rb, margin-nya tipis, labanya kecil")).toEqual(["modal", "margin", "laba"]);
  });
});
