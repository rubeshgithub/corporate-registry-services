import crypto from "node:crypto";
import { NextResponse } from "next/server";

/* Guards for public, unauthenticated routes that send mail from support@
 *  (DKIM-signed as corporateregistryservices.ca) to an address the visitor
 *  typed. Used by /api/contact, /api/wizard-submit and /api/order/etransfer.
 *
 *  The rules those routes follow:
 *  - The visitor's acknowledgement is fixed text. It repeats nothing they
 *    typed, only server-derived values such as a service label or a price.
 *  - Every field is length-capped, and anything placed in a subject goes
 *    through oneLine() so it can't be split into extra headers.
 *  - admit() limits accepted submissions per IP hash and per address, and
 *    acknowledgements per address and site-wide. Only support@ sees what the
 *    visitor wrote. */

export const HOUR = 60 * 60 * 1000;
export const DAY  = 24 * HOUR;

export const MAX_EMAIL = 254;

/* WHATWG's input[type=email] pattern, plus a required dot in the domain. It
 *  allows no spaces, commas, angle brackets or quotes, so the value can only
 *  name one mailbox. */
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/* C0/C1 controls (CR and LF included), line/paragraph separators, bidi overrides. */
const CONTROL_RE = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;
/* The same set minus tab and LF, for multi-line text. */
const BODY_CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;

export function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** One line, safe for a header: controls become spaces, whitespace collapses. */
export function oneLine(v: unknown): string {
  return text(v).replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim();
}

/** Multi-line text: keeps newlines and tabs, drops every other control. */
export function multiLine(v: unknown): string {
  return text(v).replace(/\r\n?/g, "\n").replace(BODY_CONTROL_RE, "").trim();
}

/** A single mailbox, MAX_EMAIL chars at most. Expects a trimmed string. */
export function isEmail(email: string): boolean {
  return email.length <= MAX_EMAIL && EMAIL_RE.test(email);
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** First X-Forwarded-For hop, hashed. Stored hashes use the same derivation. */
export function ipHashFrom(request: Request): string | undefined {
  const raw = (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "").split(",")[0]?.trim() ?? "";
  return raw ? crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24) : undefined;
}

/** Reads a JSON object body of at most maxChars, or returns the 413/400 to send. */
export async function readJsonObject(
  request: Request,
  maxChars: number,
  messages: { tooLong: string; invalid: string },
): Promise<{ body: Record<string, unknown> } | { response: NextResponse }> {
  const tooLong = () => ({ response: NextResponse.json({ error: messages.tooLong }, { status: 413 }) });
  if (Number(request.headers.get("content-length") ?? 0) > maxChars) return tooLong();
  try {
    const raw = await request.text();
    if (raw.length > maxChars) return tooLong();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return { body: parsed as Record<string, unknown> };
  } catch {
    return { response: NextResponse.json({ error: messages.invalid }, { status: 400 }) };
  }
}

export function tooManyRequests(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 429, headers: { "Retry-After": "3600" } });
}

export type Limits = {
  perIpHour:       number;   // accepted submissions from one IP hash
  perEmailHour:    number;   // accepted submissions giving one address
  acksPerEmailDay: number;   // acknowledgements sent to one address
  acksAllHour:     number;   // acknowledgements site-wide, a backstop for rotated IPs
};

/** The same four counts, from the route's saved submissions. */
export type SavedCounts = { ip: number; email: number; acksToEmail: number; acksAll: number };

/** Runs a route's Mongo count lookup with a 3s timeout. Best effort: if Mongo
 *  is slow or down, the in-process counts still apply and the submission
 *  still goes out. */
export async function savedCounts(label: string, lookup: () => Promise<SavedCounts>): Promise<SavedCounts | null> {
  try {
    return await withTimeout(lookup(), 3_000);
  } catch (e) {
    console.error(`[CRS] ${label} rate-limit lookup failed:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/* In-process sliding windows. The check and the record happen in one
 *  synchronous step, so a burst of parallel requests cannot all get under the
 *  limit before any of them reaches Mongo. The Mongo counts carry the limits
 *  across restarts and instances. Kept on globalThis to survive dev HMR. */
type Hits = Map<string, number[]>;
const g = globalThis as typeof globalThis & { _crsFormHits?: Hits };
const hits: Hits = (g._crsFormHits ??= new Map());

/* Each key is always read with the same window, so pruning to it is safe. */
function countHits(key: string, windowMs: number, now: number): number {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length) hits.set(key, recent);
  else hits.delete(key);
  return recent.length;
}

function addHit(key: string, now: number): void {
  const list = hits.get(key);
  if (list) list.push(now);
  else hits.set(key, [now]);
  if (hits.size > 10_000) {
    for (const [k, ts] of hits) if (now - ts[ts.length - 1] >= DAY) hits.delete(k);
  }
}

/**
 * Checks and records one submission. `scope` keeps each route's counts apart.
 * Returns null when over the submission limits (the caller answers 429).
 * Otherwise sendAck says whether the acknowledgement is within its limits;
 * over them the submission still reaches support@, only the auto-reply is
 * skipped, and the response shouldn't say which happened.
 *
 * Call it after awaiting savedCounts(), and record the submission with the
 * same sendAck so the Mongo counts match.
 */
export function admit(
  scope: string,
  limits: Limits,
  ipHash: string | undefined,
  email: string,
  saved: SavedCounts | null,
  now: number,
): { sendAck: boolean } | null {
  const ipKey    = `${scope}|ip:${ipHash ?? "none"}`;
  const emailKey = `${scope}|email:${email}`;
  const ackKey   = `${scope}|ack:${email}`;
  const ackAll   = `${scope}|ack:*`;
  if (
    Math.max(countHits(ipKey, HOUR, now), saved?.ip ?? 0) >= limits.perIpHour ||
    Math.max(countHits(emailKey, HOUR, now), saved?.email ?? 0) >= limits.perEmailHour
  ) {
    return null;
  }
  const sendAck =
    Math.max(countHits(ackKey, DAY, now), saved?.acksToEmail ?? 0) < limits.acksPerEmailDay &&
    Math.max(countHits(ackAll, HOUR, now), saved?.acksAll ?? 0) < limits.acksAllHour;
  addHit(ipKey, now);
  addHit(emailKey, now);
  if (sendAck) {
    addHit(ackKey, now);
    addHit(ackAll, now);
  }
  return { sendAck };
}
