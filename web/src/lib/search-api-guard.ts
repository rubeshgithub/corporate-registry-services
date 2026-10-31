import crypto from "node:crypto";
import { db } from "./mongo";

/**
 * Abuse guard for the public company search (owner, Oct 31 2026: "someone might use this API as well").
 *
 * The search has to answer the visitor's browser, so it can never be private. The guard makes reuse slow and visible:
 *  1. Only our own pages: the browser's Sec-Fetch-Site (same-origin / same-site), else a Referer on our domain.
 *     A request typed into the address bar or sent by a script without those headers gets 403. Faking them is easy,
 *     which is why 2 exists.
 *  2. Per-connection limits, in process (one Render instance; a restart forgets, which only ever helps a visitor).
 *  3. The route trims queries and caps results (see route.ts).
 *  4. Every refusal is logged to crs_analytics.search_api_blocks, one row per connection per hour, with a count.
 *
 * `COMPANY_SEARCH_API_KEY` (optional env): a caller sending `x-crs-search-key: <key>` skips 1 and 2 — for our own
 * other apps if one ever needs the search server to server. Nothing uses it today.
 */

export const LIMITS = [
  { windowMs: 60_000, max: 20 },            // a burst: typeahead on a slow typist is ~1 a second
  { windowMs: 10 * 60_000, max: 60 },
  { windowMs: 24 * 60 * 60_000, max: 300 },
] as const;

const OUR_HOSTS = /(^|\.)corporateregistryservices\.ca$|^localhost$|^127\.0\.0\.1$/;

/** The visitor's address: Cloudflare's header when present (Render sits behind it), else the first X-Forwarded-For hop. */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (h.get("cf-connecting-ip") ?? h.get("true-client-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "")
    .trim();
}

const hashIp = (ip: string) => (ip ? crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24) : "unknown");

function keyMatches(req: Request): boolean {
  const want = process.env.COMPANY_SEARCH_API_KEY;
  const got = req.headers.get("x-crs-search-key");
  if (!want || !got) return false;
  const a = Buffer.from(want), b = Buffer.from(got);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** True when the request came from one of our own pages. */
export function fromOurSite(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site === "same-origin" || site === "same-site") return true;
  if (site === "cross-site" || site === "none") return false;
  /* Older browsers send no Sec-Fetch-Site: fall back to the Referer (sent for same-origin requests by default). */
  const ref = req.headers.get("referer");
  if (!ref) return false;
  try { return OUR_HOSTS.test(new URL(ref).hostname); } catch { return false; }
}

type Hits = Map<string, number[]>;
const g = globalThis as typeof globalThis & { _crsSearchHits?: Hits; _crsSearchSweep?: number };
const hits: Hits = (g._crsSearchHits ??= new Map());
const LONGEST = LIMITS[LIMITS.length - 1].windowMs;

/** Records the hit and says whether it is over a limit (the refused hit still counts, so hammering stays refused). */
function overLimit(key: string, now: number): { over: boolean; retryAfterS: number } {
  const list = (hits.get(key) ?? []).filter((t) => now - t < LONGEST);
  list.push(now);
  hits.set(key, list);
  /* Forget idle connections now and then so the map does not grow forever. */
  if (!g._crsSearchSweep || now - g._crsSearchSweep > 10 * 60_000) {
    g._crsSearchSweep = now;
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > LONGEST) hits.delete(k);
  }
  for (const { windowMs, max } of LIMITS) {
    const inWindow = list.filter((t) => now - t < windowMs);
    if (inWindow.length > max) {
      const retry = Math.ceil((inWindow[inWindow.length - max - 1] + windowMs - now) / 1000);
      return { over: true, retryAfterS: Math.max(1, retry) };
    }
  }
  return { over: false, retryAfterS: 0 };
}

async function logBlock(ipHash: string, reason: string, req: Request, q: string): Promise<void> {
  try {
    const now = new Date();
    const hour = now.toISOString().slice(0, 13);
    const col = (await db()).collection("search_api_blocks");
    await col.updateOne(
      { _id: `${ipHash}|${hour}|${reason}` as unknown as never },
      {
        $setOnInsert: { ipHash, reason, hour, firstAt: now },
        /* Which header gave the address (never the address itself): tells us whether Cloudflare's header reaches Render. */
        $set: { ipFrom: req.headers.get("cf-connecting-ip") ? "cf" : req.headers.get("true-client-ip") ? "true-client-ip" : req.headers.get("x-forwarded-for") ? "xff" : "none",
          lastAt: now, userAgent: (req.headers.get("user-agent") ?? "").slice(0, 300), lastQuery: q.slice(0, 100) },
        $inc: { count: 1 },
      },
      { upsert: true },
    );
  } catch (e) {
    console.warn("[CRS] search_api_blocks log failed:", e instanceof Error ? e.message : e);
  }
}

export type GuardResult = { ok: true } | { ok: false; status: 403 | 429; message: string; retryAfterS?: number };

export function guardSearch(req: Request, q: string): GuardResult {
  if (keyMatches(req)) return { ok: true };
  const ipHash = hashIp(clientIp(req));
  if (!fromOurSite(req)) {
    void logBlock(ipHash, "not-our-site", req, q);
    return { ok: false, status: 403, message: "This search is only available on corporateregistryservices.ca." };
  }
  const { over, retryAfterS } = overLimit(ipHash, Date.now());
  if (over) {
    void logBlock(ipHash, "rate-limit", req, q);
    return { ok: false, status: 429, message: "Too many searches. Please wait a little and try again, or call us at (778) 949-2055.", retryAfterS };
  }
  return { ok: true };
}
