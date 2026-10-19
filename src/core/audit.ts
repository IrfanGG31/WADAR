import { formatRupiah } from "./money";
import { formatCount } from "./number-format";
import { ROLE_LABEL, type MemberRole } from "./roles";

/** STK-0b: why stock changed outside a sale or a purchase. Signs are enforced again in `public.adjust_stock`. */
export const ADJUST_REASONS = {
  rusak: { label: "Rusak", sign: -1 },
  hilang: { label: "Hilang", sign: -1 },
  kedaluwarsa: { label: "Kedaluwarsa", sign: -1 },
  retur_pemasok: { label: "Retur ke pemasok", sign: -1 },
  ditemukan: { label: "Ditemukan", sign: 1 },
  koreksi: { label: "Koreksi (+/−)", sign: 0 },
} as const;
export type AdjustReason = keyof typeof ADJUST_REASONS;
export const ADJUST_REASON_KEYS = Object.keys(ADJUST_REASONS) as AdjustReason[];

/** Signed qty for a reason: fixed-direction reasons take the magnitude, "koreksi" keeps the sign typed. */
export function signedAdjustQty(reason: AdjustReason, qty: number): number {
  const { sign } = ADJUST_REASONS[reason];
  return sign === 0 ? qty : sign * Math.abs(qty);
}

/** Actions written by `app.audit` / `public.log_audit` (POS-5). */
export const AUDIT_ACTIONS = [
  "sale.voided",
  "product.price_changed",
  "channel.fee_changed",
  "member.role_changed",
  "member.removed",
  "stock.adjusted",
  "stock.counted",
  "expense.voided",
  "data.exported",
  "report.exported",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  id: string;
  action: string;
  entity_id: string | null;
  actor_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
const signed = (n: number) => (n > 0 ? `+${formatCount(n)}` : n < 0 ? `−${formatCount(-n)}` : "0");
const roleLabel = (v: unknown) => (typeof v === "string" && Object.hasOwn(ROLE_LABEL, v) ? ROLE_LABEL[v as MemberRole] : String(v ?? "?"));

/**
 * One line of "Riwayat aktivitas" in everyday words. `subject` is what the entity resolved to
 * (product name, member email); unknown actions still render instead of breaking the list.
 */
export function describeAudit(entry: AuditEntry, subject?: string | null): { title: string; detail: string } {
  const d = entry.detail;
  const about = subject ? `${subject} · ` : "";
  const note = str(d.note) ?? str(d.reason);
  const withNote = (s: string) => (note ? `${s} · "${note}"` : s);
  switch (entry.action) {
    case "sale.voided":
      return { title: "Transaksi dibatalkan", detail: withNote(formatRupiah(num(d.total))) };
    case "product.price_changed":
      return { title: "Harga jual diubah", detail: `${about}${formatRupiah(num(d.old))} → ${formatRupiah(num(d.new))}` };
    case "channel.fee_changed":
      return {
        title: "Komisi kanal diubah",
        detail: `${str(d.name) ?? "Kanal"} · ${num(d.old_pct)}% + ${formatRupiah(num(d.old_fixed))} → ${num(d.new_pct)}% + ${formatRupiah(num(d.new_fixed))}`,
      };
    case "member.role_changed":
      return { title: "Peran anggota diubah", detail: `${about}${roleLabel(d.old)} → ${roleLabel(d.new)}` };
    case "member.removed":
      return { title: "Anggota dikeluarkan", detail: `${about}${roleLabel(d.role)}` };
    case "stock.adjusted": {
      const reason = typeof d.reason === "string" && Object.hasOwn(ADJUST_REASONS, d.reason) ? ADJUST_REASONS[d.reason as AdjustReason].label : "Penyesuaian";
      return { title: `Stok disesuaikan: ${reason}`, detail: withNote(`${about}${signed(num(d.qty))} (${formatCount(num(d.before))} → ${formatCount(num(d.after))})`) };
    }
    case "stock.counted":
      return {
        title: "Stok opname",
        detail: withNote(`${about}tercatat ${formatCount(num(d.system))}, dihitung ${formatCount(num(d.counted))} (${signed(num(d.diff))})`),
      };
    case "expense.voided":
      return { title: "Pengeluaran dibatalkan", detail: withNote(`${str(d.category) ?? "Pengeluaran"} ${formatRupiah(num(d.amount))}`) };
    case "data.exported":
      return { title: "Semua data toko diunduh", detail: "File ZIP berisi semua tabel" };
    case "report.exported":
      return { title: "Laporan keuangan diunduh", detail: str(d.period) ? `Periode ${d.period}` : "File CSV" };
    default:
      return { title: entry.action, detail: "" };
  }
}
