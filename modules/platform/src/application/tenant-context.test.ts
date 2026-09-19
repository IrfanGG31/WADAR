import { describe, expect, it, vi } from "vitest";
import type { Db } from "../infra/db.js";
import { withTenantContext } from "./tenant-context.js";

describe("withTenantContext", () => {
  it("calls set_config('app.tenant_id', tenantId, true) before running fn, inside one transaction", async () => {
    const calls: string[] = [];
    const fakeTx = {
      execute: vi.fn(async (query: { queryChunks?: unknown[] }) => {
        calls.push("execute");
        // Sanity: the query passed is the set_config statement, not something else.
        expect(JSON.stringify(query)).toContain("app.tenant_id");
        return undefined;
      }),
    };
    const fakeDb = {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        return fn(fakeTx);
      }),
    } as unknown as Db;

    const result = await withTenantContext(fakeDb, "tenant-abc", async (tx) => {
      calls.push("fn");
      expect(tx).toBe(fakeTx);
      return "done";
    });

    expect(result).toBe("done");
    expect(calls).toEqual(["execute", "fn"]);
    expect(fakeDb.transaction).toHaveBeenCalledOnce();
  });

  it("propagates fn's return value and rejection", async () => {
    const fakeTx = { execute: vi.fn(async () => undefined) };
    const fakeDb = {
      transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeTx)),
    } as unknown as Db;

    await expect(
      withTenantContext(fakeDb, "tenant-x", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
  });
});
