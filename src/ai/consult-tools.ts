import { z } from "zod";
import { PERIOD_NAMES, type ToolName } from "@/core/consult/tools";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const period = z.union([z.enum(PERIOD_NAMES), z.object({ from: isoDay, to: isoDay })]);

/** Input schemas of the Konsultasi tools (descriptions are for the model; src/core/consult/tools.ts does the work). */
export const TOOL_DEFS: Record<ToolName, { description: string; input: z.ZodType }> = {
  get_business_snapshot: {
    description: "Ringkasan toko: penjualan/untung hari ini dan 7 hari terakhir (+selisih), stok kritis, peringatan margin, chat menunggu.",
    input: z.object({}),
  },
  get_sales_summary: {
    description: "Penjualan per hari/produk/kanal/kategori untuk satu periode, lengkap dengan selisih vs periode sebelumnya.",
    input: z.object({ period: period.optional(), group_by: z.enum(["day", "product", "channel", "category"]).optional() }),
  },
  get_profit_breakdown: {
    description: "Penjualan (R), modal (C), komisi (F), subsidi ongkir (S), untung kotor (GP) dan margin per produk atau kanal; plus untung bersih.",
    input: z.object({ period: period.optional(), by: z.enum(["product", "channel"]).optional() }),
  },
  explain_profit_change: {
    description: "Menjelaskan kenapa untung bersih berubah dari period_a (lebih awal) ke period_b: efek terurut dan penyumbang terbesar.",
    input: z.object({ period_a: period.optional(), period_b: period.optional() }),
  },
  get_stock_status: {
    description: "Status & prediksi stok per produk (habis/kritis/menipis/aman), bisa difilter.",
    input: z.object({ status: z.enum(["semua", "habis", "kritis", "menipis", "aman"]).optional(), query: z.string().max(60).optional(), category: z.string().max(60).optional() }),
  },
  get_reorder_suggestions: { description: "Produk yang perlu dipesan ulang beserta jumlah yang disarankan.", input: z.object({}) },
  get_slow_movers: { description: "Barang lambat laku dan modal yang tertahan.", input: z.object({}) },
  get_customer_stats: {
    description: "Pelanggan baru/kembali, pelanggan terbaik, dan pelanggan top yang lama belum beli.",
    input: z.object({ period: period.optional(), idle_days: z.number().int().min(1).max(365).optional() }),
  },
  list_insights: { description: "Insight aktif untuk toko ini.", input: z.object({ status: z.enum(["active", "new", "seen", "acted", "dismissed"]).optional() }) },
  get_preferences: { description: "Preferensi dan catatan yang pernah diminta pemilik untuk diingat.", input: z.object({}) },
};
