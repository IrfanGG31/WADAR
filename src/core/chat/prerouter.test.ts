import { describe, expect, it } from "vitest";
import { preRoute } from "./prerouter";

describe("preRoute (TECH-SPEC §7.3 step 1)", () => {
  it("routes any media to the owner", () => {
    expect(preRoute({ text: "", hasMedia: true })).toBe("media_received");
    expect(preRoute({ text: "serum vit c ready?", hasMedia: true })).toBe("media_received");
  });

  it.each([
    "barangnya rusak kak",
    "aku kecewa banget",
    "minta refund dong",
    "mau komplain",
    "paketku belum sampai",
    "pesanan tidak sampai sampai",
    "kok salah kirim warnanya",
    "botolnya pecah",
  ])("complaint: %s", (text) => {
    expect(preRoute({ text })).toBe("complaint");
  });

  it.each([
    "admin",
    "admin dong",
    "adminnya mana?",
    "minta admin",
    "mau ngobrol sama admin",
    "bisa ke cs?",
    "sambungkan ke orang aja",
    "saya mau bicara dengan manusia",
    "kamu bukan bot kan?",
    "hubungi pemilik toko",
  ])("human requested: %s", (text) => {
    expect(preRoute({ text })).toBe("human_requested");
  });

  it.each([
    "kasih diskon dong kak",
    "diskon dong",
    "bisa nego?",
    "harganya bisa kurang?",
    "minta potongan ya",
    "kurangin dikit lah",
    "gratis ongkir dong",
    "cashback boleh?",
  ])("negotiation: %s", (text) => {
    expect(preRoute({ text })).toBe("negotiation");
  });

  it("lets a complaint that mentions the admin be a complaint", () => {
    expect(preRoute({ text: "admin, barangku rusak" })).toBe("complaint");
  });

  it.each([
    "halo admin, serum vit c ready?",
    "mau tanya admin, bisa COD?",
    "serum ini aman untuk orang hamil?",
    "ada promo gratis ongkir?",
    "ada diskon apa minggu ini?",
    "harga serum niacinamide berapa?",
    "Halo kak",
    "bisa bayar pakai qris?",
    "penawaran terbaik apa?",
  ])("passes through to the model: %s", (text) => {
    expect(preRoute({ text })).toBeNull();
  });
});
