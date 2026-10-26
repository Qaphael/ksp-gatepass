import { hash, verify } from "@node-rs/argon2";

// Argon2id with OWASP-recommended parameters (m=19456 KiB, t=2, p=1).
const OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/** Returns false (never throws) for corrupt hashes or mismatched passwords. */
export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, password, OPTIONS);
  } catch {
    return false;
  }
}
