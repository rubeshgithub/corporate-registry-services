import { cookies } from "next/headers";

/**
 * Minimal password-gated admin auth. On successful password check we set an
 * httpOnly cookie carrying an HMAC of the password + a timestamp; every admin
 * route reads that cookie and verifies. No sessions in DB, no user model —
 * a single ADMIN_PASSWORD env var controls access.
 *
 * Not a substitute for real auth if the site scales to multiple ops users.
 * When you need per-user audit trails or role separation, upgrade to OTP +
 * a User model similar to what MinuteBook already runs.
 */

import crypto from "node:crypto";

const COOKIE_NAME = "crs_admin_session";
const COOKIE_TTL_HOURS = 12;

/** Derive a deterministic token from the password + a secret salt, keyed by
 *  expiry. Invalidates on password change or salt rotation. */
function makeToken(password: string, expiresAt: number): string {
  const secret = process.env.ADMIN_COOKIE_SALT ?? "crs-admin-fallback-salt";
  return crypto.createHmac("sha256", secret).update(`${password}:${expiresAt}`).digest("hex");
}

/** Called by the login route. Returns a cookie value the client should store. */
export function issueSessionCookie(password: string): { value: string; expiresAt: number } {
  const expiresAt = Date.now() + COOKIE_TTL_HOURS * 3600 * 1000;
  const token = makeToken(password, expiresAt);
  return { value: `${expiresAt}.${token}`, expiresAt };
}

/** Constant-time password check against the ADMIN_PASSWORD env var. */
export function checkPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !candidate) return false;
  if (expected.length !== candidate.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(candidate));
  } catch {
    return false;
  }
}

/** Reads the admin cookie and confirms it's valid + not expired. */
export async function isAdminAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  const password = process.env.ADMIN_PASSWORD;
  if (!raw || !password) return false;
  const [tsStr, token] = raw.split(".");
  const expiresAt = parseInt(tsStr, 10);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expected = makeToken(password, expiresAt);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token, "hex"));
  } catch {
    return false;
  }
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
export const ADMIN_COOKIE_TTL_SEC = COOKIE_TTL_HOURS * 3600;
