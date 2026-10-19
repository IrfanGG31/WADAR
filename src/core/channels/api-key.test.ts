import { describe, expect, it } from "vitest";
import { generateApiKey, hashMatches, parseApiKey } from "./api-key";

describe("WADAR API keys", () => {
  it("generates the documented shape and a matching hash", () => {
    const k = generateApiKey();
    expect(k.full).toMatch(/^wdr_[a-z0-9]{8}_[A-Za-z0-9]{32}$/);
    expect(k.full.startsWith(`${k.prefix}_`)).toBe(true);
    expect(hashMatches(k.full, k.hash)).toBe(true);
    expect(hashMatches(`${k.full.slice(0, -1)}X`, k.hash)).toBe(false);
    expect(generateApiKey().full).not.toBe(k.full);
  });

  it("parses a bearer header and rejects anything else", () => {
    const k = generateApiKey();
    expect(parseApiKey(`Bearer ${k.full}`)).toEqual({ prefix: k.prefix, full: k.full });
    expect(parseApiKey(k.full)?.prefix).toBe(k.prefix);
    expect(parseApiKey("Bearer sk-not-ours")).toBeNull();
    expect(parseApiKey(null)).toBeNull();
    expect(parseApiKey(`Bearer ${k.full}x`)).toBeNull();
  });
});
