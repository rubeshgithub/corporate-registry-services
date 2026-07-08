import crypto from "node:crypto";

/**
 * Short opaque tokens for /o/<token> deep-links, and HMAC-signed unsubscribe
 * URLs so recipients can't spoof or brute-force each other's unsubs.
 */

const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"; // no 0/O/I/1 look-alikes

/** 12-char URL-safe token (~72 bits of entropy — plenty for our scale). */
export function newToken(): string {
  const bytes = crypto.randomBytes(12);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** HMAC signature over the email, so unsubscribe links are one-way per recipient. */
export function signUnsubscribe(email: string): string {
  const secret = process.env.OUTREACH_UNSUB_SECRET;
  if (!secret) throw new Error("OUTREACH_UNSUB_SECRET is not set");
  return crypto
    .createHmac("sha256", secret)
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 24);
}

export function verifyUnsubscribe(email: string, sig: string): boolean {
  try {
    const expected = signUnsubscribe(email);
    if (expected.length !== sig.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}
