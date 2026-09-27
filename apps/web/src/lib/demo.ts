import type { WalletView } from "@wadar/contracts/finance";
import { apiFetch, ApiError } from "./api-client";
import { createClient } from "./supabase/client";
import { clearActiveTenantId, setActiveOutletId, setActiveTenantId } from "./tenant-cookie";

/**
 * "Coba demo": a throwaway Supabase anonymous user gets its own sample shop,
 * built through the same public API a real owner uses (validation,
 * permissions, Idempotency-Key, events → stock, ledger, Beranda). Nothing is
 * faked in the UI — every number on screen comes from real transactions,
 * isolated per demo visitor by the normal tenant RLS.
 */

export class DemoError extends Error {}

interface DemoProduct {
  key: string;
  name: string;
  category: string;
  price: number;
  /** Left out on purpose for one product so the "belum ada modal (HPP)" nudge shows up. */
  cost?: number;
  stock: number;
}

const DEMO_PRODUCTS: DemoProduct[] = [
  { key: "kopi", name: "Kopi Susu Gula Aren", category: "Minuman", price: 18_000, cost: 7_000, stock: 40 },
  { key: "teh", name: "Es Teh Manis", category: "Minuman", price: 5_000, cost: 1_500, stock: 60 },
  { key: "roti", name: "Roti Bakar Cokelat Keju", category: "Makanan", price: 15_000, cost: 6_000, stock: 25 },
  // Low on stock: after today's sales the Beranda feed warns it will run out.
  { key: "keripik", name: "Keripik Singkong Pedas", category: "Camilan", price: 12_000, cost: 6_500, stock: 4 },
  { key: "air", name: "Air Mineral 600 ml", category: "Minuman", price: 4_000, stock: 48 },
];

type Line = [key: string, qty: number];
type DemoPayment = { method: "cash"; tendered: number } | { method: "transfer" };

const DEMO_SALES: Array<{ lines: Line[]; payment: DemoPayment; channel?: "pos" | "whatsapp" }> = [
  { lines: [["kopi", 2], ["roti", 1]], payment: { method: "cash", tendered: 60_000 } },
  { lines: [["teh", 3], ["keripik", 1]], payment: { method: "cash", tendered: 30_000 } },
  { lines: [["kopi", 1], ["air", 2]], payment: { method: "transfer" } },
  { lines: [["roti", 2], ["kopi", 2]], payment: { method: "transfer" }, channel: "whatsapp" },
  { lines: [["keripik", 2], ["teh", 1]], payment: { method: "cash", tendered: 30_000 } },
];

export type DemoStep = "masuk" | "toko" | "produk" | "penjualan" | "pengeluaran";

export const DEMO_STEP_LABEL: Record<DemoStep, string> = {
  masuk: "Menyiapkan akun demo…",
  toko: "Membuat toko contoh…",
  produk: "Menambah produk contoh…",
  penjualan: "Mencatat penjualan hari ini…",
  pengeluaran: "Mencatat pengeluaran…",
};

export async function startDemoShop(onStep: (step: DemoStep) => void): Promise<void> {
  onStep("masuk");
  const supabase = createClient();
  const { error: signInError } = await supabase.auth.signInAnonymously();
  if (signInError) {
    throw new DemoError(
      signInError.message.toLowerCase().includes("anonymous")
        ? "Mode demo belum diaktifkan oleh admin. Coba lagi nanti."
        : "Akun demo belum bisa dibuat. Coba lagi beberapa saat lagi.",
    );
  }

  try {
    onStep("toko");
    const shop = await apiFetch<{ tenantId: string; outletId: string }>("/v1/tenants", {
      method: "POST",
      body: { tenantName: "Kedai Contoh (Demo)", outletName: "Outlet Utama", timezone: "Asia/Jakarta" },
      skipTenant: true,
      idempotencyKey: crypto.randomUUID(),
    });
    setActiveTenantId(shop.tenantId);
    setActiveOutletId(shop.outletId);

    onStep("produk");
    const variantByKey = new Map<string, string>();
    await Promise.all(
      DEMO_PRODUCTS.map(async (product) => {
        const created = await apiFetch<{ variantIds: string[] }>("/v1/products", {
          method: "POST",
          body: {
            name: product.name,
            category: product.category,
            outletId: shop.outletId,
            variants: [{ price: product.price, cost: product.cost, initialStock: product.stock }],
          },
          idempotencyKey: crypto.randomUUID(),
        });
        variantByKey.set(product.key, created.variantIds[0]!);
      }),
    );

    onStep("penjualan");
    // Sequential: each sale takes the next daily order number.
    for (const sale of DEMO_SALES) {
      await apiFetch("/v1/orders", {
        method: "POST",
        body: {
          outletId: shop.outletId,
          channel: sale.channel ?? "pos",
          lines: sale.lines.map(([key, qty]) => ({ variantId: variantByKey.get(key)!, qty })),
          payment: sale.payment,
        },
        idempotencyKey: crypto.randomUUID(),
      });
    }

    onStep("pengeluaran");
    const wallets = await apiFetch<WalletView[]>("/v1/finance/wallets");
    const cashWallet = wallets.find((w) => w.defaultFor === "cash") ?? wallets[0];
    if (cashWallet) {
      await apiFetch("/v1/finance/expenses", {
        method: "POST",
        body: { amount: 35_000, category: "exp_supplies", walletId: cashWallet.id, note: "Beli gula aren & susu" },
        idempotencyKey: crypto.randomUUID(),
      });
    }
  } catch (error) {
    // Start the next attempt clean: otherwise the half-built demo session
    // stays signed in and /masuk would bounce straight into an empty shop.
    await supabase.auth.signOut().catch(() => undefined);
    clearActiveTenantId();
    const clientError = error instanceof ApiError && error.problem.status < 500;
    throw new DemoError(
      clientError
        ? `Toko demo gagal disiapkan: ${error.problem.detail ?? error.problem.title}`
        : "Toko demo gagal disiapkan — server sedang sibuk atau koneksi terputus. Coba lagi sebentar lagi.",
    );
  }
}
