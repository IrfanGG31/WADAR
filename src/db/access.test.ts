import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, has } from "@/test/fake-supabase";

let row: { role: string } | null = { role: "cashier" };
let sub: string | null = "u1";
let db = fakeSupabase();
const client = () => ({ ...db.client, auth: { getClaims: async () => ({ data: sub ? { claims: { sub } } : null, error: null }) } });

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client() }));
const { getMyRole, permissionDenied } = await import("./access");

beforeEach(() => {
  row = { role: "cashier" };
  sub = "u1";
  db = fakeSupabase(() => ({ data: row, error: null }));
});

describe("access (signed-in user's role in a shop)", () => {
  it("reads the caller's own membership row for that shop", async () => {
    expect(await getMyRole("t1")).toBe("cashier");
    const [chain] = db.chains;
    expect(chain.table).toBe("memberships");
    expect(has(chain, "eq", "tenant_id", "t1")).toBe(true);
    expect(has(chain, "eq", "user_id", "u1")).toBe(true);
  });

  it("no session or no membership = no role (never assumed owner)", async () => {
    row = null;
    expect(await getMyRole("t2")).toBeNull();
    sub = null;
    expect(await getMyRole("t3")).toBeNull();
  });

  it("permissionDenied: null when allowed, the clear message when not", async () => {
    expect(await permissionDenied("t4", "sell")).toBeNull();
    expect(await permissionDenied("t5", "settings")).toBe("Akun kasir tidak bisa mengubah pengaturan toko. Minta pemilik toko melakukannya.");
  });
});
