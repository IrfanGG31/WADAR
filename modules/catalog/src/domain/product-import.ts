import { ProductImportRow, type ImportRowError } from "@wadar/contracts";

/** Header aliases a UMKM spreadsheet realistically uses (case/space-insensitive). */
const HEADER_ALIASES: Record<string, keyof ProductImportRow> = {
  nama: "name",
  "nama produk": "name",
  "nama barang": "name",
  produk: "name",
  name: "name",
  "product name": "name",
  varian: "variant",
  variasi: "variant",
  variant: "variant",
  sku: "sku",
  "kode sku": "sku",
  kode: "sku",
  "kode barang": "sku",
  barcode: "barcode",
  "kode barcode": "barcode",
  kategori: "category",
  category: "category",
  harga: "price",
  "harga jual": "price",
  price: "price",
  hpp: "cost",
  modal: "cost",
  "harga modal": "cost",
  "harga beli": "cost",
  cost: "cost",
  stok: "stock",
  "stok awal": "stock",
  stock: "stock",
  qty: "stock",
  jumlah: "stock",
};

const NUMERIC_FIELDS = new Set<keyof ProductImportRow>(["price", "cost", "stock"]);

/**
 * "Rp15.000", "15.000", "15,000", "15000", 15000 → 15000. Indonesian
 * spreadsheets use "." for thousands; a trailing ",dd" is treated as
 * decimal cents and dropped (rupiah amounts are whole numbers). Returns
 * NaN for anything that isn't a number, so validation reports it.
 */
export function parseIndonesianNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : Number.NaN;
  if (typeof value !== "string") return Number.NaN;
  let text = value.trim().replace(/^rp\.?\s*/i, "").replace(/\s/g, "");
  if (text === "") return Number.NaN;
  const negative = text.startsWith("-");
  if (negative) text = text.slice(1);
  text = text.replace(/,\d{1,2}$/, "");
  if (!/^[\d.,]+$/.test(text)) return Number.NaN;
  const digits = text.replace(/[.,]/g, "");
  const parsed = Number(digits);
  return negative ? -parsed : parsed;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ").replace(/[*:]/g, "");
}

/** Maps a raw spreadsheet row (arbitrary headers) onto ProductImportRow's field names. */
export function normalizeImportRow(raw: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = HEADER_ALIASES[normalizeHeader(header)];
    if (!field || normalized[field] !== undefined) continue;
    if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) continue;
    if (NUMERIC_FIELDS.has(field)) {
      normalized[field] = parseIndonesianNumber(value);
    } else {
      normalized[field] = String(value);
    }
  }
  return normalized;
}

export interface ImportVariantPlan {
  row: number;
  name: string;
  sku?: string;
  barcode?: string;
  price: number;
  cost?: number;
  stock?: number;
}

export interface ImportProductPlan {
  name: string;
  category?: string;
  variants: ImportVariantPlan[];
}

export interface ImportPlan {
  products: ImportProductPlan[];
  errors: ImportRowError[];
  validRows: number;
}

const FIELD_LABEL: Record<string, string> = {
  name: "Nama",
  price: "Harga",
  cost: "HPP",
  stock: "Stok",
  sku: "SKU",
  barcode: "Barcode",
  variant: "Varian",
  category: "Kategori",
};

/**
 * Validates every row independently (one bad row never blocks the others —
 * docs/BUILD-PLAN.md M2 DoD: "baris invalid dilaporkan jelas"), checks
 * SKU/barcode uniqueness against both the file itself and what the tenant
 * already has, then groups valid rows sharing a product name into one
 * product with several variants.
 */
export function planProductImport(
  rawRows: Array<Record<string, unknown>>,
  existing: { skus: ReadonlySet<string>; barcodes: ReadonlySet<string> },
): ImportPlan {
  const errors: ImportRowError[] = [];
  const seenSkus = new Map<string, number>();
  const seenBarcodes = new Map<string, number>();
  const seenVariantKeys = new Map<string, number>();
  const groups = new Map<string, ImportProductPlan>();
  let validRows = 0;

  rawRows.forEach((raw, index) => {
    const row = index + 2; // row 1 is the header in the user's spreadsheet
    const normalized = normalizeImportRow(raw);
    const parsed = ProductImportRow.safeParse(normalized);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((issue) => {
        const field = String(issue.path[0] ?? "");
        const label = FIELD_LABEL[field] ?? field;
        const value = normalized[field];
        if (value === undefined) return `${label} wajib diisi`;
        if (typeof value === "number" && Number.isNaN(value)) return `${label} harus berupa angka`;
        if (issue.code === "too_small" && (field === "price" || field === "cost" || field === "stock")) {
          return `${label} tidak boleh minus`;
        }
        return `${label}: ${issue.message}`;
      });
      errors.push({ row, message: messages.join("; ") });
      return;
    }

    const data = parsed.data;
    const rowErrors: string[] = [];
    if (data.sku) {
      const key = data.sku.toLowerCase();
      if (existing.skus.has(key)) rowErrors.push(`SKU "${data.sku}" sudah dipakai produk lain`);
      else if (seenSkus.has(key)) rowErrors.push(`SKU "${data.sku}" dobel dengan baris ${seenSkus.get(key)}`);
    }
    if (data.barcode) {
      if (existing.barcodes.has(data.barcode)) rowErrors.push(`Barcode "${data.barcode}" sudah dipakai produk lain`);
      else if (seenBarcodes.has(data.barcode)) {
        rowErrors.push(`Barcode "${data.barcode}" dobel dengan baris ${seenBarcodes.get(data.barcode)}`);
      }
    }
    const productKey = data.name.toLowerCase();
    const variantKey = `${productKey}\u0000${(data.variant ?? "").toLowerCase()}`;
    if (seenVariantKeys.has(variantKey)) {
      rowErrors.push(`Produk & varian ini dobel dengan baris ${seenVariantKeys.get(variantKey)}`);
    }
    if (rowErrors.length > 0) {
      errors.push({ row, message: rowErrors.join("; ") });
      return;
    }

    if (data.sku) seenSkus.set(data.sku.toLowerCase(), row);
    if (data.barcode) seenBarcodes.set(data.barcode, row);
    seenVariantKeys.set(variantKey, row);

    let group = groups.get(productKey);
    if (!group) {
      group = { name: data.name, category: data.category, variants: [] };
      groups.set(productKey, group);
    }
    group.variants.push({
      row,
      name: data.variant ?? "",
      sku: data.sku,
      barcode: data.barcode,
      price: data.price,
      cost: data.cost,
      stock: data.stock,
    });
    validRows += 1;
  });

  return { products: [...groups.values()], errors, validRows };
}
