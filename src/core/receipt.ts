/**
 * Struk publik (POS-3): a buyer opens `/struk/<token>` without logging in.
 * The token is the sale's random `receipt_token` (64 hex, migration
 * 20261017180000_public_receipt) — never the sale id — and the only reader is
 * `public.get_public_receipt(token)`, which returns that one sale. Pure helpers
 * for the page; the I/O is injected so "wrong token = 404" is testable.
 */

const TOKEN = /^[0-9a-f]{64}$/;

/** Same check as the SQL function: anything else is not looked up at all. */
export function isReceiptToken(token: string | null | undefined): token is string {
  return typeof token === "string" && TOKEN.test(token);
}

export interface ReceiptItem {
  name: string;
  qty: number;
  unitPrice: number;
  lineDiscount: number;
  /** qty × unit price − line discount, as booked by record_sale. */
  lineTotal: number;
}

export interface PublicReceipt {
  saleId: string;
  shopName: string;
  timezone: string;
  occurredAt: string;
  status: string;
  paymentMethod: string | null;
  channelName: string | null;
  subtotal: number;
  orderDiscount: number;
  total: number;
  items: ReceiptItem[];
}

function int(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isSafeInteger(n) ? n : 0;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** RPC jsonb → receipt; null when the shape is not a receipt (treated as not found). */
export function parseReceipt(data: unknown): PublicReceipt | null {
  if (!data || typeof data !== "object") return null;
  const r = data as Record<string, unknown>;
  const saleId = str(r.sale_id);
  const occurredAt = str(r.occurred_at);
  if (!saleId || !occurredAt) return null;
  const items = Array.isArray(r.items) ? r.items : [];
  return {
    saleId,
    shopName: str(r.shop_name) ?? "",
    timezone: str(r.timezone) ?? "Asia/Jakarta",
    occurredAt,
    status: str(r.status) ?? "completed",
    paymentMethod: str(r.payment_method),
    channelName: str(r.channel_name),
    subtotal: int(r.subtotal),
    orderDiscount: int(r.order_discount),
    total: int(r.total),
    items: items.map((raw) => {
      const i = (raw ?? {}) as Record<string, unknown>;
      const qty = int(i.qty);
      const unitPrice = int(i.unit_price);
      const lineDiscount = int(i.line_discount);
      return { name: str(i.name) ?? "Produk", qty, unitPrice, lineDiscount, lineTotal: qty * unitPrice - lineDiscount };
    }),
  };
}

/**
 * Load one public receipt. A malformed token never reaches the database; an
 * unknown token, a lookup error or an odd payload all mean "not found" (404) —
 * the page never tells a guesser which part was wrong.
 */
export async function loadPublicReceipt(
  token: string | null | undefined,
  fetchReceipt: (token: string) => Promise<{ data: unknown; error: unknown }>,
): Promise<PublicReceipt | null> {
  if (!isReceiptToken(token)) return null;
  const { data, error } = await fetchReceipt(token);
  if (error) return null;
  return parseReceipt(data);
}

/** Path of the public receipt page. */
export function receiptPath(token: string): string {
  return `/struk/${token}`;
}

/** Message shown to staff when a receipt link cannot be made (migration not applied yet, etc.). */
export function receiptLinkError(error: { code?: string } | null | undefined): string {
  if (error?.code === "42703" || error?.code === "PGRST204") return "Struk publik belum aktif di server.";
  return "Tautan struk belum bisa dibuat. Coba lagi sebentar.";
}
