import { z } from "zod";
import { parseCount, parseCsv, parseRupiahCell } from "./catalog-import";
import { startOfDayUtc } from "./period";

/**
 * IMP-1..3: orders exported from Shopee / TikTok Shop / Tokopedia seller centers (CSV, one row per
 * item — order-level numbers repeat on every row of the order). Headers vary by marketplace and
 * export language, so columns are found by alias; unknown columns are simply ignored.
 */
export const MARKETPLACES = { shopee: "Shopee", tiktok_shop: "TikTok Shop", tokopedia: "Tokopedia" } as const;
export type Marketplace = keyof typeof MARKETPLACES;
export const MAX_MARKETPLACE_ORDERS = 2000;
export const MAX_MARKETPLACE_BYTES = 5_000_000;

export type OrderField =
  | "order_id"
  | "status"
  | "created_at"
  | "sku"
  | "product"
  | "variation"
  | "qty"
  | "unit_price"
  | "line_total"
  | "seller_discount"
  | "platform_fee"
  | "buyer";

export const ORDER_FIELD_LABEL: Record<OrderField, string> = {
  order_id: "Nomor pesanan",
  status: "Status",
  created_at: "Waktu pesanan",
  sku: "SKU",
  product: "Nama produk",
  variation: "Variasi",
  qty: "Jumlah",
  unit_price: "Harga satuan",
  line_total: "Total harga produk",
  seller_discount: "Voucher/diskon penjual",
  platform_fee: "Biaya admin/layanan",
  buyer: "Pembeli",
};

const norm = (h: string) =>
  h
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Normalized header → field. First match per field wins, so list the most specific names first. */
const ALIAS_LIST: [OrderField, string[]][] = [
  ["order_id", ["no pesanan", "nomor pesanan", "order id", "id pesanan", "nomor invoice", "invoice", "no invoice", "order sn"]],
  ["status", ["status pesanan", "order status", "status", "status terakhir", "order substatus"]],
  ["created_at", ["waktu pesanan dibuat", "created time", "tanggal pesanan", "waktu pembayaran dilakukan", "tanggal pembayaran", "order create time", "paid time", "waktu pesanan"]],
  ["sku", ["nomor referensi sku", "seller sku", "sku", "nomor sku", "sku penjual", "sku induk", "kode sku"]],
  ["product", ["nama produk", "product name", "produk"]],
  ["variation", ["nama variasi", "variation", "variasi", "varian", "tipe produk"]],
  ["qty", ["jumlah", "quantity", "jumlah produk dibeli", "jumlah produk", "qty"]],
  ["unit_price", ["harga setelah diskon", "sku unit original price after discount", "harga jual idr", "harga jual", "harga satuan", "unit price"]],
  ["line_total", ["total harga produk", "sku subtotal after discount", "total harga produk idr", "subtotal produk", "total produk"]],
  ["seller_discount", ["voucher ditanggung penjual", "diskon penjual", "seller discount", "voucher toko", "nilai voucher penjual"]],
  ["platform_fee", ["total biaya admin dan layanan", "biaya admin dan layanan", "total biaya platform", "platform fee", "biaya layanan dan admin"]],
  ["buyer", ["username pembeli", "buyer username", "nama pembeli", "buyer name", "nama penerima", "recipient"]],
];
const ALIASES = new Map<string, OrderField>();
for (const [field, names] of ALIAS_LIST) for (const n of names) if (!ALIASES.has(n)) ALIASES.set(n, field);

const REQUIRED: OrderField[] = ["order_id", "qty"];

/** Guess the marketplace from headers only it uses. */
export function detectMarketplace(headers: readonly string[]): Marketplace | null {
  const h = new Set(headers.map(norm));
  if (h.has("no pesanan") || h.has("nomor referensi sku") || h.has("voucher ditanggung penjual")) return "shopee";
  if (h.has("order id") && (h.has("seller sku") || h.has("sku subtotal after discount") || h.has("created time"))) return "tiktok_shop";
  if (h.has("nomor invoice") || h.has("invoice") || h.has("jumlah produk dibeli")) return "tokopedia";
  return null;
}

export type OrderStatus = "completed" | "canceled" | "returned";

/** Marketplace status text → what WADAR books. null = not an order yet (unpaid). */
export function mapOrderStatus(raw: string): OrderStatus | null {
  const s = raw.toLowerCase();
  if (/belum bayar|unpaid|menunggu pembayaran|awaiting payment/.test(s)) return null;
  if (/batal|cancel|dibatalkan|ditolak/.test(s)) return "canceled";
  if (/pengembalian|dikembalikan|retur|return|refund/.test(s)) return "returned";
  return "completed";
}

