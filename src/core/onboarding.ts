/**
 * ONB-2: "Siapkan tokomu" — the steps that make the numbers and the chat assistant right, in the order
 * an owner should do them. Each step is derived from real data, so it ticks itself off; the
 * owner can hide the list anytime (`tenants.onboarding_done_at`).
 */
export interface SetupFacts {
  products: number;
  /** Active marketplace channels still on WADAR's estimated commission. */
  channelsOnDefaultFee: number;
  /** Filled store-policy fields (jam buka, alamat, ongkir, retur, …). */
  policyFacts: number;
  faqs: number;
  sales: number;
  expenses: number;
}

export interface SetupStep {
  key: "produk" | "kanal" | "kebijakan" | "faq" | "jual" | "biaya";
  title: string;
  hint: string;
  /** Page under /<slug>/ that does the step. */
  page: string;
  done: boolean;
}

/** Fields of the store profile that count as "kebijakan diisi". */
export const MIN_POLICY_FACTS = 3;

export function setupSteps(f: SetupFacts): SetupStep[] {
  return [
    { key: "produk", title: "Tambah produk", hint: "Satu per satu, atau impor dari Excel/CSV sekaligus.", page: "stok", done: f.products > 0 },
    {
      key: "kanal",
      title: "Cek komisi kanal jualan",
      hint: "Shopee, TikTok, GoFood… supaya untung per kanal akurat.",
      page: "pengaturan/kanal",
      done: f.channelsOnDefaultFee === 0,
    },
    {
      key: "kebijakan",
      title: "Isi info toko",
      hint: "Jam buka, alamat, ongkir, retur — dipakai asisten chat menjawab pembeli.",
      page: "pengaturan",
      done: f.policyFacts >= MIN_POLICY_FACTS,
    },
    { key: "faq", title: "Tambah 1 FAQ", hint: "Pertanyaan yang paling sering ditanya pembeli.", page: "pengaturan", done: f.faqs > 0 },
    { key: "jual", title: "Catat penjualan pertama", hint: "Lewat Kasir — stok dan pembukuan jalan sendiri.", page: "kasir", done: f.sales > 0 },
    { key: "biaya", title: "Catat 1 pengeluaran", hint: "Sewa, gaji, iklan — supaya untung bersih benar.", page: "keuangan/pengeluaran", done: f.expenses > 0 },
  ];
}

export function setupProgress(steps: readonly SetupStep[]): { done: number; total: number; complete: boolean } {
  const done = steps.filter((s) => s.done).length;
  return { done, total: steps.length, complete: done === steps.length };
}
