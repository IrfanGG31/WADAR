/**
 * Text helpers shared by the pre-router, retrieval, guardrails and the offline
 * responder. Everything works on a normalized form: lowercase, no diacritics,
 * only [a-z0-9] words separated by single spaces, with common chat
 * abbreviations spelled out ("brp" → "berapa", "gk" → "tidak").
 */

const SLANG: Record<string, string> = {
  gk: "tidak",
  ga: "tidak",
  gak: "tidak",
  nggak: "tidak",
  ngga: "tidak",
  enggak: "tidak",
  tdk: "tidak",
  g: "tidak",
  brp: "berapa",
  berapaan: "berapa",
  rdy: "ready",
  redi: "ready",
  dmn: "dimana",
  gmn: "bagaimana",
  gimana: "bagaimana",
  gmna: "bagaimana",
  sy: "saya",
  aq: "aku",
  utk: "untuk",
  buat: "untuk",
  yg: "yang",
  bs: "bisa",
  bsa: "bisa",
  blm: "belum",
  blum: "belum",
  sdh: "sudah",
  udh: "sudah",
  udah: "sudah",
  dah: "sudah",
  tp: "tapi",
  krn: "karena",
  dgn: "dengan",
  sm: "sama",
  ama: "sama",
  bgt: "banget",
  trs: "terus",
  jg: "juga",
  aja: "saja",
  aj: "saja",
  ka: "kak",
  kk: "kak",
  thx: "terima kasih",
  makasih: "terima kasih",
  makasi: "terima kasih",
  trims: "terima kasih",
  ongkosnya: "ongkos",
  ongkirnya: "ongkir",
  harganya: "harga",
  stoknya: "stok",
  stock: "stok",
  stocknya: "stok",
  alamatnya: "alamat",
  lokasinya: "lokasi",
  pesannya: "pesan",
  bayarnya: "bayar",
  order: "pesan",
  orderan: "pesanan",
  paketku: "paket saya",
  pesananku: "pesanan saya",
  barangku: "barang saya",
  disc: "diskon",
  diskonnya: "diskon",
  free: "gratis",
};

/** Zero-width space / non-joiner / joiner and BOM: invisible, but they split a word in two ("mo\u200Bdal"). */
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

/** "Kak, serum Vit-C rdy gk?" → "kak serum vit c ready tidak". */
export function normalizeText(input: string): string {
  const base = input
    .replace(ZERO_WIDTH, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!base) return "";
  return base
    .split(" ")
    .map((word) => SLANG[word] ?? word)
    .join(" ");
}

/** Words of an already-normalized string. */
export function words(normalized: string): string[] {
  return normalized ? normalized.split(" ") : [];
}

/** Whole-word / whole-phrase test on normalized text ("cod" matches "bisa cod", not "codet"). */
export function hasPhrase(normalized: string, phrase: string): boolean {
  return ` ${normalized} `.includes(` ${phrase} `);
}

export function hasAnyPhrase(normalized: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => hasPhrase(normalized, phrase));
}

/**
 * Internal-data words a customer reply must never contain (TECH-SPEC §7.3
 * "Larangan": HPP|modal|margin|untung|saldo|laba). Matched as a whole word, with
 * an optional possessive/particle suffix: "modalnya", "keuntungan" and
 * "margin-nya" count; "beruntung" and "modalitas" do not.
 */
const FORBIDDEN =
  /(?:^|[^a-z])(hpp|modal|margin|keuntungan|untung|saldo|laba|harga pokok|harga beli|kulakan|omzet|omset|profit|cuan|markup|mark up)(?:nya|ku|mu|lah|kah)?(?![a-z])/g;

