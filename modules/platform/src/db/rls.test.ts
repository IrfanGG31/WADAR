import { PgDialect, pgTable, uuid } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { tenantRlsPolicy } from "./rls.js";

describe("tenantRlsPolicy", () => {
  const dialect = new PgDialect();
  // A throwaway table just to get a real AnyPgColumn to build the policy
  // against — same shape any module's db/schema.ts would pass in.
  const fixtureTable = pgTable("fixture", { tenantId: uuid("tenant_id").notNull() });
  const policy = tenantRlsPolicy(fixtureTable.tenantId);

  it("is named 'tenant_isolation' and applies to all commands", () => {
    expect(policy.name).toBe("tenant_isolation");
    expect(policy.for).toBe("all");
  });

  it("does not restrict `to` a specific role (defaults to PUBLIC)", () => {
    expect(policy.to).toBeUndefined();
  });

  it("using/withCheck both compare tenant_id against current_setting('app.tenant_id') without missing_ok", () => {
    expect(policy.using).toBeDefined();
    expect(policy.withCheck).toBeDefined();

    const usingQuery = dialect.sqlToQuery(policy.using!);
    const withCheckQuery = dialect.sqlToQuery(policy.withCheck!);

    expect(usingQuery.sql).toContain("current_setting('app.tenant_id')");
    expect(usingQuery.sql).toContain("::uuid");
    expect(usingQuery.sql).not.toContain("missing_ok");
    expect(withCheckQuery.sql).toBe(usingQuery.sql);
  });
});
