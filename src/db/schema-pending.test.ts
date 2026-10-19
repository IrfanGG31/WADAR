import { describe, expect, it } from "vitest";
import { isSchemaPending } from "./schema-pending";

describe("isSchemaPending", () => {
  it("recognises missing tables/functions from Postgres and PostgREST", () => {
    for (const code of ["42P01", "42883", "PGRST205", "PGRST202"]) expect(isSchemaPending({ code })).toBe(true);
  });
  it("leaves every other error alone", () => {
    expect(isSchemaPending({ code: "42501" })).toBe(false);
    expect(isSchemaPending({ code: null })).toBe(false);
    expect(isSchemaPending(null)).toBe(false);
  });
});
