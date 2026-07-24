/**
 * Third-party business-directory lookup.
 *
 * Source: the public JSON endpoint that powers dnb.com's own business-
 * directory search UI. No API key required. Undocumented and unversioned —
 * treat every call as best-effort; failures should degrade gracefully to
 * "no additional data available" rather than surface errors to the user.
 *
 * Scope: Canadian corporations only. Results outside Canada are dropped
 * at the fetch layer so the admin picker never has to reason about them
 * and the public profile page can never accidentally show a US business's
 * address for a Canadian corp.
 *
 * Match logic:
 *   1. Fetch by company name
 *   2. Filter to companyCountry === "Canada"
 *   3. Normalize both sides (strip corp suffixes, leading "The", punct)
 *   4. Classify as "identical" or "substring" match
 *   5. Return up to 3 candidates for admin picker
 *
 * The admin then picks one (or clicks "none of these match" — cached as
 * matched:false for 90d so we don't re-fetch and re-show the same
 * irrelevant candidate).
 *
 * Deliberately no branding of the source anywhere — internal file name is
 * dnb-live for developer navigation, but the UI labels everything as
 * "Other Data".
 */

const SEARCH_URL =
  "https://www.dnb.com/business-directory/api/companysearch";

const REQUEST_TIMEOUT_MS = 8_000;
const MAX_CANDIDATES     = 3;

/* ── Public types ─────────────────────────────────────────── */

export type OtherDataCandidate = {
  name:         string;
  address:      string;
  city:         string;
  region:       string;
  country:      string;
  postalCode:   string;
  industry:     string;
  locationType: string;
  /** "identical" = normalized names are equal; "substring" = one contains
   *  the other or share a meaningful substring. Both are shown to the
   *  admin; identical gets highlighted as a stronger recommendation. */
  matchStrength: "identical" | "substring";
};

export type OtherDataFetch =
  | { status: "candidates"; candidates: OtherDataCandidate[] }
  | { status: "no_match"; reason: "empty_response" | "no_canadian_results" }
  | { status: "error";    reason: string };

/* ── Raw shape returned by the search endpoint ────────────── */

type RawResult = {
  primaryName?:      string;
  companyAddress?:   string;
  companyCity?:      string;
  companyRegion?:    string;
  companyCountry?:   string;
  companyZipCode?:   string;
  industryName?:     string;
  locationType?:     string;
};

type RawResponse = {
  companies?:            RawResult[];
  totalMatchedResults?:  number;
};

/* ── Public entrypoint ────────────────────────────────────── */

export async function fetchOtherData(name: string): Promise<OtherDataFetch> {
  const trimmed = name.trim();
  if (!trimmed) return { status: "error", reason: "Empty company name." };

  const url = `${SEARCH_URL}?companyname=${encodeURIComponent(trimmed)}`
            + `&languagecode=site&pagenumber=1&pagesize=25&returnnav=true`;

  let raw: RawResponse;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: {
          /* Send a browser-like Accept so the endpoint returns JSON. The
             endpoint sometimes 404s under bare requests without one. */
          "Accept":     "application/json, text/plain, */*",
          "User-Agent": "Mozilla/5.0 (compatible; CRS-otherdata/1.0)",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      return { status: "error", reason: `HTTP ${res.status}` };
    }
    raw = (await res.json()) as RawResponse;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown fetch error";
    return { status: "error", reason: msg };
  }

  const results = Array.isArray(raw.companies) ? raw.companies : [];
  if (results.length === 0) {
    return { status: "no_match", reason: "empty_response" };
  }

  const canadianOnly = results.filter((r) => (r.companyCountry ?? "").toLowerCase() === "canada");
  if (canadianOnly.length === 0) {
    return { status: "no_match", reason: "no_canadian_results" };
  }

  const searchNorm = normalizeName(trimmed);
  const ranked = canadianOnly
    .map((r) => toCandidate(r, searchNorm))
    .sort((a, b) => {
      /* Identical matches first, then substring matches, otherwise stable. */
      if (a.matchStrength === b.matchStrength) return 0;
      return a.matchStrength === "identical" ? -1 : 1;
    })
    .slice(0, MAX_CANDIDATES);

  return { status: "candidates", candidates: ranked };
}

/* ── Normalization + candidate shaping ────────────────────── */

/** Strip corporate suffixes, leading "the", punctuation, and lowercase.
 *  Used to compare "The Innerwellness Inc." vs "Innerwellness" without
 *  false negatives. */
export function normalizeName(s: string): string {
  const suffixes = [
    "corporation", "corporations", "incorporated", "incorporated.",
    "inc.", "inc", "ltd.", "ltd", "limited", "corp.", "corp",
    "llc", "llp", "l.l.c.", "l.l.p.",
    "ltée", "ltee", "société", "societe", "cie",
    "co.", "co",
  ];

  let out = s.toLowerCase().trim();
  out = out.replace(/^the\s+/i, "");
  out = out.replace(/[.,;:'"“”‘’()\[\]]/g, " ");
  out = out.replace(/\s+/g, " ").trim();

  /* Drop up to two trailing corp suffixes ("KAD Inc" → "kad";
     "KAD Consulting Services Ltd" → "kad consulting services"). */
  for (let i = 0; i < 2; i++) {
    const parts = out.split(" ");
    if (parts.length < 2) break;
    const tail = parts[parts.length - 1];
    if (suffixes.includes(tail)) {
      parts.pop();
      out = parts.join(" ");
    } else {
      break;
    }
  }

  return out.trim();
}

function toCandidate(r: RawResult, searchNorm: string): OtherDataCandidate {
  const primary = (r.primaryName ?? "").trim();
  const primaryNorm = normalizeName(primary);

  const identical =
    primaryNorm.length > 0 && primaryNorm === searchNorm;
  const substringHit =
    !identical &&
    (primaryNorm.includes(searchNorm) || searchNorm.includes(primaryNorm)) &&
    Math.min(primaryNorm.length, searchNorm.length) >= 4;

  return {
    name:          primary,
    address:       (r.companyAddress ?? "").trim(),
    city:          (r.companyCity ?? "").trim(),
    region:        (r.companyRegion ?? "").trim(),
    country:       (r.companyCountry ?? "").trim(),
    postalCode:    (r.companyZipCode ?? "").trim(),
    industry:      (r.industryName ?? "").trim(),
    locationType:  (r.locationType ?? "").trim(),
    matchStrength: identical ? "identical" : substringHit ? "substring" : "substring",
  };
}
