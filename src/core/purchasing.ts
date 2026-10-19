import { z } from "zod";
import { formatRupiah } from "./money";
import { formatCount } from "./number-format";
import { normalizePhone } from "./phone";

/**
 * Pembelian (ADR-005): the pure side of purchase orders. Totals are integer rupiah summed with
 * BigInt; Autopilot's drafts come from rules (each product goes to the supplier it was last bought
 * from), never from an LLM. The database repeats every money and permission rule (migration
 * purchasing), so this module decides what to show and what to ask, not what is allowed.
 */
export type PurchaseStatus = "draft" | "ordered" | "partial" | "received" | "canceled";

export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  draft: "Draf",
  ordered: "Dipesan",
  partial: "Datang sebagian",
  received: "Diterima",
  canceled: "Batal",
};

/** Orders that still count as "on the way" for restocking. */
export const OPEN_PURCHASE_STATUSES: readonly PurchaseStatus[] = ["draft", "ordered", "partial"];

export interface PurchaseLine {
  variant_id: string;
  qty: number;
  unit_cost: number;
}

/** Σ qty × unit cost in integer rupiah. */
export function sumLines(lines: readonly Pick<PurchaseLine, "qty" | "unit_cost">[]): number {
  let total = 0n;
  for (const l of lines) total += BigInt(l.qty) * BigInt(l.unit_cost);
  return Number(total);
}

export interface PurchaseMoney {
  status: PurchaseStatus;
  total: number;
  received_total: number;
  paid_total: number;
}

/**
 * Tagihan: what the supplier can ask for — the goods that came, or the whole order when paying
 * ahead (UMKM often transfer first). A draft or canceled order owes nothing.
 */
export function billAmount(po: Pick<PurchaseMoney, "status" | "total" | "received_total">): number {
  if (po.status === "partial" || po.status === "received") return po.received_total;
  if (po.status === "ordered") return po.total;
  return 0;
}

export function outstandingAmount(po: PurchaseMoney): number {
  return Math.max(billAmount(po) - po.paid_total, 0);
}

/** Paid more than the goods received so far: a balance the shop has with the supplier. */
export function overpaidAmount(po: PurchaseMoney): number {
  return po.status === "ordered" ? 0 : Math.max(po.paid_total - billAmount(po), 0);
}

// ── Inputs (server actions) ─────────────────────────────────────────────────
const uuid = z.string().uuid("Barang tidak dikenal.");
const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,80}$/);

export const PurchaseLineInput = z.object({
  variant_id: uuid,
  qty: z.number().int().min(1, "Jumlah minimal 1.").max(1_000_000, "Jumlah terlalu besar."),
  unit_cost: z.number().int().min(0, "Harga modal tidak boleh minus.").max(1_000_000_000, "Harga modal terlalu besar."),
});

export const PurchaseOrderInput = z.object({
  supplier_id: z.string().uuid().nullable(),
  lines: z.array(PurchaseLineInput).min(1, "Tambahkan minimal satu barang.").max(100, "Maksimal 100 barang per pesanan."),
  note: z.string().trim().max(300, "Catatan maksimal 300 huruf.").default(""),
});
export type PurchaseOrderInput = z.infer<typeof PurchaseOrderInput>;

export const ReceiveInput = z.object({
  lines: z
    .array(
      z.object({
        variant_id: uuid,
        qty: z.number().int().min(0, "Jumlah tidak boleh minus.").max(1_000_000),
        unit_cost: z.number().int().min(0, "Harga modal tidak boleh minus.").max(1_000_000_000),
      }),
    )
    .min(1)
    .refine((lines) => lines.some((l) => l.qty > 0), "Isi jumlah barang yang datang."),
  idempotency_key: idempotencyKey,
});

export const PAYMENT_METHODS = ["transfer", "tunai", "qris", "lainnya"] as const;

export const PaymentInput = z.object({
  amount: z.number().int().min(1, "Nominal bayar harus lebih dari 0.").max(1_000_000_000_000),
  method: z.enum(PAYMENT_METHODS).default("transfer"),
  idempotency_key: idempotencyKey,
});