export function findForbiddenTerms(input: string): string[] {
  const lower = input.replace(ZERO_WIDTH, "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const found = new Set<string>();
  for (const match of lower.matchAll(FORBIDDEN)) found.add(match[1]);
  return [...found];
}

/** Indonesian mobile numbers written in a text: "0812-2700-3456", "+62 812 2700 3456", "6281227003456". */
const PHONE = /(?:\+?62|0)[\s.-]?8\d{1,3}(?:[\s.-]?\d{3,4}){2,3}(?!\d)/g;

export function findPhoneNumbers(input: string): string[] {
  return [...input.matchAll(PHONE)].map((m) => m[0]);
}

const UNIT_MULTIPLIER: Record<string, bigint> = {
  rb: 1_000n,
  ribu: 1_000n,
  ribuan: 1_000n,
  rban: 1_000n,
  k: 1_000n,
  jt: 1_000_000n,
  juta: 1_000_000n,
  jutaan: 1_000_000n,
  rupiah: 1n,
};

/**
 * Every rupiah amount written in a text, as whole rupiah: "Rp89.000",
 * "Rp 1.250.000", "Rp89rb", "89 ribu", "75 ribuan", "89k", "Rp1,2 jt",
 * "75,000" (comma thousands), "75000 rupiah", a bare figure of 4+ digits
 * ("75000"), and amounts spelled out in words ("tujuh puluh lima ribu").
 * Not an amount: "20ml", "SPF50", "2 pcs", "1000ml", dates, phone numbers.
 * Integer arithmetic only (decimal "1,2 jt" = 12 × 1.000.000 / 10).
 */
const GROUPED = String.raw`\d{1,3}(?:\.\d{3})+|\d{1,3}(?:,\d{3})+`;
const UNIT = String.raw`(?:ribuan|ribu|rban|rb|k|jutaan|juta|jt|rupiah)`;
const AMOUNT = new RegExp(
  // 1: "Rp 89.000" / "Rp1,2 jt";  2: "89 ribu" / "1.500 rb" / "1,5 jt" / "75000 rupiah";
  // 3: bare "85.000" / "75,000";  4: bare "75000".
  String.raw`(?:\b(?:rp|idr)\.?\s?(${GROUPED}|\d+)(?:,(\d{1,2}))?(?:\s?(${UNIT})\b)?)` +
    String.raw`|(?:\b(${GROUPED}|\d+)(?:[.,](\d{1,2})(?!\d))?\s?(${UNIT})\b)` +
    String.raw`|(?:(?<![\d.,])(${GROUPED})(?![\d.,]?\d))` +
    String.raw`|(?:(?<![\w.,:/-])(\d{4,})(?![\d.,:/-]?\d)(?!\s?(?:ml|l|liter|gr|g|gram|kg|mg|cm|mm|m|pcs|pc|lembar|botol|buah|biji|x)\b))`,
  "gi",
);

const DIGIT_WORDS: Record<string, number> = {
  satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9,
};
const NUMBER_WORDS = new Set([
  ...Object.keys(DIGIT_WORDS), "nol", "se", "sepuluh", "sebelas", "seratus", "seribu", "sejuta", "belas", "puluh", "ratus", "ribu", "juta",
]);

/** "tujuh puluh lima ribu" → 75000, "dua juta lima ratus ribu" → 2500000; null when the words make no number. */
function parseNumberWords(tokens: readonly string[]): number | null {
  let total = 0;
  let small = 0; // 0–999 being built
  let pending = 0; // last digit word, waiting for belas/puluh/ratus
  for (const t of tokens) {
    if (t in DIGIT_WORDS) {
      small += pending;
      pending = DIGIT_WORDS[t];
    } else if (t === "nol") continue;
    else if (t === "se") pending = 1;
    else if (t === "sepuluh") small += 10;
    else if (t === "sebelas") small += 11;
    else if (t === "seratus") small += 100;
    else if (t === "belas" || t === "puluh" || t === "ratus") {
      small += t === "belas" ? 10 + pending : pending * (t === "puluh" ? 10 : 100);
      pending = 0;
    }
    else if (t === "seribu") total += 1_000;
    else if (t === "sejuta") total += 1_000_000;
    else if (t === "ribu" || t === "juta") {
      const n = small + pending;
      if (n === 0) return null;
      total += n * (t === "ribu" ? 1_000 : 1_000_000);
      small = 0;
      pending = 0;
    }
  }
  const value = total + small + pending;
  return value > 0 ? value : null;
}

/** Amounts spelled out: a run of number words that reaches ribu/juta, or is followed by "rupiah". */
function wordAmounts(input: string): number[] {
  const tokens = input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ");
  const out: number[] = [];
  for (let i = 0; i < tokens.length; ) {
    if (!NUMBER_WORDS.has(tokens[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < tokens.length && NUMBER_WORDS.has(tokens[j])) j++;
    const run = tokens.slice(i, j);
    const isMoney = run.some((t) => t === "ribu" || t === "juta" || t === "seribu" || t === "sejuta") || tokens[j] === "rupiah";
    const value = isMoney ? parseNumberWords(run) : null;
    if (value !== null) out.push(value);
    i = j;
  }
  return out;
}

export function extractAmounts(input: string): number[] {
  const out: number[] = [];
  // Phone numbers are checked by their own rule; their digit groups are not prices.
  const phones = [...input.matchAll(PHONE)].map((m) => [m.index, m.index + m[0].length] as const);
  for (const m of input.matchAll(AMOUNT)) {
    if (phones.some(([a, b]) => m.index < b && m.index + m[0].length > a)) continue;
    const [whole, frac, unit] =
      m[1] !== undefined ? [m[1], m[2], m[3]] : m[4] !== undefined ? [m[4], m[5], m[6]] : m[7] !== undefined ? [m[7], undefined, undefined] : [m[8], undefined, undefined];
    const integer = BigInt(whole.replace(/[.,]/g, ""));
    const multiplier = unit ? UNIT_MULTIPLIER[unit.toLowerCase()] : 1n;
    let value = integer * multiplier;
    if (frac && unit && multiplier > 1n) {
      // "1,2 jt" / "1.5 jt": the fraction scales with the unit; "Rp89.000,00" (no unit) drops sen.
      value += (BigInt(frac) * multiplier) / 10n ** BigInt(frac.length);
    }
    out.push(Number(value));
  }
  return [...out, ...wordAmounts(input)];
}
