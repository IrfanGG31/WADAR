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

/** "Kak, serum Vit-C rdy gk?" → "kak serum vit c ready tidak". */
export function normalizeText(input: string): string {
  const base = input
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
 * "Larangan": HPP|modal|margin|untung|saldo|laba). Matched at a word start so
 * "modalnya", "keuntungan" and "margin-nya" count, "beruntung" does not.
 */
const FORBIDDEN = /(?:^|[^a-z])(hpp|modal|margin|keuntungan|untung|saldo|laba|harga pokok|harga beli|kulakan|omzet|omset)/g;

export function findForbiddenTerms(input: string): string[] {
  const lower = input.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const found = new Set<string>();
  for (const match of lower.matchAll(FORBIDDEN)) found.add(match[1]);
  return [...found];
}

/** Indonesian mobile numbers written in a text: "0812-2700-3456", "+62 812 2700 3456", "6281227003456". */
const PHONE = /(?:\+?62|0)\s?8[\d\s.-]{7,15}\d/g;

export function findPhoneNumbers(input: string): string[] {
  return [...input.matchAll(PHONE)].map((m) => m[0]);
}

const UNIT_MULTIPLIER: Record<string, bigint> = {
  rb: 1_000n,
  ribu: 1_000n,
  k: 1_000n,
  jt: 1_000_000n,
  juta: 1_000_000n,
};

/**
 * Every rupiah amount written in a text, as whole rupiah: "Rp89.000",
 * "Rp 1.250.000", "Rp89rb", "89 ribu", "89k", "Rp1,2 jt". A bare number
 * without "Rp" or a unit ("20ml", "SPF50", "2 pcs") is not an amount.
 * Integer arithmetic only (decimal "1,2 jt" = 12 × 1.000.000 / 10).
 */
const AMOUNT =
  /(?:\b(?:rp|idr)\.?\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(?:\s?(rb|ribu|k|jt|juta)\b)?)|(?:\b(\d+)(?:[.,](\d{1,2}))?\s?(rb|ribu|k|jt|juta)\b)/gi;

export function extractAmounts(input: string): number[] {
  const out: number[] = [];
  for (const m of input.matchAll(AMOUNT)) {
    const [whole, frac, unit] = m[1] !== undefined ? [m[1], m[2], m[3]] : [m[4], m[5], m[6]];
    const integer = BigInt(whole.replace(/\./g, ""));
    const multiplier = unit ? UNIT_MULTIPLIER[unit.toLowerCase()] : 1n;
    let value = integer * multiplier;
    if (frac && unit) {
      // "1,2 jt" / "1.5 jt": the fraction scales with the unit; "Rp89.000,00" (no unit) drops sen.
      value += (BigInt(frac) * multiplier) / 10n ** BigInt(frac.length);
    }
    out.push(Number(value));
  }
  return out;
}
