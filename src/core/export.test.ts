import { describe, expect, it } from "vitest";
import { buildExportEntries, crc32, csvCell, exportFileName, toCsv, zipStore, type ExportData } from "./export";

describe("toCsv (RFC 4180)", () => {
  it("plain cells stay plain; rows end with CRLF", () => {
    expect(toCsv(["nama", "harga"], [["Serum", 89000]])).toBe("nama,harga\r\nSerum,89000\r\n");
  });

  it("quotes cells with comma, quote, newline or CR; doubles inner quotes", () => {
    expect(csvCell("Rp1.000, murah")).toBe('"Rp1.000, murah"');
    expect(csvCell('Serum "Glow" 20ml')).toBe('"Serum ""Glow"" 20ml"');
    expect(csvCell("baris 1\nbaris 2")).toBe('"baris 1\nbaris 2"');
    expect(csvCell("a\rb")).toBe('"a\rb"');
    expect(toCsv(["catatan"], [['kata "promo", lalu\nbaru']])).toBe('catatan\r\n"kata ""promo"", lalu\nbaru"\r\n');
  });

  it("null/undefined → empty; booleans → ya/tidak; numbers as is (negative too)", () => {
    expect(toCsv(["a", "b", "c", "d", "e"], [[null, undefined, true, false, -5000]])).toBe("a,b,c,d,e\r\n,,ya,tidak,-5000\r\n");
  });

  it("neutralises spreadsheet formulas in text cells (CSV injection)", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+62812")).toBe("'+62812");
    expect(csvCell("-diskon")).toBe("'-diskon");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell(-12)).toBe("-12");
  });
});

