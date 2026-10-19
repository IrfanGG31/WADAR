import { describe, expect, it } from "vitest";
import { DEFAULT_AGENT_SETTINGS, planAgentTasks, staleTaskKeys, supplierMessage } from "./agent";
import type { ForecastRow } from "./stock-insight";

function row(over: Partial<ForecastRow>): ForecastRow {
  return {
    variant_id: "v1", product_id: "p1", product_name: "Serum", option_label: null, title: "Serum", category: null, unit: "pcs",
    on_hand: 3, min_stock: 10, lead_time_days: 4, pack_size: 1, cost_is_set: true, rate: 2, safety_stock: 2, rop: 10,
    days_left: 1.5, stockout_in_days: 1, status: "kritis", reorder_qty: 40, slow_moving: false, idle_capital: 0,
    narrative: "Serum habis ±1 hari lagi.", ...over,
  };
}

describe("planAgentTasks (Autopilot)", () => {
  it("drafts reorders for items that need restock, most urgent first", () => {
    const tasks = planAgentTasks(DEFAULT_AGENT_SETTINGS, {
      forecasts: [row({ variant_id: "v2", title: "Toner", status: "menipis", reorder_qty: 12, stockout_in_days: 8 }), row({}), row({ variant_id: "v3", status: "aman" })],
      unanswered: [],
    });
    expect(tasks.map((t) => t.dedupe_key)).toEqual(["reorder:v1", "reorder:v2"]);
    expect(tasks[0]).toMatchObject({ title: "Pesan ulang Serum", payload: { qty: 40, unit: "pcs" } });
  });

  it("drafts one FAQ per distinct unanswered question, only for no-data causes", () => {
    const tasks = planAgentTasks(DEFAULT_AGENT_SETTINGS, {
      forecasts: [],
      unanswered: [
        { conversation_id: "c1", question: "Bisa COD ke Bekasi?", cause: "not_in_store_data" },
        { conversation_id: "c2", question: "bisa cod ke  bekasi?", cause: "low_confidence" },
        { conversation_id: "c3", question: "Saya mau komplain!", cause: "complaint" },
      ],
    });
    expect(tasks.map((t) => t.dedupe_key)).toEqual(["faq:c1"]);
  });

  it("respects the switches", () => {
    const data = { forecasts: [row({})], unanswered: [{ conversation_id: "c1", question: "Ada garansi?", cause: "not_in_store_data" }] };
    expect(planAgentTasks({ ...DEFAULT_AGENT_SETTINGS, enabled: false }, data)).toEqual([]);
    expect(planAgentTasks({ ...DEFAULT_AGENT_SETTINGS, auto_reorder: false }, data).map((t) => t.kind)).toEqual(["faq"]);
  });

  it("closes tasks whose reason is gone, per kind", () => {
    const open = [
      { dedupe_key: "reorder:v1", kind: "reorder" as const },
      { dedupe_key: "reorder:v9", kind: "reorder" as const },
      { dedupe_key: "faq:c1", kind: "faq" as const },
    ];
    const planned = planAgentTasks(DEFAULT_AGENT_SETTINGS, { forecasts: [row({})], unanswered: [] });
    expect(staleTaskKeys(open, planned, ["reorder"])).toEqual(["reorder:v9"]);
  });

  it("writes one supplier message for several items", () => {
    expect(supplierMessage("Glow by Sari", [{ item: "Serum", qty: 40, unit: "pcs" }, { item: "Toner", qty: 1200, unit: "pcs" }])).toBe(
      "Halo, saya dari Glow by Sari. Mau pesan ulang:\n- Serum: 40 pcs\n- Toner: 1.200 pcs\n\nMohon info total dan estimasi kirimnya. Terima kasih.",
    );
  });
});
