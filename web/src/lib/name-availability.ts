import { companies } from "./registrar-mongo";
import { searchPei } from "./pei-registry";

/**
 * Free "Instant Availability Check" — best-effort search across the
 * registries we have live access to, before the user commits to a paid
 * NUANS report.
 *
 * Coverage:
 *   - CBR (Canada Business Registries, ised-isde.canada.ca) — federal +
 *     several participating provinces. Optionally scoped by Registry_Source.
 *   - Local Alberta `companies` collection — the AB gazette corpus we've
 *     ingested. Complements CBR for AB.
 *
 * This is intentionally more permissive than a real NUANS report (which
 * does phonetic + orthographic + trademark-adjacent matching). The point
 * is to (a) surface obviously-taken names as a courtesy filter, and (b)
 * push clean names toward the paid NUANS order with confidence.
 */

const CBR_SEARCH_URL = "https://ised-isde.canada.ca/cbr/srch/api/v1/search";
const CBR_ROWS       = 50;
const CBR_UA         = "CRS-nameavail/1.0 (+https://www.corporateregistryservices.ca)";
const REQUEST_TIMEOUT_MS = 8_000;

/** Strength classification threshold — flip to weak when we cross this. */
const WEAK_THRESHOLD = 5;

export type Scope = "all" | "federal" | "bc" | "ab" | "pe";

export type NameMatch = {
  name:         string;
  jurisdiction: string;         // human label ("Federal", "British Columbia", "Alberta", etc.)
  registryId:   string;
  status:       string;         // free-text ("Active", "Dissolved", "")
};

export type AvailabilityResult = {
  strength:      "strong" | "moderate" | "weak";
  matchCount:    number;
  matches:       NameMatch[];   // up to 10 most relevant
  scopeLabel:    string;        // human-readable scope that was checked
  coverageNote?: string;        // "Coverage limited to X" when scope is broader than we can serve
};

/* ═══════════════════════════ Public entrypoint ═══════════════════════════ */

export async function checkNameAvailability(name: string, scope: Scope): Promise<AvailabilityResult> {
  const norm = normalizeDistinctive(name);
  if (norm.length === 0) {
    return { strength: "strong", matchCount: 0, matches: [], scopeLabel: scopeToLabel(scope) };
  }

  const [cbrHits, abHits, peiHits] = await Promise.all([
    /* CBR doesn't include PE — skip when scope is pe-only. */
    scope === "pe"
      ? Promise.resolve([] as NameMatch[])
      : fetchCbr(name, scope).catch(() => [] as NameMatch[]),
    (scope === "all" || scope === "ab")
      ? fetchLocalAlberta(name).catch(() => [] as NameMatch[])
      : Promise.resolve([] as NameMatch[]),
    (scope === "all" || scope === "pe")
      ? fetchPei(name).catch(() => [] as NameMatch[])
      : Promise.resolve([] as NameMatch[]),
  ]);

  const relevant = dedupe([...cbrHits, ...abHits, ...peiHits])
    .filter((m) => isDistinctiveOverlap(m.name, norm));

  const matchCount = relevant.length;
  const strength: AvailabilityResult["strength"] =
    matchCount === 0            ? "strong"
    : matchCount < WEAK_THRESHOLD ? "moderate"
    : "weak";

  return {
    strength,
    matchCount,
    matches:      relevant.slice(0, 10),
    scopeLabel:   scopeToLabel(scope),
    coverageNote: coverageNoteFor(scope),
  };
}

/* ═══════════════════════════ CBR search ═══════════════════════════ */

