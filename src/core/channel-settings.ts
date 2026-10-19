import { z } from "zod";

/** `public.channel_kind` values the owner can add, with everyday names (FIN-2). */
export const CHANNEL_KIND_LABEL = {
  pos: "Kasir (offline)",
  manual: "Pesanan manual",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  shopee: "Shopee",
  tiktok_shop: "TikTok Shop",
  tokopedia: "Tokopedia",
  gofood: "GoFood",
  grabfood: "GrabFood",
  shopeefood: "ShopeeFood",
  website: "Website",
  other: "Lainnya",
} as const;
export type ChannelKind = keyof typeof CHANNEL_KIND_LABEL;
export const CHANNEL_KINDS = Object.keys(CHANNEL_KIND_LABEL) as ChannelKind[];

/**
 * Starting commission per marketplace (% of the order after seller discount + fixed fee per order).
 * Estimates only — PRD FIN-2: "perkiraan, cek di akun sellermu".
 */
export const DEFAULT_CHANNEL_FEE: Partial<Record<ChannelKind, { fee_pct: number; fee_fixed: number }>> = {
  shopee: { fee_pct: 12, fee_fixed: 1250 },
  tiktok_shop: { fee_pct: 15, fee_fixed: 1000 },
  tokopedia: { fee_pct: 10, fee_fixed: 1000 },
  gofood: { fee_pct: 20, fee_fixed: 0 },
  grabfood: { fee_pct: 20, fee_fixed: 0 },
  shopeefood: { fee_pct: 20, fee_fixed: 0 },
};

const feePct = z
  .number({ error: "Isi persen komisi." })
  .min(0, "Komisi tidak boleh minus.")
  .max(60, "Komisi di atas 60% hampir pasti salah ketik.")
  .refine((v) => Math.round(v * 1000) === v * 1000, "Maksimal 3 angka di belakang koma.");
const feeFixed = z.number({ error: "Isi biaya per pesanan." }).int("Rupiah utuh.").min(0, "Tidak boleh minus.").max(1_000_000, "Terlalu besar.");

export const ChannelFeeInput = z.object({ fee_pct: feePct, fee_fixed: feeFixed, is_active: z.boolean() });
export type ChannelFeeInput = z.infer<typeof ChannelFeeInput>;

export const NewChannelInput = z.object({
  kind: z.enum(CHANNEL_KINDS as [ChannelKind, ...ChannelKind[]], { error: "Pilih jenis kanal." }),
  name: z.string().trim().min(2, "Nama kanal minimal 2 huruf.").max(40, "Nama kanal maksimal 40 huruf."),
  fee_pct: feePct,
  fee_fixed: feeFixed,
});
export type NewChannelInput = z.infer<typeof NewChannelInput>;

/** The cashier channel is where POS sales go; it cannot be switched off. */
export function canDeactivate(kind: string): boolean {
  return kind !== "pos";
}

/**
 * Commission on one order, the same rule as `app.estimate_platform_fee`: round(net × pct / 100) + fixed,
 * half away from zero, whole rupiah. BigInt so a large order never loses precision (rule: no float money).
 */
export function estimateFee(net: number, feePctValue: number, feeFixedValue: number): number {
  if (feePctValue === 0 && feeFixedValue === 0) return 0;
  const milli = BigInt(Math.round(feePctValue * 1000)); // pct with up to 3 decimals
  const num = BigInt(net) * milli;
  const den = 100_000n;
  const q = num / den;
  const r = num % den;
  const rounded = r * 2n >= den ? q + 1n : q;
  return Number(rounded) + feeFixedValue;
}
