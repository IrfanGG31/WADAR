/**
 * Indonesian phone numbers to E.164 (CRM-1): "0812-3456-7890", "62812…", "812…"
 * and "+62 812…" all become "+6281234567890". Other country codes pass through
 * when written with "+". Returns null when it can't be a phone number.
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const plus = raw.startsWith("+");
  let digits = raw.replace(/[^\d]/g, "");
  if (!plus) {
    if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
    else if (digits.startsWith("8")) digits = `62${digits}`;
    else if (!digits.startsWith("62")) return null;
  }
  const e164 = `+${digits}`;
  if (!/^\+[1-9]\d{6,14}$/.test(e164)) return null;
  if (e164.startsWith("+62") && !/^\+62[2-9]\d{7,11}$/.test(e164)) return null;
  return e164;
}

/** "+6281234567890" → "0812-3456-7890" for display. */
export function formatPhone(e164: string): string {
  if (!e164.startsWith("+62")) return e164;
  const local = `0${e164.slice(3)}`;
  return local.replace(/^(\d{4})(\d{4})(\d+)$/, "$1-$2-$3");
}