async function fetchCbr(name: string, scope: Scope): Promise<NameMatch[]> {
  const params = new URLSearchParams({
    fq:          `keyword:{${name}}`,
    lang:        "en",
    queryaction: "fieldquery",
    rows:        String(CBR_ROWS),
    start:       "0",
  });
  const src = scopeToCbrRegistrySource(scope);
  if (src) params.append("fq", `Registry_Source:${src}`);

  const url = `${CBR_SEARCH_URL}?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal:  controller.signal,
      headers: { "User-Agent": CBR_UA, "Accept": "application/json" },
      cache:   "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { docs?: Array<Record<string, unknown>> };
    const docs = Array.isArray(data.docs) ? data.docs : [];
    return docs.map(cbrDocToMatch).filter((m) => !!m.name);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function cbrDocToMatch(d: Record<string, unknown>): NameMatch {
  const rawJurisdiction = String(d.Registry_Source ?? d.Jurisdiction ?? "");
  return {
    name:         String(d.Company_Name ?? d.Entity_Name ?? "").trim(),
    jurisdiction: registrySourceToLabel(rawJurisdiction) || rawJurisdiction || "Canada",
    registryId:   String(d.MRAS_ID ?? d.Juri_ID ?? "").replace(/^[A-Z]{2}_/, ""),
    status:       String(d.Status_State ?? "").trim(),
  };
}

function scopeToCbrRegistrySource(scope: Scope): string | null {
  switch (scope) {
    case "all":     return null;
    case "federal": return "CD";
    case "bc":      return "BC";
    case "ab":      return "AB";
    case "pe":      return null;    // CBR doesn't include PE — this branch is guarded upstream and never called
  }
}

function registrySourceToLabel(src: string): string {
  const map: Record<string, string> = {
    CD: "Federal",
    AB: "Alberta",
    BC: "British Columbia",
    SK: "Saskatchewan",
    MB: "Manitoba",
    ON: "Ontario",
    QC: "Quebec",
    NB: "New Brunswick",
    NS: "Nova Scotia",
    NL: "Newfoundland and Labrador",
    PE: "Prince Edward Island",
    YT: "Yukon",
    NT: "Northwest Territories",
    NU: "Nunavut",
  };
  return map[src] ?? "";
}

function scopeToLabel(scope: Scope): string {
  switch (scope) {
    case "all":     return "Canada (federal + participating provinces)";
    case "federal": return "Federal (Corporations Canada)";
    case "bc":      return "British Columbia";
    case "ab":      return "Alberta";
    case "pe":      return "Prince Edward Island";
  }
}

function coverageNoteFor(scope: Scope): string | undefined {
  if (scope !== "all") return undefined;
  return "Instant check covers federal + BC + Alberta + PEI live registries. For the full national coverage (all 13 provinces + territories + trademarks + phonetic similarity), order the paid NUANS report below.";
}

/* ═══════════════════════════ PEI search ═══════════════════════════ */

async function fetchPei(name: string): Promise<NameMatch[]> {
  try {
    const { results } = await searchPei(name);
    return results
      .filter((r) => !!r.name)
      .map((r) => ({
        name:         r.name ?? "",
        jurisdiction: "Prince Edward Island",
        registryId:   r.entityId ?? "",
        status:       r.status ?? "",
      }));
  } catch {
    return [];
  }
}

/* ═══════════════════════════ Local AB search ═══════════════════════════ */

async function fetchLocalAlberta(name: string): Promise<NameMatch[]> {
  const upper = name.trim().toUpperCase();
  if (upper.length < 2) return [];

  try {
    const col = await companies();
    /* nameNorm prefix — cheap, index-friendly. Doesn't catch mid-name
     *  matches, but that's OK: this pass complements CBR, and CBR does
     *  the broader text search across all fields. */
    const hits = await col.find(
      { nameNorm: { $regex: `^${escapeRegex(upper)}` } },
      { projection: { name: 1, _id: 1, "status.derived": 1 } },
    ).limit(50).toArray();

    return hits.map((h) => ({
      name:         String(h.name ?? "").trim(),
      jurisdiction: "Alberta",
      registryId:   String(h._id ?? "").replace(/^name:/, ""),
      status:       String(h.status?.derived ?? ""),
    })).filter((m) => !!m.name);
  } catch {
    return [];
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ═══════════════════════════ Matching + normalization ═════════════════ */

/** Extract the distinctive tokens from a name: lowercase, no punctuation,
 *  no legal suffix, no leading "the", common generic descriptor words
 *  intentionally KEPT (they're part of what the registrar checks). */
export function normalizeDistinctive(s: string): string {
  const suffixes = [
    "corporation", "corporations", "incorporated",
    "inc.", "inc", "ltd.", "ltd", "limited",
    "corp.", "corp", "llc", "llp", "l.l.c.", "l.l.p.",
    "ulc", "u.l.c.",
    "ltée", "ltee", "société", "societe", "cie",
    "co.", "co",
  ];

  let out = s.toLowerCase().trim();
  out = out.replace(/^the\s+/i, "");
  out = out.replace(/[.,;:'"“”‘’()\[\]/&+]/g, " ");
  out = out.replace(/\s+/g, " ").trim();

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

/** Two names "overlap distinctively" if either:
 *   - Their normalized forms are identical
 *   - One's normalized form contains all of the other's (order-agnostic)
 *  This is a much looser match than real NUANS but catches the obvious
 *  cases (which is what a free pre-check should do). */
export function isDistinctiveOverlap(candidateName: string, queryNorm: string): boolean {
  const candNorm = normalizeDistinctive(candidateName);
  if (candNorm.length === 0 || queryNorm.length === 0) return false;
  if (candNorm === queryNorm) return true;

  const candTokens  = new Set(candNorm.split(" ").filter((t) => t.length >= 2));
  const queryTokens = queryNorm.split(" ").filter((t) => t.length >= 2);
  if (queryTokens.length === 0) return false;

  /* Every query token must appear in the candidate — this is the
   *  "candidate contains query" test. Also test the reverse. */
  const containsQuery = queryTokens.every((t) => candTokens.has(t));
  if (containsQuery) return true;

  const queryTokenSet = new Set(queryTokens);
  const containsCandidate =
    candNorm.split(" ").every((t) => t.length < 2 || queryTokenSet.has(t));
  return containsCandidate && candNorm.split(" ").length > 0;
}

function dedupe(matches: NameMatch[]): NameMatch[] {
  const seen = new Set<string>();
  const out: NameMatch[] = [];
  for (const m of matches) {
    const key = `${normalizeDistinctive(m.name)}|${m.jurisdiction}|${m.registryId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}
