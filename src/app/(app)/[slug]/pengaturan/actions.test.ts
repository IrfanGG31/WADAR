import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

const db = fakeSupabase((chain) => (chain.table === "kb_documents" && chain.calls.some(([m]) => m === "insert") ? { data: { id: "doc-1" }, error: null } : { data: null, error: null }));
vi.mock("@/db/shop", () => ({ getShop: async () => ({ id: "t1", is_demo: false }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));
vi.mock("@/ai", () => ({
  getAi: () => ({ run: async () => { throw new Error("GoogleGenerativeAI 403: API key AIzaSyFAKE-secret invalid for project 1234"); } }),
  getConsult: () => ({ clearCache: () => undefined }),
}));
vi.spyOn(console, "error").mockImplementation(() => undefined);

const { addFaq } = await import("./actions");

describe("addFaq", () => {
  it("never stores or shows the provider's raw error text", async () => {
    const r = await addFaq("toko", { question: "Bisa COD?", answer: "Bisa, area Jakarta." });
    const stored = db.chains
      .filter((c) => c.table === "kb_documents")
      .flatMap((c) => c.calls.filter(([m]) => m === "update").map(([, v]) => (v as { error?: string | null }).error ?? ""));
    expect(stored.join(" ")).not.toMatch(/AIza|403|GoogleGenerativeAI|project/);
    expect(JSON.stringify(r)).not.toMatch(/AIza|403/);
  });
});
