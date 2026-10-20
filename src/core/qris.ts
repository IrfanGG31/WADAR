/**
 * QRIS Dinamis (Ruang Demo, simulation). Builds an EMVCo-shaped dynamic QR payload —
 * point of initiation "12" (dynamic), amount in tag 54, CRC16-CCITT in tag 63 — so the code
 * looks and parses like a real one. The merchant account is a fixed demo id that no acquirer
 * knows: scanning it in a banking app pays nothing. Real payments need a PJP (Midtrans/Xendit).
 */

const tlv = (tag: string, value: string) => `${tag}${String(value.length).padStart(2, "0")}${value}`;

export function crc16ccitt(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface QrisDemoInput {
  merchantName: string;
  city: string;
  /** Whole rupiah; 0 = the buyer types the amount (static-style). */
  amount: number;
  /** Bill reference, unique per transaction. */
  reference: string;
}

const clean = (s: string, max: number) =>
  s
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9 .-]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, max) || "WADAR";

export function qrisDemoPayload({ merchantName, city, amount, reference }: QrisDemoInput): string {
  const amt = Number.isSafeInteger(amount) && amount > 0 ? amount : 0;
  const body =
    tlv("00", "01") +
    tlv("01", amt > 0 ? "12" : "11") +
    tlv("26", tlv("00", "ID.WADAR.DEMO") + tlv("01", "9360000000000000000") + tlv("02", "DEMO-BUKAN-MERCHANT")) +
    tlv("52", "5814") +
    tlv("53", "360") +
    (amt > 0 ? tlv("54", String(amt)) : "") +
    tlv("58", "ID") +
    tlv("59", clean(merchantName, 25)) +
    tlv("60", clean(city, 15)) +
    tlv("62", tlv("01", clean(reference, 25)));
  const withCrcTag = `${body}6304`;
  return withCrcTag + crc16ccitt(withCrcTag);
}

/** What the speaker says: "Pembayaran diterima, lima puluh ribu rupiah" is left to the TTS voice. */
export function paymentAnnouncement(amount: number, source: string): string {
  return `Pembayaran QRIS diterima, ${amount.toLocaleString("id-ID")} rupiah, dari ${source}.`;
}
