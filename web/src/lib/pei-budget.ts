/**
 * Call budget for the PEI registry upstream.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * PEI's integration brief asks for two things we never implemented:
 * "rate-limit per user session" and "debounce any typeahead hard". Without
 * them, our search widgets issued one upstream call per settled keystroke —
 * the cache is keyed by the exact query string, so every character typed is
 * a fresh key and a fresh call. Measured from the cache: 71% of all PEI
 * calls happened inside a typing burst, the worst being 14 calls in 15.8
 * seconds while one visitor typed "elevate north advisors". PEI runs a WAF
 * that blocks aggressive clients, and by September 2026 it was returning a
 * challenge page to our host instead of data.
 *
 * So this is not a performance guard. It is the thing that has to be true
 * before we can credibly ask PEI to unblock us.
 *
 * ── Shape ────────────────────────────────────────────────────────────────
 * Two sliding windows, in memory. Per-instance rather than Mongo-backed on
 * purpose: a Mongo round-trip per search to protect a third party would cost
 * every search to police a minority of them, and the limits are generous
 * enough that approximate enforcement is the right trade. A deploy resets
 * the windows, which is acceptable — the burst this stops lasts seconds.
 */

/** Upstream calls allowed per caller per window. A deliberate search is one
 *  call; this leaves room for a couple of refinements without allowing a
 *  typing burst even if the typeahead guard were ever bypassed. */
const PER_CALLER = 4;
/** Site-wide ceiling, so a crowd can't do what one typist can't. */
const GLOBAL     = 40;
const WINDOW_MS  = 60_000;

/** Below this, a query is too vague to be worth an upstream call —
 *  PEI's matcher is fuzzy and short strings return the 20-row page cap. */
export const PEI_MIN_QUERY = 4;

/**
 * Jurisdictions no live search can answer, so we don't pretend to try.
 *
 * Canada Business Registries holds ZERO records for any of these — verified
 * by sampling a dozen generic terms across the corpus, which returns only
 * ON, AB, QC, CC, MB, BC, SK, NS. Each of the six runs its own registry that
 * we cannot query: PEI's is blocked to our host (see pei-registry.ts),
 * Newfoundland's CADO and Yukon's YCOR both forbid commercial reuse without
 * written permission, and New Brunswick, NWT and Nunavut have no route at all.
 *
 * Searching them produced the worst experience on the site: a visitor who
 * knew their corporation's exact name and number retyped it twelve times in
 * 57 seconds against an empty index, concluded our search was fussy about
 * punctuation, and left. For these six the honest move is to skip the search
 * and offer the manual lookup we would have to do anyway.
 *
 * Remove an entry the moment that jurisdiction becomes searchable — PEI is
 * the likely first, if its operators unblock us or supply a bulk extract.
 */
export const NO_LIVE_SEARCH = new Set(["pe", "nl", "nb", "nt", "yt", "nu"]);

/** Human name for the registry a person will actually check by hand. */
export const MANUAL_REGISTRY_NAME: Record<string, string> = {
  pe: "PEI Corporate Registry",
  nl: "Newfoundland and Labrador Registry of Companies",
  nb: "New Brunswick Corporate Registry",
  nt: "Northwest Territories Corporate Registry",
  yt: "Yukon Corporate Online Registry",
  nu: "Nunavut Corporate Registry",
};

const perCaller = new Map<string, number[]>();
let globalHits: number[] = [];

function sweep(times: number[], now: number): number[] {
  return times.filter((t) => now > t - WINDOW_MS && t > now - WINDOW_MS);
}

export type PeiBudgetVerdict =
  | { ok: true }
  | { ok: false; reason: "too-short" | "per-caller" | "global" };

/**
 * Take one unit of budget. Call ONLY immediately before a real upstream
 * request — a cache hit must not consume budget, or a popular query would
 * starve everyone else.
 */
export function takePeiBudget(query: string, callerKey: string): PeiBudgetVerdict {
  if (query.trim().length < PEI_MIN_QUERY) return { ok: false, reason: "too-short" };

  const now = Date.now();
  globalHits = sweep(globalHits, now);
  if (globalHits.length >= GLOBAL) return { ok: false, reason: "global" };

  const key  = callerKey || "anon";
  const mine = sweep(perCaller.get(key) ?? [], now);
  if (mine.length >= PER_CALLER) {
    perCaller.set(key, mine);
    return { ok: false, reason: "per-caller" };
  }

  mine.push(now);
  perCaller.set(key, mine);
  globalHits.push(now);

  /* Keep the map from growing without bound on a long-lived instance. */
  if (perCaller.size > 5_000) {
    for (const [k, v] of perCaller) {
      if (sweep(v, now).length === 0) perCaller.delete(k);
      if (perCaller.size <= 2_500) break;
    }
  }
  return { ok: true };
}
