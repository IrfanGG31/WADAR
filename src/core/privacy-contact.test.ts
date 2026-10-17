import { describe, expect, it } from "vitest";
import { privacyEmail, privacyMailto } from "./privacy-contact";

describe("privacy contact email (/privasi, UU PDP)", () => {
  it("uses the configured address, trimmed and lowercased", () => {
    expect(privacyEmail("  Privasi@Contoh.id ")).toBe("privasi@contoh.id");
  });

  it("falls back to null when unset, blank or not an email (the page then says it is not set yet)", () => {
    expect(privacyEmail(undefined)).toBeNull();
    expect(privacyEmail(null)).toBeNull();
    expect(privacyEmail("   ")).toBeNull();
    expect(privacyEmail("bukan-email")).toBeNull();
    expect(privacyEmail("a@b")).toBeNull();
  });

  it("mailto carries a subject", () => {
    expect(privacyMailto("privasi@contoh.id")).toBe("mailto:privasi@contoh.id?subject=Permintaan%20data%20pribadi");
  });
});
