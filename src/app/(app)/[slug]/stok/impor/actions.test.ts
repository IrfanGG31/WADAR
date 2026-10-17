import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

/** Stand-in for the shop's variants: import_catalog upserts by SKU (case-insensitive), like the SQL. */
let skus = new Set<string>();
let rpcError: { code: string; message: string } | null = null;
let db = fakeSupabase();

vi.mock("server-only", () => ({}));
vi.mock("@/db/shop", () => ({ getShop: async (slug: string) => ({ id: "t1", slug, name: "Glow", is_demo: false }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => db.client }));

const { importCatalog, previewCatalogImport } = await import("./actions");

const CSV = [
  "Nama Produk,Varian,SKU,Harga Jual,HPP,Stok Awal",
  "Serum Vit C,20 ml,SVC-20,89.000,35000,12",
  "Serum Vit C,Mini,SVC-M,25000,,3",
  "Toner,,TN-1,murah,0,0",
  "Lip Tint,,LT-1,45000,15000,0",
].join("\n");

beforeEach(() => {
  skus = new Set();
  rpcError = null;
  db = fakeSupabase(
    (chain) => ({ data: chain.table === "variants" ? [...skus].map((sku) => ({ sku })) : [], error: null }),
    (fn, args) => {
      if (rpcError) return { data: null, error: rpcError };
      if (fn !== "import_catalog") return { data: null, error: null };
      const rows = (args as { p_rows: { line: number; sku: string }[] }).p_rows;
      const results = rows.map((r) => {
        const known = skus.has(r.sku.toLowerCase());
        skus.add(r.sku.toLowerCase());
        return { line: r.line, sku: r.sku, action: known ? "updated" : "created" };
      });
      const count = (a: string) => results.filter((r) => r.action === a).length;
      return { data: { batch_id: "b1", created: count("created"), updated: count("updated"), results, errors: [] }, error: null };
    },
  );
});

describe("previewCatalogImport", () => {
  it("shows valid rows as create/update against the shop's SKUs and lists bad rows per line", async () => {
    skus.add("svc-20");
    const r = await previewCatalogImport("glow", CSV);
    if ("error" in r) throw new Error(r.error);
    expect(r.rows.map((p) => [p.sku, p.action])).toEqual([
      ["SVC-20", "update"],
      ["SVC-M", "create"],
      ["LT-1", "create"],
    ]);
    expect(r.counts).toEqual({ create: 2, update: 1 });
    expect(r.errors).toEqual([{ line: 4, sku: "TN-1", message: "Harga jual harus angka rupiah bulat (contoh 89000)." }]);
    expect(r.columns).toEqual(["name", "option_label", "sku", "price", "cost", "initial_qty"]);
    // read only this shop's variants; nothing written
    expect(db.chains.find((c) => c.table === "variants")?.calls).toContainEqual(["eq", "tenant_id", "t1"]);
    expect(db.rpcs).toEqual([]);
  });

  it("an unknown header is rejected with the header list so the user can map it", async () => {
    const r = await previewCatalogImport("glow", "nama,sku,harga,hpp,Harga Coret\nKopi,K-1,18000,6000,20000\n");
    expect(r).toMatchObject({ error: expect.stringMatching(/Harga Coret/), unknown: ["Harga Coret"] });
    const mapped = await previewCatalogImport("glow", "nama,sku,harga,hpp,Harga Coret\nKopi,K-1,18000,6000,20000\n", { "Harga Coret": "ignore" });
    expect(mapped).toMatchObject({ counts: { create: 1, update: 0 } });
  });
});

describe("importCatalog", () => {
  it("imports the valid rows, reports the bad ones by line without stopping the rest", async () => {
    const r = await importCatalog("glow", "katalog.csv", CSV);
    if ("error" in r) throw new Error(r.error);
    expect(r).toMatchObject({ created: 3, updated: 0 });
    expect(r.errors).toEqual([{ line: 4, sku: "TN-1", message: "Harga jual harus angka rupiah bulat (contoh 89000)." }]);
    expect(db.rpcs).toHaveLength(1);
    const args = db.rpcs[0].args as { p_tenant_id: string; p_file_name: string; p_rows: { sku: string; price: number; cost: number | null }[]; p_rejected: unknown[] };
    expect(args.p_tenant_id).toBe("t1");
    expect(args.p_file_name).toBe("katalog.csv");
    expect(args.p_rows.map((x) => [x.sku, x.price, x.cost])).toEqual([
      ["SVC-20", 89000, 35000],
      ["SVC-M", 25000, null],
      ["LT-1", 45000, 15000],
    ]);
    expect(args.p_rejected).toHaveLength(1);
  });

  it("importing the same file again updates the same SKUs instead of duplicating", async () => {
    await importCatalog("glow", "katalog.csv", CSV);
    const again = await importCatalog("glow", "katalog.csv", CSV.replace("89.000", "95.000"));
    if ("error" in again) throw new Error(again.error);
    expect(again).toMatchObject({ created: 0, updated: 3 });
    expect(skus.size).toBe(3);
  });

  it("errors from the database are merged in line order", async () => {
    db = fakeSupabase(
      () => ({ data: [], error: null }),
      () => ({ data: { batch_id: "b1", created: 2, updated: 0, results: [], errors: [{ line: 2, sku: "SVC-20", message: "SKU sudah dipakai varian lain." }] }, error: null }),
    );
    const r = await importCatalog("glow", "katalog.csv", CSV);
    if ("error" in r) throw new Error(r.error);
    expect(r.errors.map((e) => e.line)).toEqual([2, 4]);
  });

  it("an unknown header stops the import before anything is written", async () => {
    const r = await importCatalog("glow", "x.csv", "nama,sku,harga,hpp,warna\nKopi,K-1,18000,6000,merah\n");
    expect(r).toMatchObject({ error: expect.stringMatching(/warna/) });
    expect(db.rpcs).toEqual([]);
  });

  it("a file with no valid row writes nothing", async () => {
    const r = await importCatalog("glow", "x.csv", "nama,sku,harga,hpp\nKopi,,18000,6000\n");
    if ("error" in r) throw new Error(r.error);
    expect(r).toMatchObject({ created: 0, updated: 0 });
    expect(r.errors).toHaveLength(1);
    expect(db.rpcs).toEqual([]);
  });

  it("missing migration or a failed call gives a plain message; oversized files are refused", async () => {
    rpcError = { code: "PGRST202", message: "Could not find the function public.import_catalog" };
    expect(await importCatalog("glow", "katalog.csv", CSV)).toMatchObject({ error: expect.stringMatching(/belum/) });
    expect(await importCatalog("glow", "big.csv", "x".repeat(2_000_001))).toMatchObject({ error: expect.stringMatching(/terlalu besar/) });
  });
});
