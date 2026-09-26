const UNITS = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

function belowThousand(n: number): string {
  if (n < 12) return UNITS[n]!;
  if (n < 20) return `${UNITS[n - 10]} belas`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const rest = n % 10;
    return `${UNITS[tens]} puluh${rest ? ` ${UNITS[rest]}` : ""}`;
  }
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head = hundreds === 1 ? "seratus" : `${UNITS[hundreds]} ratus`;
  return rest ? `${head} ${belowThousand(rest)}` : head;
}

const SCALES: Array<[number, string]> = [
  [1_000_000_000_000, "triliun"],
  [1_000_000_000, "miliar"],
  [1_000_000, "juta"],
  [1_000, "ribu"],
];

/**
 * Indonesian number words for TTS and receipts (PRD F1.2: "Nominal dibaca
 * benar untuk angka hingga miliaran"). Whole numbers 0 … 999.999.999.999.999.
 * Follows spoken convention: 1.000 = "seribu", 100 = "seratus",
 * 11 = "sebelas", but 1.000.000 = "satu juta".
 */
export function terbilang(value: number | bigint): string {
  let n = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isInteger(n) || n < 0 || n >= 1_000_000_000_000_000) {
    throw new RangeError(`terbilang: unsupported value ${String(value)}`);
  }
  if (n === 0) return "nol";
  const parts: string[] = [];
  for (const [scale, word] of SCALES) {
    const chunk = Math.floor(n / scale);
    if (chunk > 0) {
      parts.push(scale === 1_000 && chunk === 1 ? "seribu" : `${belowThousand(chunk)} ${word}`);
      n %= scale;
    }
  }
  if (n > 0) parts.push(belowThousand(n));
  return parts.join(" ");
}

/** "Uang masuk seratus dua puluh lima ribu rupiah dari QRIS" (PRD F1.2 acceptance criteria). */
export function moneyInSpeech(amount: number, source?: string | null): string {
  return `Uang masuk ${terbilang(amount)} rupiah${source ? ` dari ${source}` : ""}`;
}
