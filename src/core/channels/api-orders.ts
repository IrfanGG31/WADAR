import { z } from "zod";
import { CHANNEL_KINDS, type ChannelKind } from "../channel-settings";

/**
 * POST /api/v1/orders — orders from an outside app (marketplace sync tool, bot, n8n/Make…).
 * Items name a product by SKU (what outside systems know) or by WADAR variant id. Same booking
 * path as the file import: one order = one sale, deduped by `external_order_id`, canceled and
 * returned orders kept without moving stock, real fee or the channel's estimate.
 */
const rupiah = z.number().int().min(0).max(1_000_000_000_000);

export const ApiOrdersInput = z.object({
  channel: z.enum(CHANNEL_KINDS as [ChannelKind, ...ChannelKind[]]).default("manual"),
  source: z.string().trim().max(60).optional(),
  orders: z
    .array(
      z.object({
        external_order_id: z.string().trim().min(1).max(100),
        occurred_at: z.string().datetime({ offset: true }).nullish(),
        status: z.enum(["completed", "canceled", "returned"]).default("completed"),
        buyer_name: z.string().trim().max(120).nullish(),
        order_discount: rupiah.default(0),
        platform_fee: rupiah.nullish(),
        items: z
          .array(
            z
              .object({
                sku: z.string().trim().min(1).max(60).optional(),
                variant_id: z.string().uuid().optional(),
                qty: z.number().int().min(1).max(100_000),
                unit_price: rupiah.optional(),
                line_discount: rupiah.default(0),
              })
              .refine((i) => i.sku || i.variant_id, "Tiap barang perlu sku atau variant_id."),
          )
          .min(1)
          .max(200),
      }),
    )
    .min(1)
    .max(500),
});
export type ApiOrdersInput = z.infer<typeof ApiOrdersInput>;

/** SKU/variant → WADAR variant ids; orders with an unknown product are returned as errors, not sent. */
export function resolveApiOrders(input: ApiOrdersInput, variants: readonly { id: string; sku: string | null }[]) {
  const bySku = new Map(variants.filter((v) => v.sku).map((v) => [String(v.sku).trim().toLowerCase(), v.id]));
  const known = new Set(variants.map((v) => v.id));
  const ready = [];
  const errors: { order: string; error: string }[] = [];
  for (const o of input.orders) {
    const items = [];
    let missing: string | null = null;
    for (const i of o.items) {
      const id = i.variant_id && known.has(i.variant_id) ? i.variant_id : i.sku ? bySku.get(i.sku.toLowerCase()) : undefined;
      if (!id) {
        missing = i.sku ?? i.variant_id ?? "?";
        break;
      }
      items.push({ variant_id: id, qty: i.qty, unit_price: i.unit_price, line_discount: i.line_discount });
    }
    if (missing) {
      errors.push({ order: o.external_order_id, error: `Produk "${missing}" tidak ditemukan di WADAR.` });
      continue;
    }
    ready.push({
      external_order_id: o.external_order_id,
      occurred_at: o.occurred_at ?? null,
      status: o.status,
      buyer_name: o.buyer_name ?? null,
      order_discount: o.order_discount,
      platform_fee: o.platform_fee ?? null,
      items,
    });
  }
  return { ready, errors };
}
