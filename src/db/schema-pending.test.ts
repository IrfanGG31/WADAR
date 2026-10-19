import { describe, expect, it } from "vitest";
import { isChannelPending, isSchemaPending } from "./schema-pending";

describe("isSchemaPending", () => {
  it("recognises missing tables/functions/columns from Postgres and PostgREST", () => {
    for (const code of ["42P01", "42883", "42703", "PGRST205", "PGRST202", "PGRST204"]) expect(isSchemaPending({ code })).toBe(true);
  });
  it("leaves every other error alone", () => {
    expect(isSchemaPending({ code: "42501" })).toBe(false);
    expect(isSchemaPending({ code: null })).toBe(false);
    expect(isSchemaPending(null)).toBe(false);
  });
});

describe("isChannelPending", () => {
  it("recognises the not-yet-widened channel CHECK", () => {
    const message = 'new row for relation "conversations" violates check constraint "conversations_channel_check"';
    expect(isChannelPending({ code: "23514", message })).toBe(true);
  });
  it("leaves other check violations and errors alone", () => {
    expect(isChannelPending({ code: "23514", message: 'violates check constraint "messages_content_check"' })).toBe(false);
    expect(isChannelPending({ code: "42501", message: "conversations_channel_check" })).toBe(false);
    expect(isChannelPending(new Error("boom"))).toBe(false);
    expect(isChannelPending(null)).toBe(false);
  });
});
