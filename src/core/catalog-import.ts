/**
 * Catalog import from a CSV file (GAP #3, PDF §A.2 / §C.2): products + variants
 * + HPP + opening stock. Pure: parse → map columns → validate per row → plan.
 * The database applies the rows (`import_catalog`); SKU is the idempotency key,
 * so importing the same file again updates instead of duplicating.
 * XLSX is not parsed here: Excel/Sheets/Shopee exports can be saved as CSV.
 */

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 2_000_000;
const MAX_RUPIAH = 1_000_000_000_000;

export type ImportField =
  | "name"
  | "option_label"
  | "sku"
  | "price"
  | "cost"
  | "initial_qty"
  | "category"
  | "unit"
  | "min_stock"
  | "description";

export const FIELD_LABELS: Record<ImportField, string> = {
  name: "Nama produk",
  option_label: "Varian",
  sku: "SKU",
  price: "Harga jual",
  cost: "HPP",
  initial_qty: "Stok awal",
  category: "Kategori",
  unit: "Satuan",
  min_stock: "Stok minimum",
  description: "Deskripsi",
};

const REQUIRED: ImportField[] = ["name", "sku", "price", "cost"];

/** Downloadable starting point; rows with the same name become variants of one product. */
export const IMPORT_TEMPLATE_CSV = [
  "nama produk,varian,sku,harga jual,hpp,stok awal,kategori,satuan,stok minimum",
  "Serum Vit C,20 ml,SVC-20,89000,35000,12,Serum,botol,5",
  "Serum Vit C,Mini,SVC-M,25000,,3,Serum,botol,",
  "Kopi Susu Aren,,KSA-1,18000,6000,0,Minuman,cup,",
].join("\r\n");

/** Header names as written by people, Excel templates, Shopee and TikTok Shop exports (normalized). */
const ALIASES: Record<string, ImportField> = Object.fromEntries(
  (
    [
      ["name", ["nama", "nama produk", "produk", "nama barang", "product", "product name", "nama item"]],
      ["option_label", ["varian", "variasi", "nama variasi", "nama varian", "variant", "variation", "pilihan"]],
      ["sku", ["sku", "kode", "kode sku", "kode barang", "sku variasi", "sku varian", "seller sku"]],
      ["price", ["harga", "harga jual", "price", "harga satuan"]],
      ["cost", ["hpp", "modal", "harga modal", "harga beli", "cost"]],
      ["initial_qty", ["stok", "stok awal", "stock", "qty", "jumlah", "quantity"]],
      ["category", ["kategori", "category"]],
      ["unit", ["satuan", "unit"]],
      ["min_stock", ["stok minimum", "min stok", "minimum stok", "stok min"]],
      ["description", ["deskripsi", "description", "keterangan"]],
    ] as const
  ).flatMap(([field, names]) => names.map((n) => [n, field])),
);

export interface CsvRow {
  /** 1-based line in the file where the row starts. */
  line: number;
  cells: string[];
}

function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const count = (d: string) => firstLine.split(d).length - 1;
  const candidates = [",", ";", "\t"].map((d) => [d, count(d)] as const).sort((a, b) => b[1] - a[1]);
  return candidates[0][1] > 0 ? candidates[0][0] : ",";
}

/** RFC 4180 CSV (quotes, doubled quotes, newlines in quotes, CRLF/LF), BOM stripped, blank lines skipped. */
export function parseCsv(input: string): CsvRow[] {
  const text = input.replace(/^﻿/, "");
  const delim = detectDelimiter(text);
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowStart = 1;
  const endRow = () => {
    cells.push(cell);
    if (cells.some((c) => c.trim() !== "")) rows.push({ line: rowStart, cells });
    cells = [];
    cell = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      cells.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
      rowStart = line;
    } else cell += ch;
  }
  if (quoted) throw new Error(`Ada tanda kutip (") yang tidak ditutup mulai baris ${rowStart}.`);
  if (cell !== "" || cells.length > 0) endRow();
  return rows;
}

/**
 * "89000", "89.000", "Rp 1.250.000", "Rp89.000,00", "89,000" → whole rupiah.
 * Empty → null. Fractions of a rupiah, negatives or text → NaN (never rounded).
 */
