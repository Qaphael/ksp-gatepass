import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/tokens";

describe("password hashing (Argon2id)", () => {
  it("produces a verifiable argon2id hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toContain("correct horse");
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
  });

  it("rejects a wrong password and never throws on corrupt hashes", async () => {
    const hash = await hashPassword("another-password-123");
    expect(await verifyPassword(hash, "wrong-password-123")).toBe(false);
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
  });

  it("salts: identical passwords hash differently", async () => {
    const [a, b] = await Promise.all([
      hashPassword("same-password-1234"),
      hashPassword("same-password-1234"),
    ]);
    expect(a).not.toBe(b);
  });
});

describe("session tokens", () => {
  it("generates unique high-entropy tokens and stable hashes", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateSessionToken()).not.toBe(token);
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).not.toBe(token);
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });
});
