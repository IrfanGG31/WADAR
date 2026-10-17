/**
 * Ekspor data toko (PDF §C.3 Tabel 10 "data bisa diekspor"): CSV per tabel,
 * dibungkus satu ZIP. Pure — no I/O; src/db/export.ts loads
 * the rows as the signed-in owner (RLS) and the Pengaturan action downloads.
 */

import { brand } from "@/brand";

export type CsvValue = string | number | boolean | null | undefined;

/** Text that a spreadsheet would run as a formula ("=…", "+…", "-…", "@…"). */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One RFC 4180 cell. Text cells that look like formulas get a leading `'` (CSV injection). */
export function csvCell(v: CsvValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "ya" : "tidak";
  if (typeof v === "number") return String(v);
  const text = FORMULA_START.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",") + "\r\n").join("");
}

/* ─── ZIP (stored, no compression) ─────────────────────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/** A ZIP archive with every entry stored as-is (method 0); names are UTF-8 (flag bit 11). */
export function zipStore(entries: readonly ZipEntry[], date = new Date(Date.UTC(2026, 0, 1))): Uint8Array {
  const enc = new TextEncoder();
  const dosTime = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2);
  const dosDate = ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, e.data.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, e.data.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, e.data);
    centrals.push(central);
    offset += local.length + e.data.length;
  }
  const cdSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + cdSize + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/* ─── Tabel toko → file CSV ────────────────────────────────────────────────── */

/** Rows as selected by src/db/export.ts (column names = the database's). */
export interface ExportData {
  channels: { id: string; name: string }[];
  products: { id: string; name: string; category: string | null; unit: string; is_active: boolean; deleted_at: string | null; created_at: string }[];
  variants: {
    id: string;
    product_id: string;
    sku: string | null;
    barcode: string | null;
    option_label: string | null;
    price: number;
    avg_cost: number;
    on_hand: number;
    min_stock: number;
    created_at: string;
  }[];
  sales: {
    id: string;
    occurred_at: string;
    channel_id: string;
    status: string;
    customer_id: string | null;
    subtotal: number;
    order_discount: number;
    shipping_subsidy: number;
    platform_fee: number;
    total: number;
    payment_method: string | null;
    note: string | null;
  }[];
  sale_items: {
    sale_id: string;
    variant_id: string | null;
    name_snapshot: string;
    qty: number;
    unit_price: number;
    line_discount: number;
    unit_cost_snapshot: number;
  }[];
  expenses: { id: string; occurred_at: string; category: string; amount: number; note: string | null }[];
  customers: {
    id: string;
    name: string | null;
    phone_e164: string | null;
    first_channel: string | null;
    notes: string | null;
    tags: string[] | null;
    total_spent: number;
    orders_count: number;
    last_order_at: string | null;
  }[];
  conversations: {
    id: string;
    channel: string;
    external_user_id: string;
    mode: string;
    status: string;
    escalation_reason: string | null;
    created_at: string;
    last_message_at: string;
  }[];
  messages: { id: string; conversation_id: string; created_at: string; direction: string; author: string; content: string | null }[];
}

/** Every table of one shop as CSV files, fixed order; an empty table still gets its header row. */
export function buildExportEntries(d: ExportData): ZipEntry[] {
  const channelName = new Map(d.channels.map((c) => [c.id, c.name]));
  const files: [string, string[], CsvValue[][]][] = [
    [
      "produk.csv",
      ["id", "nama", "kategori", "satuan", "aktif", "dihapus_pada", "dibuat_pada"],
      d.products.map((p) => [p.id, p.name, p.category, p.unit, p.is_active, p.deleted_at, p.created_at]),
    ],
    [
      "varian.csv",
      ["id", "produk_id", "sku", "barcode", "opsi", "harga", "hpp_rata_rata", "stok", "stok_minimum", "dibuat_pada"],
      d.variants.map((v) => [v.id, v.product_id, v.sku, v.barcode, v.option_label, v.price, v.avg_cost, v.on_hand, v.min_stock, v.created_at]),
    ],
    [
      "penjualan.csv",
      ["id", "waktu", "kanal", "status", "pelanggan_id", "subtotal", "diskon_order", "subsidi_ongkir", "biaya_platform", "total", "metode_bayar", "catatan"],
      d.sales.map((s) => [
        s.id, s.occurred_at, channelName.get(s.channel_id) ?? s.channel_id, s.status, s.customer_id,
        s.subtotal, s.order_discount, s.shipping_subsidy, s.platform_fee, s.total, s.payment_method, s.note,
      ]),
    ],
    [
      "item_penjualan.csv",
      ["penjualan_id", "varian_id", "nama", "qty", "harga_satuan", "diskon_baris", "hpp_satuan"],
      d.sale_items.map((i) => [i.sale_id, i.variant_id, i.name_snapshot, i.qty, i.unit_price, i.line_discount, i.unit_cost_snapshot]),
    ],
    [
      "pengeluaran.csv",
      ["id", "tanggal", "kategori", "jumlah", "catatan"],
      d.expenses.map((e) => [e.id, e.occurred_at, e.category, e.amount, e.note]),
    ],
    [
      "pelanggan.csv",
      ["id", "nama", "telepon", "kanal_pertama", "catatan", "tag", "total_belanja", "jumlah_order", "order_terakhir"],
      d.customers.map((c) => [
        c.id, c.name, c.phone_e164, c.first_channel, c.notes, (c.tags ?? []).join("; "), c.total_spent, c.orders_count, c.last_order_at,
      ]),
    ],
    [
      "percakapan.csv",
      ["id", "kanal", "pengunjung", "mode", "status", "alasan_eskalasi", "dibuat_pada", "pesan_terakhir_pada"],
      d.conversations.map((c) => [c.id, c.channel, c.external_user_id, c.mode, c.status, c.escalation_reason, c.created_at, c.last_message_at]),
    ],
    [
      "pesan.csv",
      ["id", "percakapan_id", "waktu", "arah", "penulis", "isi"],
      d.messages.map((m) => [m.id, m.conversation_id, m.created_at, m.direction, m.author, m.content]),
    ],
  ];
  const enc = new TextEncoder();
  return files.map(([name, headers, rows]) => ({ name, data: enc.encode(toCsv(headers, rows)) }));
}

/** `<brand>-<slug>-YYYYMMDD.zip`, dated in WIB (the shops' timezone). */
export function exportFileName(slug: string, now: Date): string {
  const wib = new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10).replaceAll("-", "");
  return `${brand.shortName.toLowerCase()}-${slug}-${wib}.zip`;
}