export function parseRupiahCell(raw: string): number | null {
  const s = raw.trim().replace(/^rp\.?/i, "").replace(/\s+/g, "");
  if (s === "") return null;
  const n = parseWhole(s.replace(/[.,]0{1,2}$/, ""));
  return Number.isNaN(n) || n > MAX_RUPIAH ? Number.NaN : n;
}

/** Whole counts: "12", "1.000". Empty → null, anything else → NaN. */
export function parseCount(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, "");
  return s === "" ? null : parseWhole(s);
}

function parseWhole(s: string): number {
  let digits: string;
  if (/^\d+$/.test(s)) digits = s;
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) digits = s.replace(/\./g, "");
  else if (/^\d{1,3}(,\d{3})+$/.test(s)) digits = s.replace(/,/g, "");
  else return Number.NaN;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : Number.NaN;
}

const normalizeHeader = (h: string) =>
  h
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Per-header manual choice from the preview ("Harga Coret" → abaikan). */
export type ColumnOverrides = Record<string, ImportField | "ignore">;

export type ColumnMapping =
  | { ok: true; columns: (ImportField | null)[] }
  | { ok: false; error: string; unknown: string[]; missing: ImportField[] };

export function mapColumns(headers: readonly string[], overrides: ColumnOverrides = {}): ColumnMapping {
  const columns: (ImportField | null)[] = [];
  const unknown: string[] = [];
  const seen = new Map<ImportField, string>();
  for (const header of headers) {
    const choice = overrides[header] ?? overrides[header.trim()];
    if (choice === "ignore" || (!choice && header.trim() === "")) {
      columns.push(null);
      continue;
    }
    const field = choice ?? ALIASES[normalizeHeader(header)];
    if (!field) {
      unknown.push(header);
      columns.push(null);
      continue;
    }
    const first = seen.get(field);
    if (first !== undefined) {
      return {
        ok: false,
        error: `Kolom "${first}" dan "${header}" sama-sama dibaca sebagai ${FIELD_LABELS[field]}. Abaikan salah satunya.`,
        unknown: [],
        missing: [],
      };
    }
    seen.set(field, header);
    columns.push(field);
  }
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Kolom tidak dikenal: ${unknown.map((u) => `"${u}"`).join(", ")}. Ganti judul kolomnya atau pilih "abaikan".`,
      unknown,
      missing: [],
    };
  }
  const missing = REQUIRED.filter((f) => !seen.has(f));
  if (missing.length > 0) {
    return { ok: false, error: `Kolom wajib belum ada: ${missing.map((f) => FIELD_LABELS[f]).join(", ")}.`, unknown: [], missing };
  }
  return { ok: true, columns };
}

export interface ImportItem {
  line: number;
  name: string;
  option_label: string;
  sku: string;
  price: number;
  /** null = empty cell: new variants get "HPP belum diisi", existing ones keep their HPP. */
  cost: number | null;
  /** Opening stock, only for SKUs not yet in the shop. */
  initial_qty: number;
  category: string;
  unit: string;
  min_stock: number | null;
  description: string;
}

export interface RowError {
  line: number;
  sku: string;
  message: string;
}

/**
 * The per-row errors kept in `catalog_imports.errors` (rows the app rejected +
 * rows the RPC could not save), read back for the history: malformed entries
 * are dropped, line order restored (rejected rows are stored first).
 */
export function storedRowErrors(raw: unknown): RowError[] {
  if (!Array.isArray(raw)) return [];
  const out: RowError[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const { line, sku, message } = e as Record<string, unknown>;
    const n = typeof line === "number" ? line : Number(line);
    if (!Number.isInteger(n) || n < 1 || typeof message !== "string" || !message.trim()) continue;
    out.push({ line: n, sku: typeof sku === "string" ? sku : "", message });
  }
  return out.sort((a, b) => a.line - b.line);
}

const LIMITS: Partial<Record<ImportField, number>> = { name: 120, option_label: 60, sku: 40, category: 60, unit: 20, description: 1000 };

function validateRow(get: (f: ImportField) => string, line: number): ImportItem | string {
  const name = get("name");
  const sku = get("sku");
  if (!name) return "Nama produk wajib diisi.";
  if (!sku) return "SKU wajib diisi (dipakai supaya impor ulang tidak dobel).";
  for (const [field, max] of Object.entries(LIMITS) as [ImportField, number][]) {
    if (get(field).length > max) return `${FIELD_LABELS[field]} maksimal ${max} huruf.`;
  }
  const price = parseRupiahCell(get("price"));
  if (price === null) return "Harga jual wajib diisi.";
  if (Number.isNaN(price)) return "Harga jual harus angka rupiah bulat (contoh 89000).";
  const cost = parseRupiahCell(get("cost"));
  if (Number.isNaN(cost)) return "HPP harus angka rupiah bulat (kosongkan kalau belum tahu).";
  const qty = parseCount(get("initial_qty"));
  if (Number.isNaN(qty) || (qty ?? 0) > 1_000_000) return "Stok awal harus angka bulat.";
  const minStock = parseCount(get("min_stock"));
  if (Number.isNaN(minStock) || (minStock ?? 0) > 100_000) return "Stok minimum harus angka bulat.";
  return {
    line,
    name,
    option_label: get("option_label"),
    sku,
    price,
    cost,
    initial_qty: qty ?? 0,
    category: get("category"),
    unit: get("unit"),
    min_stock: minStock,
    description: get("description"),
  };
}

export type PreparedImport =
  | { ok: true; headers: string[]; columns: (ImportField | null)[]; items: ImportItem[]; errors: RowError[]; totalRows: number }
  | { ok: false; error: string; headers?: string[]; unknown?: string[] };

/** File text → valid items + per-line errors. A bad row never stops the others; a bad header stops the file. */
export function prepareImport(text: string, overrides: ColumnOverrides = {}): PreparedImport {
  let rows: CsvRow[];
  try {
    rows = parseCsv(text);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (rows.length === 0) return { ok: false, error: "File kosong." };
  const headers = rows[0].cells.map((h) => h.trim());
  const mapping = mapColumns(headers, overrides);
  if (!mapping.ok) return { ok: false, error: mapping.error, headers, unknown: mapping.unknown };
  const body = rows.slice(1);
  if (body.length === 0) return { ok: false, error: "File ini belum ada baris produknya.", headers };
  if (body.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: `File terlalu besar: maksimal ${MAX_IMPORT_ROWS} baris per impor. Pecah jadi beberapa file.`, headers };
  }

  const items: ImportItem[] = [];
  const errors: RowError[] = [];
  const skuLine = new Map<string, number>();
  for (const row of body) {
    const index = new Map(mapping.columns.map((f, i) => [f, i] as const));
    const get = (f: ImportField) => {
      const i = index.get(f);
      return i === undefined ? "" : (row.cells[i] ?? "").trim();
    };
    const sku = get("sku");
    if (row.cells.slice(headers.length).some((c) => c.trim() !== "")) {
      errors.push({ line: row.line, sku, message: "Jumlah kolom di baris ini lebih banyak dari judul kolom." });
      continue;
    }
    const result = validateRow(get, row.line);
    if (typeof result === "string") {
      errors.push({ line: row.line, sku, message: result });
      continue;
    }
    const key = result.sku.toLowerCase();
    const first = skuLine.get(key);
    if (first !== undefined) {
      errors.push({ line: row.line, sku, message: `SKU ${result.sku} sudah dipakai di baris ${first}.` });
      continue;
    }
    skuLine.set(key, row.line);
    items.push(result);
  }
  return { ok: true, headers, columns: mapping.columns, items, errors, totalRows: body.length };
}

export interface PlannedRow {
  line: number;
  sku: string;
  name: string;
  option_label: string;
  action: "create" | "update";
  /** Existing SKU with an opening stock in the file: the stock is not added again. */
  stockIgnored: boolean;
}

/** Preview: which rows create a new variant and which update an existing SKU (case-insensitive, same as SQL). */
export function planImport(items: readonly ImportItem[], existing: readonly { sku: string | null }[]) {
  const known = new Set(existing.map((e) => (e.sku ?? "").toLowerCase()).filter(Boolean));
  const rows: PlannedRow[] = items.map((i) => {
    const action = known.has(i.sku.toLowerCase()) ? "update" : "create";
    return { line: i.line, sku: i.sku, name: i.name, option_label: i.option_label, action, stockIgnored: action === "update" && i.initial_qty > 0 };
  });
  const counts = { create: rows.filter((r) => r.action === "create").length, update: rows.filter((r) => r.action === "update").length };
  return { rows, counts };
}
