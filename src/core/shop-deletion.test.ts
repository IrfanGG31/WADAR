import { describe, expect, it } from "vitest";
import { confirmsSlug, DELETION_GRACE_DAYS, deletionStage, deletionError } from "./shop-deletion";

describe("shop deletion (GAP #6, PDF §C.3 'bisa dihapus')", () => {
  it("the owner must type the shop's own slug; case and spaces don't matter", () => {
    expect(confirmsSlug("glow-by-sari", " Glow-By-Sari ")).toBe(true);
    expect(confirmsSlug("glow-by-sari", "glow")).toBe(false);
    expect(confirmsSlug("glow-by-sari", "")).toBe(false);
    expect(confirmsSlug("glow-by-sari", undefined)).toBe(false);
  });

  it("a shop is active until deletion is requested, then scheduled for purge", () => {
    expect(deletionStage(null)).toEqual({ stage: "active" });
    expect(deletionStage({ deletion_requested_at: null, purge_after: null })).toEqual({ stage: "active" });
    expect(deletionStage({ deletion_requested_at: "2026-10-17T01:00:00Z", purge_after: "2026-10-24T01:00:00Z" })).toEqual({
      stage: "scheduled",
      requestedAt: "2026-10-17T01:00:00Z",
      purgeAfter: "2026-10-24T01:00:00Z",
    });
  });

  it("grace period is a week", () => {
    expect(DELETION_GRACE_DAYS).toBe(7);
  });

  it("RPC errors read as plain Indonesian, never the raw Postgres text", () => {
    expect(deletionError(null)).toBeUndefined();
    expect(deletionError({ code: "42501", message: "only the owner" })).toBe("Hanya pemilik toko yang bisa menghapus toko.");
    expect(deletionError({ code: "22023", message: "confirm" })).toBe("Ketik nama tautan toko dengan benar untuk konfirmasi.");
    expect(deletionError({ code: "55000", message: "not scheduled" })).toBe("Jadwalkan penghapusan dulu sebelum menghapus permanen.");
    expect(deletionError({ code: "XX000", message: "boom" })).toBe("Belum berhasil. Datamu tidak berubah, coba lagi sebentar.");
  });
});
