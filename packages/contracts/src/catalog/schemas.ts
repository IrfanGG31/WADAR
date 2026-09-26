import { z } from "zod";
import { Rupiah, SalesChannel } from "@wadar/contracts/common";

const OptionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

export const VariantInput = z.object({
  name: z.string().trim().max(80).default(""),
  sku: OptionalText(64),
  barcode: OptionalText(64),
  price: Rupiah,
  cost: Rupiah.optional(),
  initialStock: z.number().int().min(0).max(1_000_000).optional(),
});
export type VariantInput = z.input<typeof VariantInput>;

export const CreateProductBody = z.object({
  name: z.string().trim().min(2, "Nama produk minimal 2 huruf").max(120),
  description: OptionalText(2000),
  category: OptionalText(60),
  outletId: z.uuid(),
  variants: z.array(VariantInput).min(1).max(100),
});
export type CreateProductBody = z.infer<typeof CreateProductBody>;

export const UpdateProductBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  archived: z.boolean().optional(),
});
export type UpdateProductBody = z.infer<typeof UpdateProductBody>;

export const UpdateVariantBody = z.object({
  name: z.string().trim().max(80).optional(),
  sku: z.string().trim().max(64).nullable().optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
  price: Rupiah.optional(),
  cost: Rupiah.nullable().optional(),
  archived: z.boolean().optional(),
});
export type UpdateVariantBody = z.infer<typeof UpdateVariantBody>;

export const AddVariantBody = VariantInput.extend({ outletId: z.uuid() });
export type AddVariantBody = z.infer<typeof AddVariantBody>;

export const SetChannelPriceBody = z.object({
  channel: SalesChannel,
  /** null removes the override (falls back to the variant's base price). */
  price: Rupiah.nullable(),
});
export type SetChannelPriceBody = z.infer<typeof SetChannelPriceBody>;

/** One flat spreadsheet row — rows sharing a `name` become one product with several variants. */
export const ProductImportRow = z.object({
  name: z.string().trim().min(2, "Nama produk minimal 2 huruf").max(120),
  variant: OptionalText(80),
  sku: OptionalText(64),
  barcode: OptionalText(64),
  category: OptionalText(60),
  price: Rupiah,
  cost: Rupiah.optional(),
  stock: z.number().int().min(0).max(1_000_000).optional(),
});
export type ProductImportRow = z.infer<typeof ProductImportRow>;

export const ImportProductsBody = z.object({
  outletId: z.uuid(),
  dryRun: z.boolean().default(false),
  /** Raw rows as parsed from the file; validated per row server-side. */
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2000),
});
export type ImportProductsBody = z.infer<typeof ImportProductsBody>;

export interface ImportRowError {
  /** 1-based row number as the user sees it in the spreadsheet (header = row 1). */
  row: number;
  message: string;
}

export interface ImportProductsResult {
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  productsCreated: number;
  variantsCreated: number;
  errors: ImportRowError[];
}

export interface VariantView {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  price: number;
  /** Omitted for roles without catalog/finance access (HPP is internal). */
  cost?: number | null;
  channelPrices: Partial<Record<SalesChannel, number>>;
  archived: boolean;
}

export interface ProductView {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  photoUrl: string | null;
  archived: boolean;
  createdAt: string;
  variants: VariantView[];
  /** PRD F3.9 — what's missing for accurate profit numbers. */
  missing: Array<"cost" | "photo" | "price">;
}

export const PhotoUploadBody = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
export type PhotoUploadBody = z.infer<typeof PhotoUploadBody>;
