import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["0812-3456-7890", "+6281234567890"],
    ["081234567890", "+6281234567890"],
    ["6281234567890", "+6281234567890"],
    ["+62 812 3456 7890", "+6281234567890"],
    ["81234567890", "+6281234567890"],
    ["(021) 5551234", "+62215551234"],
    ["+60123456789", "+60123456789"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "   ", "abc", "12345", "0812", "+62 0812 3456 7890", "99999999999999999"])("rejects %j", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("formatPhone", () => {
  it("shows local format", () => {
    expect(formatPhone("+6281234567890")).toBe("0812-3456-7890");
    expect(formatPhone("+60123456789")).toBe("+60123456789");
  });
});
