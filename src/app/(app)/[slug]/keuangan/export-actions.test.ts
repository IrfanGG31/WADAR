import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberRole } from "@/core/roles";

let role: MemberRole = "owner";
type Window = { from: string; to: string };
const getFinanceData = vi.fn<(tenantId: string, window: Window) => Promise<{ lines: never[]; expenses: { day: string; amount: number }[] }>>(
  async () => ({ lines: [], expenses: [{ day: "2026-10-16", amount: 12000 }] }),
);

vi.mock("server-only", () => ({}));
vi.mock("@/db/shop", () => ({
  getShop: async (slug: string) => ({ id: `tenant-of-${slug}`, slug, timezone: "Asia/Jakarta" }),
}));
vi.mock("@/db/finance", () => ({ getFinanceData: (t: string, w: Window) => getFinanceData(t, w) }));
vi.mock("@/db/access", async () => {
  const { can, deniedMessage } = await import("@/core/roles");
  return { permissionDenied: async (_t: string, p: Parameters<typeof can>[1]) => (can(role, p) ? null : deniedMessage(role, p)) };
});

const { exportFinanceReport } = await import("./export-actions");

beforeEach(() => {
  role = "owner";
  getFinanceData.mockClear();
  vi.useFakeTimers({ now: new Date("2026-10-17T05:00:00Z") }); // 12.00 WIB, 17 Oct
});
afterEach(() => vi.useRealTimers());

describe("exportFinanceReport (FIN-7)", () => {
  it("downloads the default 7-day period of this shop as CSV rows", async () => {
    const r = await exportFinanceReport("kopi-dimas", undefined);
    if ("error" in r) throw new Error(r.error);
    expect(getFinanceData).toHaveBeenCalledWith("tenant-of-kopi-dimas", { from: "2026-10-10", to: "2026-10-16" });
    expect(r.filename).toBe("wadar-kopi-dimas-keuangan-20261010-20261016.csv");
    const rows = r.csv.split("\r\n");
    expect(rows).toHaveLength(1 + 7 + 1 + 1);
    expect(rows[1]).toBe("2026-10-10,0,0,0,0,0,0,0,0");
    expect(rows[7]).toBe("2026-10-16,0,0,0,0,0,0,12000,-12000");
    expect(rows[8]).toBe("TOTAL,0,0,0,0,0,0,12000,-12000");
  });

  it("follows the chosen period (?periode=30) and reads only the shop of the slug", async () => {
    const r = await exportFinanceReport("toko-lain", "30");
    if ("error" in r) throw new Error(r.error);
    expect(getFinanceData).toHaveBeenCalledWith("tenant-of-toko-lain", { from: "2026-09-17", to: "2026-10-16" });
    expect(r.csv.split("\r\n")).toHaveLength(1 + 30 + 1 + 1);
  });

  it("an unknown period falls back to 7 days", async () => {
    await exportFinanceReport("kopi-dimas", "999");
    expect(getFinanceData.mock.calls[0][1]).toEqual({ from: "2026-10-10", to: "2026-10-16" });
  });

  it("a cashier is refused before anything is read", async () => {
    role = "cashier";
    expect(await exportFinanceReport("kopi-dimas", "7")).toEqual({
      error: "Akun kasir tidak bisa melihat atau mengunduh laporan keuangan. Minta pemilik toko melakukannya.",
    });
    expect(getFinanceData).not.toHaveBeenCalled();
  });

  it("a failed read is reported, not an empty file", async () => {
    getFinanceData.mockRejectedValueOnce(new Error("boom"));
    vi.spyOn(console, "error").mockImplementationOnce(() => undefined);
    expect(await exportFinanceReport("kopi-dimas", "7")).toEqual({ error: "Laporan belum bisa diunduh. Coba lagi sebentar." });
  });
});
