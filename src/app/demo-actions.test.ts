import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_IP_LIMIT } from "@/core/rate-limit";

let ip = "203.0.113.9";
vi.mock("server-only", () => ({}));
const rpc = vi.fn(async () => ({ data: "glow-by-sari-abcde", error: null }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": ip }) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getClaims: async () => ({ data: { claims: { sub: "u1" } } }), signInAnonymously: async () => ({ error: null }) },
    rpc,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  },
}));

const { startDemo } = await import("./demo-actions");

const go = async () => {
  try {
    await startDemo(new FormData());
  } catch (e) {
    return (e as { url?: string }).url;
  }
};

describe("startDemo per-IP limit", () => {
  beforeEach(() => rpc.mockClear());

  it("stops building demo shops for one IP past the limit, before any RPC", async () => {
    for (let i = 0; i < DEMO_IP_LIMIT; i++) expect(await go()).toBe("/glow-by-sari-abcde/beranda");
    expect(await go()).toBe("/masuk?error=demo_busy");
    expect(rpc).toHaveBeenCalledTimes(DEMO_IP_LIMIT);
    ip = "198.51.100.1";
    expect(await go()).toBe("/glow-by-sari-abcde/beranda");
  });
});
