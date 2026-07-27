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

/**
 * Bearer-token auth for external automation. Adds an alternate path to
 * cookie auth so a scheduled Claude cowork (or any external script) can
 * POST drafts to the CMS API and have them appear in the review UI a
 * human uses.
 *
 * ENV: CMS_API_TOKEN — separate from CMS_PASSWORD so the automation
 * credential can be rotated independently. Fail closed: no token in env
 * → bearer path is disabled entirely (cookie still works).
 *
 * Not every route allows bearer — DELETE + Publish stay cookie-only so
 * only a human can destroy or ship content. Callers opt in per-route by
 * passing `{ allowBearer: true }`.
 */
export async function isCmsAuthorized(req: Request, opts: { allowBearer?: boolean } = {}): Promise<boolean> {
  /* Cookie session — always the primary path */
  if (await isCmsAuthenticated()) return true;

  /* Bearer token — only if this route allows it AND env is configured */
  if (opts.allowBearer) {
    const header = req.headers.get("authorization") ?? "";
    const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const expected = process.env.CMS_API_TOKEN?.trim();
    if (presented && expected && timingSafeStrEq(presented, expected)) return true;
  }

  return false;
}

function timingSafeStrEq(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
