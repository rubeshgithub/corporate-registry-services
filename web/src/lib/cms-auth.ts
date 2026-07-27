import { cookies } from "next/headers";
import crypto from "node:crypto";

/**
 * Minimal password-gated CMS auth. Mirrors admin-auth.ts pattern: HMAC of
 * password + expiry timestamp, stored in an HttpOnly cookie. No user model,
 * no session store — a single CMS_PASSWORD env var controls access.
 *
 * ┌────────────────────────────────────────────────────────────────────┐
 * │ ENV VARS                                                            │
 * ├────────────────────────────────────────────────────────────────────┤
 * │ CMS_PASSWORD       Login password. Generate with:                   │
 * │                    openssl rand -base64 24                          │
 * │ CMS_COOKIE_SALT    Optional. Salt for the HMAC. Rotating this       │
 * │                    invalidates all active sessions. Defaults to a   │
 * │                    static fallback if not set.                      │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * Kept separate from admin auth so CMS + admin can have different
 * passwords, different rotation schedules, and different session TTLs.
 */

const COOKIE_NAME = "crs_cms_session";
const COOKIE_TTL_HOURS = 24 * 7; // 7 days — CMS work sessions are long

function makeToken(password: string, expiresAt: number): string {
  const secret = process.env.CMS_COOKIE_SALT ?? "crs-cms-fallback-salt";
  return crypto.createHmac("sha256", secret).update(`${password}:${expiresAt}`).digest("hex");
}

export function issueSessionCookie(password: string): { value: string; expiresAt: number } {
  const expiresAt = Date.now() + COOKIE_TTL_HOURS * 3600 * 1000;
  const token = makeToken(password, expiresAt);
  return { value: `${expiresAt}.${token}`, expiresAt };
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.CMS_PASSWORD;
  if (!expected || !candidate) return false;
  if (expected.length !== candidate.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(candidate));
  } catch {
    return false;
  }
}

export async function isCmsAuthenticated(): Promise<boolean> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  const password = process.env.CMS_PASSWORD;
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

export const CMS_COOKIE_NAME = COOKIE_NAME;
export const CMS_COOKIE_TTL_SEC = COOKIE_TTL_HOURS * 3600;
