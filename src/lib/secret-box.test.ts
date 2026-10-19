import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { encryptionKeyFrom, openSecret, sealSecret, secretHint } = await import("./secret-box");

describe("secret box", () => {
  const key = randomBytes(32);

  it("round-trips and never stores the plain text", () => {
    const sealed = sealSecret("sk-live-1234567890", key);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("1234567890");
    expect(openSecret(sealed, key)).toBe("sk-live-1234567890");
  });

  it("uses a fresh IV each time", () => {
    expect(sealSecret("x", key)).not.toBe(sealSecret("x", key));
  });

  it("refuses another key or a tampered box", () => {
    const sealed = sealSecret("rahasia", key);
    expect(() => openSecret(sealed, randomBytes(32))).toThrow();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => openSecret(parts.join("."), key)).toThrow();
  });

  it("derives a stable key from the service-role key when no explicit key is set", () => {
    const a = encryptionKeyFrom({ SUPABASE_SERVICE_ROLE_KEY: "svc" });
    const b = encryptionKeyFrom({ SUPABASE_SERVICE_ROLE_KEY: "svc" });
    expect(a?.equals(b!)).toBe(true);
    expect(a?.length).toBe(32);
    expect(encryptionKeyFrom({})).toBeNull();
    expect(() => encryptionKeyFrom({ WADAR_ENCRYPTION_KEY: "short" })).toThrow();
  });

  it("hints without revealing the key", () => {
    expect(secretHint("sk-abcdefghijklmnop")).toBe("sk-…mnop");
    expect(secretHint("short")).toBe("••••");
  });
});