/** "2026-10-18 14:22", "18/10/2026 14:22:05", "18-10-2026", ISO with offset → UTC ISO (wall time read in the shop's zone). */
export function parseOrderTime(raw: string, timeZone: string): string | null {
  const s = raw.trim();
  if (s === "") return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))) return new Date(s).toISOString();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  let y: number, mo: number, d: number;
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return null;
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const day = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const midnight = Date.parse(startOfDayUtc(day, timeZone));
  const secs = Number(m[4] ?? 0) * 3600 + Number(m[5] ?? 0) * 60 + Number(m[6] ?? 0);
  return new Date(midnight + secs * 1000).toISOString();
}

export interface OrderLine {
  /** Key used for matching to a WADAR variant: the SKU, or "name | variation" when there is none. */
  key: string;
  sku: string | null;
  name: string;
  qty: number;
  unit_price: number;
  line_discount: number;
}

export interface ParsedOrder {
  external_order_id: string;
  occurred_at: string | null;
  status: OrderStatus;
  buyer_name: string | null;
  order_discount: number;
  /** null = not in the file; the database estimates it from the channel's rate. */
  platform_fee: number | null;
  lines: OrderLine[];
}

export interface MarketplaceRowError {
  line: number;
  message: string;
}

export type ParsedMarketplaceFile =
  | { ok: false; error: string }
  | {
      ok: true;
      detected: Marketplace | null;
      found: OrderField[];
      orders: ParsedOrder[];
      unpaid: number;
      errors: MarketplaceRowError[];
    };

export function lineKey(sku: string | null, name: string, variation: string): string {
  if (sku) return sku.trim();
  return variation.trim() ? `${name.trim()} | ${variation.trim()}` : name.trim();
}

export function parseMarketplaceCsv(text: string, timeZone: string): ParsedMarketplaceFile {
  if (text.length > MAX_MARKETPLACE_BYTES) return { ok: false, error: "File terlalu besar (maksimal 5 MB). Ekspor per minggu atau per bulan." };
  let rows;
  try {
    rows = parseCsv(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "File tidak terbaca." };
  }
  const [head, ...body] = rows;
  if (!head) return { ok: false, error: "File kosong." };
  const columns = new Map<OrderField, number>();
  head.cells.forEach((h, i) => {
    const f = ALIASES.get(norm(h));
    if (f && !columns.has(f)) columns.set(f, i);
  });
  const missing = REQUIRED.filter((f) => !columns.has(f));
  if (!columns.has("sku") && !columns.has("product")) missing.push("sku");
  if (!columns.has("unit_price") && !columns.has("line_total")) missing.push("unit_price");
  if (missing.length) {
    return {
      ok: false,
      error: `Kolom ${missing.map((f) => ORDER_FIELD_LABEL[f]).join(", ")} tidak ditemukan. Pastikan file adalah ekspor pesanan dari Seller Center (simpan sebagai CSV).`,
    };
  }

  const get = (cells: string[], f: OrderField) => {
    const i = columns.get(f);
    return i === undefined ? "" : (cells[i] ?? "").trim();
  };
  const orders = new Map<string, ParsedOrder>();
  const errors: MarketplaceRowError[] = [];
  const unpaidIds = new Set<string>();
  for (const { line, cells } of body) {
    const id = get(cells, "order_id");
    if (!id) {
      errors.push({ line, message: "Nomor pesanan kosong." });
      continue;
    }
    const status = mapOrderStatus(get(cells, "status"));
    if (status === null) {
      unpaidIds.add(id);
      continue;
    }
    const qty = parseCount(get(cells, "qty"));
    if (qty === null || Number.isNaN(qty) || qty <= 0) {
      errors.push({ line, message: `Pesanan ${id}: jumlah barang tidak terbaca.` });
      continue;
    }
    const unitRaw = parseRupiahCell(get(cells, "unit_price"));
    const totalRaw = parseRupiahCell(get(cells, "line_total"));
    let unit: number;
    let lineDiscount = 0;
    if (totalRaw !== null && !Number.isNaN(totalRaw)) {
      // Exact line total: unit rounded up, the remainder booked as a line discount (integer rupiah, no float).
      unit = Math.ceil(totalRaw / qty);
      lineDiscount = unit * qty - totalRaw;
    } else if (unitRaw !== null && !Number.isNaN(unitRaw)) unit = unitRaw;
    else {
      errors.push({ line, message: `Pesanan ${id}: harga tidak terbaca.` });
      continue;
    }
    const sku = get(cells, "sku") || null;
    const name = get(cells, "product") || sku || "Produk";
    const variation = get(cells, "variation");
    let order = orders.get(id);
    if (!order) {
      const fee = parseRupiahCell(get(cells, "platform_fee").replace(/^-/, ""));
      const disc = parseRupiahCell(get(cells, "seller_discount").replace(/^-/, ""));
      const when = get(cells, "created_at");
      const at = parseOrderTime(when, timeZone);
      if (when && !at) errors.push({ line, message: `Pesanan ${id}: waktu "${when}" tidak terbaca, dipakai waktu impor.` });
      order = {
        external_order_id: id,
        occurred_at: at,
        status,
        buyer_name: get(cells, "buyer") || null,
        order_discount: disc !== null && !Number.isNaN(disc) ? disc : 0,
        platform_fee: fee !== null && !Number.isNaN(fee) ? fee : null,
        lines: [],
      };
      orders.set(id, order);
    }
    order.lines.push({
      key: lineKey(sku, name, variation),
      sku,
      name: variation ? `${name} — ${variation}` : name,
      qty,
      unit_price: unit,
      line_discount: lineDiscount,
    });
  }
  if (orders.size > MAX_MARKETPLACE_ORDERS) {
    return { ok: false, error: `Maksimal ${MAX_MARKETPLACE_ORDERS.toLocaleString("id-ID")} pesanan per impor. Ekspor per minggu.` };
  }
  return {
    ok: true,
    detected: detectMarketplace(head.cells),
    found: [...columns.keys()],
    orders: [...orders.values()],
    unpaid: unpaidIds.size,
    errors,
  };
}