export const SupplierInput = z.object({
  name: z.string().trim().min(1, "Nama pemasok wajib diisi.").max(80, "Nama maksimal 80 huruf."),
  phone: z
    .string()
    .trim()
    .max(30)
    .default("")
    .transform((v, ctx) => {
      if (!v) return null;
      const e164 = normalizePhone(v);
      if (!e164) ctx.addIssue({ code: "custom", message: "Nomor WhatsApp pemasok belum benar. Contoh: 0812-3456-7890." });
      return e164;
    }),
  note: z.string().trim().max(300, "Catatan maksimal 300 huruf.").default(""),
});

// ── Autopilot drafts ────────────────────────────────────────────────────────
export interface ReorderNeed {
  variant_id: string;
  title: string;
  unit: string;
  qty: number;
  /** Current average cost (integer rupiah); 0 when unknown. */
  avg_cost: number;
}

export interface SupplierChoice {
  supplier_id: string;
  last_unit_cost: number;
}

export interface PurchaseDraftPlan {
  supplier_id: string | null;
  lines: PurchaseLine[];
  items: { title: string; qty: number; unit: string }[];
  total: number;
}

/**
 * Reorder needs → one draft order per supplier. Each product goes to the supplier it was last bought
 * from at that supplier's last price; products never bought from anyone go into one draft without a
 * supplier (the owner picks one), priced at the current average cost.
 */
export function planPurchaseDrafts(needs: readonly ReorderNeed[], supplierOf: (variantId: string) => SupplierChoice | undefined): PurchaseDraftPlan[] {
  const groups = new Map<string, PurchaseDraftPlan>();
  for (const n of needs) {
    if (n.qty <= 0) continue;
    const choice = supplierOf(n.variant_id);
    const key = choice?.supplier_id ?? "";
    let plan = groups.get(key);
    if (!plan) {
      plan = { supplier_id: choice?.supplier_id ?? null, lines: [], items: [], total: 0 };
      groups.set(key, plan);
    }
    const unitCost = choice ? choice.last_unit_cost : Math.max(n.avg_cost, 0);
    plan.lines.push({ variant_id: n.variant_id, qty: n.qty, unit_cost: unitCost });
    plan.items.push({ title: n.title, qty: n.qty, unit: n.unit });
  }
  const plans = [...groups.values()];
  for (const p of plans) p.total = sumLines(p.lines);
  // Known suppliers first, then by value: the owner sees the drafts they can approve at once on top.
  return plans.sort((a, b) => Number(a.supplier_id === null) - Number(b.supplier_id === null) || b.total - a.total);
}

/** Autopilot may approve a draft by itself only with a supplier and within the owner's limit (0 = never). Same rule as SQL. */
export function canAutoApprove(plan: { supplier_id: string | null; total: number }, limit: number): boolean {
  return plan.supplier_id !== null && limit > 0 && plan.total <= limit;
}

/** The order as a WhatsApp message to the supplier. */
export function purchaseOrderMessage(
  shopName: string,
  number: string,
  items: readonly { title: string; qty: number; unit: string; unit_cost: number }[],
  note?: string | null,
): string {
  const lines = items.map((i) => `- ${i.title}: ${formatCount(i.qty)} ${i.unit} × ${formatRupiah(i.unit_cost)}`);
  const total = sumLines(items.map((i) => ({ qty: i.qty, unit_cost: i.unit_cost })));
  return [
    `Halo, saya dari ${shopName}. Pesanan ${number}:`,
    ...lines,
    `Total ${formatRupiah(total)}`,
    ...(note?.trim() ? ["", `Catatan: ${note.trim()}`] : []),
    "",
    "Mohon konfirmasi stok dan estimasi kirimnya. Terima kasih.",
  ].join("\n");
}

/** wa.me link that opens WhatsApp with the text (to the supplier's number when known). */
export function whatsappLink(phoneE164: string | null | undefined, text: string): string {
  const to = phoneE164 ? phoneE164.replace(/^\+/, "") : "";
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}
