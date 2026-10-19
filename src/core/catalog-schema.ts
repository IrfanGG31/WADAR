import { z } from "zod";

/** Whole rupiah, non-negative, within JS safe-integer range (bigint in the database). */
const rupiah = (required: string) => z.number({ error: required }).int().min(0, required).max(1_000_000_000_000);

export const VariantInput = z.object({
  id: z.string().uuid().optional(),
  option_label: z.string().trim().max(60).optional().default(""),
  sku: z.string().trim().max(40).optional().default(""),
  price: rupiah("Harga jual wajib diisi."),
  /** HPP must be entered (CAT-1); 0 is allowed and shows as "HPP belum diisi". */
  cost: rupiah("HPP wajib diisi (boleh 0 kalau belum tahu)."),
  min_stock: z.number().int().min(0).max(100_000).default(0),
  lead_time_days: z.number().int().min(0).max(365).default(3),
  pack_size: z.number().int().min(1).max(10_000).default(1),
  /** Create only: opening stock, recorded as a purchase at `cost`. */
  initial_qty: z.number().int().min(0).max(1_000_000).optional(),
});

export const ProductInput = z.object({
  name: z.string().trim().min(1, "Nama produk wajib diisi.").max(120),
  category: z.string().trim().max(60).optional().default(""),
  description: z.string().trim().max(1000).optional().default(""),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  image_path: z.string().trim().max(500).optional().default(""),
  variants: z.array(VariantInput).min(1, "Minimal satu varian.").max(50),
});

export type ProductInput = z.infer<typeof ProductInput>;
export type VariantInput = z.infer<typeof VariantInput>;

export const StockInInput = z.object({
  variant_id: z.string().uuid(),
  qty: z.number().int().min(1, "Jumlah minimal 1.").max(1_000_000),
  unit_cost: rupiah("Harga modal per satuan wajib diisi."),
  note: z.string().trim().max(200).optional().default(""),
  /** STK-5: optional expiry date of this batch (YYYY-MM-DD). */
  expires_on: z
    .preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal kedaluwarsa belum benar.").nullish())
    .transform((v) => v ?? null),
});

/** STK-0b: stock changed outside a sale/purchase — damaged, lost, expired, returned to supplier, found, corrected. */
export const StockAdjustInput = z.object({
  variant_id: z.string().uuid(),
  reason: z.enum(["rusak", "hilang", "kedaluwarsa", "retur_pemasok", "ditemukan", "koreksi"], { error: "Pilih alasan." }),
  qty: z
    .number({ error: "Isi jumlahnya." })
    .int("Jumlah harus bilangan bulat.")
    .min(-1_000_000)
    .max(1_000_000)
    .refine((v) => v !== 0, "Jumlah tidak boleh 0."),
  note: z.string().trim().max(200).optional().default(""),
});

/** STK-0b: physical count; the difference to the system figure is booked as an opname movement. */
export const StockOpnameInput = z.object({
  variant_id: z.string().uuid(),
  counted: z.number({ error: "Isi hasil hitung." }).int("Hasil hitung harus bilangan bulat.").min(0, "Hasil hitung tidak boleh minus.").max(1_000_000),
  note: z.string().trim().max(200).optional().default(""),
});
