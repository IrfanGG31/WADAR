import { describe, expect, it } from "vitest";
import { checkGrounding, collectEvidence } from "./grounding";
import { makeData } from "./fixture";
import { answerOffline, detectRemember } from "./question";

/**
 * D7 DoD: 10 demo questions answered offline (no Gemini key) with exact
 * numbers from the fixture shop in ./fixture.ts. Each answer must also pass
 * the grounding check against its own tool results.
 */
const data = makeData();

const CASES: Array<{ q: string; tools: string[]; contains: string[] }> = [
  {
    q: "Berapa penjualan hari ini?",
    tools: ["get_business_snapshot"],
    contains: ["Penjualan hari ini Rp120.000 (2 pcs), untung kotor Rp70.000.", "7 hari terakhir: penjualan Rp2.027.800, naik Rp292.800 (16,9%)", "untung bersih Rp647.560"],
  },
  {
    q: "Berapa untung minggu ini?",
    tools: ["get_profit_breakdown"],
    contains: ["Untung kotor 7 hari terakhir Rp897.560 (margin 44,3%)", "untung bersih Rp647.560 setelah pengeluaran Rp250.000"],
  },
  {
    q: "Kenapa untungku turun minggu ini?",
    tools: ["explain_profit_change"],
    contains: ["turun Rp77.340 (10,7%)", "dari Rp724.900 jadi Rp647.560"],
  },
  {
    q: "Produk apa yang paling laku bulan ini?",
    tools: ["get_sales_summary"],
    contains: ["Penjualan bulan ini Rp3.882.800", "Serum Vit C Rp2.954.800 (35 pcs)", "Toner Rp688.000 (9 pcs)", "Hair Mist Rp240.000 (4 pcs)"],
  },
  {
    q: "Kanal mana yang margin-nya paling tipis?",
    tools: ["get_profit_breakdown", "get_business_snapshot"],
    contains: ["Toko Offline (POS) Rp638.000 (margin 57%)", "TikTok Shop Rp259.560 (margin 28,6%)", "Margin paling tipis: TikTok Shop."],
  },
  {
    q: "Stok apa yang harus segera dipesan?",
    tools: ["get_reorder_suggestions"],
    contains: ["1 produk perlu dipesan ulang. Serum Vit C: pesan 40 pcs, habis ±3 hari lagi."],
  },
  {
    q: "Barang apa yang lambat laku dan berapa modal tertahan?",
    tools: ["get_slow_movers"],
    contains: ["1 barang lambat laku menahan modal Rp1.200.000. Terbesar: Hair Mist (Rp1.200.000)."],
  },
  {
    q: "Siapa pelanggan terbaik dan siapa yang lama tidak beli?",
    tools: ["get_customer_stats"],
    contains: ["1 pelanggan baru, 1 kembali beli", "Sari Dewi Rp3.000.000; Tono Rp2.000.000; Budi Rp1.500.000", "Tono (76 hari)"],
  },
  {
    q: "Ada peringatan margin apa?",
    tools: ["get_profit_breakdown", "get_business_snapshot"],
    contains: ["Komisi TikTok Shop 21,2% dari penjualan (Rp192.240 dari Rp907.800), di atas batas 20%."],
  },
];

describe("10 pertanyaan demo (offline, angka harus tepat)", () => {
  it.each(CASES)("$q", ({ q, tools, contains }) => {
    const { text, runs } = answerOffline(q, data);
    expect(runs.map((r) => r.name)).toEqual(tools);
    for (const c of contains) expect(text).toContain(c);
    expect(checkGrounding(text, collectEvidence(runs.map((r) => r.result))).ok).toBe(true);
  });

  it("10. “Ingat ya, jangan pernah diskon di atas 15%” → proposes a memory, no tools, no LLM", () => {
    expect(detectRemember("Ingat ya, jangan pernah diskon di atas 15%")).toEqual({
      kind: "preference",
      content: "jangan pernah diskon di atas 15%",
    });
  });
});