export interface VariantRef {
  id: string;
  sku: string | null;
  label: string;
}

/** Auto-match by SKU (case-insensitive), then by "Product — Variant" name; manual choices win. */
export function matchLines(
  orders: readonly ParsedOrder[],
  variants: readonly VariantRef[],
  manual: Readonly<Record<string, string>> = {},
): { match: Map<string, string>; unmatched: { key: string; name: string; orders: number }[] } {
  const bySku = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const v of variants) {
    if (v.sku) bySku.set(v.sku.trim().toLowerCase(), v.id);
    byName.set(norm(v.label), v.id);
  }
  const known = new Set(variants.map((v) => v.id));
  const match = new Map<string, string>();
  const unmatched = new Map<string, { key: string; name: string; orders: number }>();
  for (const o of orders) {
    for (const l of o.lines) {
      if (match.has(l.key)) continue;
      const chosen = manual[l.key];
      const id =
        (chosen && known.has(chosen) ? chosen : undefined) ?? (l.sku ? bySku.get(l.sku.toLowerCase()) : undefined) ?? byName.get(norm(l.name));
      if (id) {
        match.set(l.key, id);
        unmatched.delete(l.key);
      } else {
        const u = unmatched.get(l.key) ?? { key: l.key, name: l.name, orders: 0 };
        u.orders += 1;
        unmatched.set(l.key, u);
      }
    }
  }
  return { match, unmatched: [...unmatched.values()] };
}

/** Orders ready for `public.import_marketplace_orders`, and how many wait for "Perlu dicocokkan". */
export function toImportPayload(orders: readonly ParsedOrder[], match: ReadonlyMap<string, string>) {
  const ready = [];
  let held = 0;
  for (const o of orders) {
    if (!o.lines.every((l) => match.has(l.key))) {
      held += 1;
      continue;
    }
    ready.push({
      external_order_id: o.external_order_id,
      occurred_at: o.occurred_at,
      status: o.status,
      buyer_name: o.buyer_name,
      order_discount: o.order_discount,
      platform_fee: o.platform_fee,
      items: o.lines.map((l) => ({ variant_id: match.get(l.key), qty: l.qty, unit_price: l.unit_price, line_discount: l.line_discount })),
    });
  }
  return { ready, held };
}

const rupiah = z.number().int().min(0).max(1_000_000_000_000);
/** What the browser sends after parsing + matching: validated again on the server before the RPC. */
export const MarketplaceImportInput = z.object({
  channel_id: z.string().uuid("Pilih kanal."),
  marketplace: z.enum(["shopee", "tiktok_shop", "tokopedia", "other"]),
  file_name: z.string().trim().max(200),
  orders: z
    .array(
      z.object({
        external_order_id: z.string().trim().min(1).max(100),
        occurred_at: z.string().datetime({ offset: true }).nullable(),
        status: z.enum(["completed", "canceled", "returned"]),
        buyer_name: z.string().trim().max(120).nullable(),
        order_discount: rupiah,
        platform_fee: rupiah.nullable(),
        items: z
          .array(z.object({ variant_id: z.string().uuid(), qty: z.number().int().min(1).max(100_000), unit_price: rupiah, line_discount: rupiah }))
          .min(1)
          .max(200),
      }),
    )
    .min(1, "Tidak ada pesanan yang siap diimpor.")
    .max(MAX_MARKETPLACE_ORDERS),
});
export type MarketplaceImportInput = z.infer<typeof MarketplaceImportInput>;