describe("zipStore", () => {
  it("crc32 matches the reference value", () => {
    expect(crc32(new TextEncoder().encode("hello"))).toBe(0x3610a686);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("writes a valid stored ZIP: local headers, central directory, end record", () => {
    const zip = zipStore([
      { name: "produk.csv", data: new TextEncoder().encode("a,b\r\n") },
      { name: "pelanggan.csv", data: new TextEncoder().encode("hello") },
    ]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const eocd = zip.byteLength - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2); // entries
    const cdOffset = view.getUint32(eocd + 16, true);
    expect(view.getUint32(cdOffset, true)).toBe(0x02014b50);
    // second entry's CRC in the central directory
    const secondCd = cdOffset + 46 + "produk.csv".length;
    expect(view.getUint32(secondCd + 16, true)).toBe(0x3610a686);
    expect(new TextDecoder().decode(zip)).toContain("pelanggan.csv");
  });
});

describe("buildExportEntries (GAP #6: semua data toko)", () => {
  const data: ExportData = {
    channels: [{ id: "ch-1", name: "Shopee" }],
    products: [{ id: "p1", name: "Serum Vit C", category: "Serum", unit: "pcs", is_active: true, deleted_at: null, created_at: "2026-10-01T01:00:00Z" }],
    variants: [
      { id: "v1", product_id: "p1", sku: "SVC-20", barcode: null, option_label: "20ml", price: 89000, avg_cost: 38000, on_hand: 7, min_stock: 5, created_at: "2026-10-01T01:00:00Z" },
    ],
    sales: [
      {
        id: "s1", occurred_at: "2026-10-02T03:00:00Z", channel_id: "ch-1", status: "completed", customer_id: "cu1",
        subtotal: 178000, order_discount: 10000, shipping_subsidy: 0, platform_fee: 21410, total: 168000, payment_method: "transfer", note: null,
      },
    ],
    sale_items: [
      { sale_id: "s1", variant_id: "v1", name_snapshot: "Serum Vit C 20ml", qty: 2, unit_price: 89000, line_discount: 0, unit_cost_snapshot: 38000 },
    ],
    expenses: [{ id: "e1", occurred_at: "2026-10-03", category: "Iklan", amount: 50000, note: "=boost" }],
    customers: [
      { id: "cu1", name: "Rina", phone_e164: "+6281234567890", first_channel: "shopee", notes: null, tags: ["vip", "jakarta"], total_spent: 168000, orders_count: 1, last_order_at: "2026-10-02T03:00:00Z" },
    ],
    conversations: [
      { id: "c1", channel: "widget", external_user_id: "AAAA", mode: "human", status: "escalated", escalation_reason: "human_requested", created_at: "2026-10-04T01:00:00Z", last_message_at: "2026-10-04T01:01:00Z" },
    ],
    messages: [
      { id: "m1", conversation_id: "c1", created_at: "2026-10-04T01:00:00Z", direction: "in", author: "customer", content: "Bisa bicara admin?" },
      { id: "m2", conversation_id: "c1", created_at: "2026-10-04T01:01:00Z", direction: "out", author: "system", content: "Sebentar ya, admin akan membalas." },
    ],
  };
  const files = buildExportEntries(data);
  const text = (name: string) => new TextDecoder().decode(files.find((f) => f.name === name)?.data);
  const lines = (name: string) => text(name).trimEnd().split("\r\n");

  it("one CSV per table, in a fixed order", () => {
    expect(files.map((f) => f.name)).toEqual([
      "produk.csv", "varian.csv", "penjualan.csv", "item_penjualan.csv", "pengeluaran.csv", "pelanggan.csv", "percakapan.csv", "pesan.csv",
    ]);
  });

  it("header + one line per row; money stays whole rupiah", () => {
    expect(lines("produk.csv")).toEqual(["id,nama,kategori,satuan,aktif,dihapus_pada,dibuat_pada", "p1,Serum Vit C,Serum,pcs,ya,,2026-10-01T01:00:00Z"]);
    expect(lines("varian.csv")[1]).toBe("v1,p1,SVC-20,,20ml,89000,38000,7,5,2026-10-01T01:00:00Z");
    expect(lines("item_penjualan.csv")[1]).toBe("s1,v1,Serum Vit C 20ml,2,89000,0,38000");
  });

  it("sales carry the channel name, not only its id", () => {
    expect(lines("penjualan.csv")).toEqual([
      "id,waktu,kanal,status,pelanggan_id,subtotal,diskon_order,subsidi_ongkir,biaya_platform,total,metode_bayar,catatan",
      "s1,2026-10-02T03:00:00Z,Shopee,completed,cu1,178000,10000,0,21410,168000,transfer,",
    ]);
  });

  it("customers: tags joined, phone kept as text (not a formula)", () => {
    expect(lines("pelanggan.csv")[1]).toBe("cu1,Rina,'+6281234567890,shopee,,vip; jakarta,168000,1,2026-10-02T03:00:00Z");
    expect(lines("pengeluaran.csv")[1]).toBe("e1,2026-10-03,Iklan,50000,'=boost");
  });

  it("chat: conversations and every message", () => {
    expect(lines("percakapan.csv")[1]).toBe("c1,widget,AAAA,human,escalated,human_requested,2026-10-04T01:00:00Z,2026-10-04T01:01:00Z");
    expect(lines("pesan.csv")).toHaveLength(3);
    expect(lines("pesan.csv")[1]).toBe("m1,c1,2026-10-04T01:00:00Z,in,customer,Bisa bicara admin?");
  });

  it("an empty shop still gets every file with its header", () => {
    const empty = buildExportEntries({ channels: [], products: [], variants: [], sales: [], sale_items: [], expenses: [], customers: [], conversations: [], messages: [] });
    expect(empty).toHaveLength(8);
    expect(empty.every((f) => new TextDecoder().decode(f.data).split("\r\n").filter(Boolean).length === 1)).toBe(true);
  });

  it("file name: brand + slug + WIB date", () => {
    expect(exportFileName("glow-by-sari", new Date("2026-10-17T18:30:00Z"))).toBe("wadar-glow-by-sari-20261018.zip");
  });
});
