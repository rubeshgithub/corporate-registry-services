import { NextResponse } from "next/server";
import { companies } from "@/lib/registrar-mongo";
import { NO_LIVE_SEARCH, MANUAL_REGISTRY_NAME } from "@/lib/pei-budget";

// ── OrgBook (BC) ────────────────────────────────────────────────────────────

interface OrgBookAttr { type: string; value: string }
interface OrgBookCred {
  names: Array<{ text: string }>;
  topic: { source_id: string };
  attributes: OrgBookAttr[];
}
interface OrgBookResp { total: number; results: OrgBookCred[] }

const ENTITY_LABELS: Record<string, string> = {
  BC: "BC Company",    SP: "Sole Proprietor",        GP: "General Partnership",
  LP: "Limited Partnership", LL: "Limited Liability Partnership",
  A:  "Extraprovincial Company", S: "Society",       BEN: "Benefit Company",
  CP: "Cooperative Association", ULC: "Unlimited Liability Company",
  LLC: "Limited Liability Company", XS: "Extraprovincial Society",
  XP: "Extraprovincial Partnership", PA: "Private Act Company", C: "Continuation In",
};

function oAttr(attrs: OrgBookAttr[], type: string) {
  return attrs.find((a) => a.type === type)?.value ?? "";
}

/**
 * Client-side status filter — server-side filtering isn't supported by either
 * upstream (see docs in /admin/outreach). We bump upstream rows to the API's
 * effective cap (~29) and filter within that window.
 *
 * Vocabulary:
 *   active   — Status_State "Active" and Status_Notes NOT "Pending"
 *   pending  — Status_Notes contains "Pending" (about to be struck)
 *   struck   — Status_Notes contains "Struck" | "DISS" | "Dissolved", OR Status_State "Inactive"
 *   all      — no filter
 */
type StatusFilter = "all" | "active" | "pending" | "struck";

function matchesStatus(
  status: string,        // normalized "Active" | "Inactive"
  statusNotes: string,   // raw Status_Notes / OrgBook status detail
  filter: StatusFilter,
): boolean {
  if (filter === "all") return true;
  const notes = (statusNotes || "").toLowerCase();
  const state = (status || "").toLowerCase();
  if (filter === "active")  return state === "active"  && !notes.includes("pending");
  if (filter === "pending") return notes.includes("pending");
  if (filter === "struck")  return (
    state === "inactive" ||
    notes.includes("struck") ||
    notes.includes("diss") ||
    notes.includes("dissolved") ||
    notes.includes("cancel")
  );
  return true;
}

/**
 * BC ID-like detection. OrgBook's `q` full-text search is strong on names
 * but doesn't reliably index Business Numbers or letter-prefixed BC corp
 * numbers (BC1234567, S1234567, ULC1234567, etc.). When we detect either
 * pattern, we run CBR in parallel — CBR's `keyword` filter searches BN,
 * MRAS_ID, and Juri_ID together, filling the gap.
 */
function looksLikeBCCorpNumber(q: string): boolean {
  /* Modern BC corp numbers: 1-4 letter prefix + 5-10 digits.
   *  Prefixes cover BC, A, S, ULC, LLC, CP, LP, LL, BEN, C, XS, XP, PA. */
  return /^[A-Z]{1,4}[\s-]?\d{5,10}$/i.test(q.trim());
}
function looksLikeBusinessNumber(q: string): boolean {
  /* 9-digit BN, optionally followed by 2-letter + 4-digit program
   *  identifier (BC0001, RC0001, etc.). Whitespace-tolerant. */
  return /^\d{9}([A-Z]{2}\d{4})?$/i.test(q.trim().replace(/\s/g, ""));
}
function normalizeBCId(q: string): string {
  /* "bc 1234567" / "bc-1234567" / "BC1234567" → "BC1234567" */
  return q.trim().replace(/[\s-]/g, "").toUpperCase();
}
function bnForCBRKeyword(q: string): string {
  /* Strip program identifier — CBR keyword filter matches on the 9-digit
   *  BN, not on the full 15-char program-scoped BN. */
  const compact = q.trim().replace(/\s/g, "");
  return compact.length >= 9 ? compact.slice(0, 9) : compact;
}

async function searchOrgBookOnly(q: string, status: StatusFilter): Promise<{ results: ResultShape[]; source: string }> {
  // Bump upstream limit to widen the filterable window. OrgBook typically
  // returns what we ask for (unlike CBR which hard-caps at ~29).
  const url = `https://orgbook.gov.bc.ca/api/v4/search/credential?q=${encodeURIComponent(q)}&page=1&limit=40&format=json`;
  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`OrgBook ${res.status}`);
  const data: OrgBookResp = await res.json();
  const mapped: ResultShape[] = data.results.map((r) => {
    const typeCode  = oAttr(r.attributes, "entity_type");
    const rawStatus = oAttr(r.attributes, "entity_status");
    return {
      name:               r.names[0]?.text ?? "Unknown",
      businessNumber:     "",
      registryId:         r.topic?.source_id ?? "",
      location:           "British Columbia",
      status:             rawStatus === "ACT" ? "Active" : "Inactive",
      statusNotes:        rawStatus === "ACT" ? "Active" : rawStatus,
      entityType:         ENTITY_LABELS[typeCode] ?? typeCode,
      registrationDate:   oAttr(r.attributes, "registration_date").slice(0, 10),
      jurisdiction:       "British Columbia",
      provinceKey:        "bc",
    };
  });
  const filtered = mapped.filter((r) => matchesStatus(r.status, r.statusNotes, status));
  return { source: "orgbook", results: filtered };
}

async function searchBC(q: string, status: StatusFilter) {
  const trimmed = q.trim();
  const isBCId  = looksLikeBCCorpNumber(trimmed);
  const isBN    = looksLikeBusinessNumber(trimmed);
  const idLike  = isBCId || isBN;

  /* Normalize BC IDs so OrgBook full-text has the best chance of matching. */
  const orgbookQuery = isBCId ? normalizeBCId(trimmed) : trimmed;
  const cbrQuery     = isBN   ? bnForCBRKeyword(trimmed) : (isBCId ? normalizeBCId(trimmed) : trimmed);

  const [orgbook, cbrHits] = await Promise.all([
    searchOrgBookOnly(orgbookQuery, status).catch((e) => {
      console.warn("[CRS] BC OrgBook search failed (non-fatal):", e);
      return { source: "orgbook", results: [] as ResultShape[] };
    }),
    /* Only call CBR when we have a real chance of it helping — otherwise
     *  we're paying ~150ms of latency for nothing on a plain name search. */
    idLike
      ? searchCBR(cbrQuery, status, "BC").catch((e) => {
          console.warn("[CRS] BC CBR fallback search failed (non-fatal):", e);
          return { total: 0, source: "cbr", results: [] as ResultShape[] };
        })
      : Promise.resolve({ total: 0, source: "cbr", results: [] as ResultShape[] }),
  ]);

  /* OrgBook wins on registryId conflict — it has fresher BC status data
   *  than CBR's mirror. CBR-only hits (typical for BN lookups) get
   *  appended. */
  const merged = mergeResults(orgbook.results, cbrHits.results, 12);

  return {
    total:  merged.length,
    source: idLike && cbrHits.results.length > 0 ? "orgbook+cbr" : "orgbook",
    results: merged,
  };
}

// ── PEI (Prince Edward Island) ──────────────────────────────────────────────
// Removed from search 2026-09-25. PEI's API (wdf.princeedwardisland.ca) sits
// behind Radware Bot Manager, which answers our server with a 302 to a
// captcha page (validate.perfdrive.com) on every call — three retries per
// explicit Find, all failing, filling the logs. PEI is now handled like the
// other registries we cannot query: a PEI-scoped search widens to the
// national data, and a miss offers the free hand-searched snapshot.

// ── Canada Business Registries (all other provinces) ────────────────────────

interface CBRDoc {
  Company_Name:       string;
  MRAS_ID?:           string;
  BN?:                string;
  Status_State?:      string;
  Status_Notes?:      string;
  Entity_Type?:       string;
  MRAS_Entity_Type?:  string;
  Date_Incorporated?: string;
  Jurisdiction?:      string;
  Registry_Source?:   string;
  Reg_office_city?:   string;
  Reg_office_province?: string;
  City?:              string;
}
interface CBRResp { totalResults: number; count: number; docs: CBRDoc[] }

/* Maps our province keys to CBR's Registry_Source codes.
   Federal is "CC" (Corporations Canada), NOT "CA" — verified against live
   data: "CA" never appears as a Registry_Source, while "CC" carries the
   federal corporations. The old "CA" entry meant a federal search matched
   nothing once results are actually filtered by province.

   Codes CBR genuinely holds records for, sampled across a dozen generic
   terms: ON, AB, QC, CC, MB, BC, SK, NS. The remaining keys below (nb, nl,
   nt, yt, nu) are kept so the jurisdiction stays selectable — the search
   then correctly returns nothing and offers a manual lookup, which beats
   returning another province's companies under their label. */
const PROVINCE_CBR: Record<string, string> = {
  ab: "AB", on: "ON", qc: "QC", mb: "MB", sk: "SK", ns: "NS",
  nb: "NB", nl: "NL", pe: "PE", nt: "NT", yt: "YT",
  nu: "NU", federal: "CC",
};

const CBR_LABEL: Record<string, string> = {
  AB: "Alberta",     ON: "Ontario",            MB: "Manitoba",
  SK: "Saskatchewan", NS: "Nova Scotia",       NB: "New Brunswick",
  NL: "Newfoundland & Labrador", PE: "Prince Edward Island",
  NT: "Northwest Territories",  YT: "Yukon",  NU: "Nunavut",
  BC: "British Columbia",        CA: "Federal", QC: "Quebec",
  /* CBR labels federal records "CC" in BOTH Registry_Source and Jurisdiction,
     so without this the raw code "CC" was shown to visitors as the
     jurisdiction of every federal corporation. */
  CC: "Federal",
};

async function searchCBR(q: string, status: StatusFilter, provinceCode?: string) {
  // CBR hard-caps at ~29 regardless of what we ask for — asking for 40 doesn't
  // hurt, and gives us the maximum filterable window.
  let url =
    `https://ised-isde.canada.ca/cbr/srch/api/v1/search` +
    `?fq=keyword:%7B${encodeURIComponent(q)}%7D` +
    `&lang=en&queryaction=fieldquery&sortfield=score&sortorder=desc&rows=40&start=0`;

  if (provinceCode) url += `&fq=Registry_Source:${provinceCode}`;

  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`CBR API ${res.status}`);
  const data: CBRResp = await res.json();

  const mapped = (data.docs ?? []).map((d) => {
    const src      = d.Registry_Source ?? "";
    const city     = d.Reg_office_city ?? d.City ?? "";
    const prov     = d.Reg_office_province ?? "";
    const location = [city, prov].filter(Boolean).join(", ");
    return {
      name:             d.Company_Name ?? "Unknown",
      businessNumber:   d.BN ?? "",
      registryId:       (d.MRAS_ID ?? "").replace(/^[A-Z]+_/, ""),
      location:         location,
      status:           d.Status_State === "Active" ? "Active" : "Inactive",
      statusNotes:      d.Status_Notes ?? "",
      entityType:       d.Entity_Type ?? d.MRAS_Entity_Type ?? "",
      registrationDate: d.Date_Incorporated?.slice(0, 10) ?? "",
      /* CBR's Jurisdiction field is a raw two-letter code ("ON", "BC", "CC"),
         not a label, and it used to win this ?? chain — so every CBR result
         showed a bare code while BC/PEI results (which set a full name)
         showed "British Columbia". Resolve through CBR_LABEL first so the
         jurisdiction column reads the same whichever source answered. */
      jurisdiction:     CBR_LABEL[d.Jurisdiction ?? ""] ?? CBR_LABEL[src] ?? d.Jurisdiction ?? src,
      provinceKey:      (src === "CC" || src === "CA") ? "federal" : src.toLowerCase(),
    };
  });

  /* Province filtering happens HERE, not upstream. The `&fq=Registry_Source:XX`
     appended to the query URL is silently ignored by CBR — verified: identical
     totalResults, identical doc counts and an identical jurisdiction spread
     with and without it. Left on the URL in case CBR ever honours it; it is
     harmless, but it is not what narrows the results.

     Without this filter, picking a province returned that province's label on
     a list of other provinces' companies. Worst for the five jurisdictions CBR
     holds no records for at all (NB, NL, NT, YT, NU): every one of them
     returned the same unfiltered Ontario-heavy list. CBR's real coverage,
     sampled across a dozen generic terms, is ON, AB, QC, CC, MB, BC, SK, NS.

     Filtering here means those five now correctly return nothing — which is
     the honest answer, and which surfaces the "can't find it? call us" offer
     instead of a wrong one. */
  const inProvince = provinceCode
    ? mapped.filter((r) => {
        /* provinceKey is "federal" for CBR's "CC" source, so map it back to
           the registry code before comparing — comparing "FEDERAL" (or the
           historic "CA") against provinceCode "CC" would drop every federal
           corporation from a federal search. */
        const code = r.provinceKey === "federal" ? "CC" : r.provinceKey.toUpperCase();
        return code === provinceCode;
      })
    : mapped;

  const filtered = inProvince.filter((r) => matchesStatus(r.status, r.statusNotes, status));

  return {
    /* `total` can only be the upstream corpus count for an unfiltered,
       unnarrowed search. The moment we filter by province or status the
       upstream number describes a different set than the one we return, so
       report what we actually matched in the fetched window. */
    total:  status === "all" && !provinceCode
      ? (data.totalResults ?? data.count ?? 0)
      : filtered.length,
    source: "cbr",
    results: filtered.slice(0, 12),
  };
}

// ── Local gazette-DB (Alberta corps + Alberta Societies) ────────────────────
//
// The upstream CBR API only exposes corporations under the Alberta Business
// Corporations Act — Alberta Societies (registered under the Societies Act)
// are NOT there. Our gazette-ingested `crs.companies` collection DOES have
// them (~18k Society docs). We merge local hits into every Alberta / all-
// province search so society docs like "EMPIRE FIELD HOCKEY CLUB" surface
// alongside corporations.
//
// The local search runs in parallel with CBR — its added latency is bounded
// by two indexed queries against Atlas.

type ResultShape = {
  name:             string;
  businessNumber:   string;
  registryId:       string;
  location:         string;
  status:           string;
  statusNotes:      string;
  entityType:       string;
  registrationDate: string;
  jurisdiction:     string;
  provinceKey:      string;
};

const LOCAL_ACTIVE_STATUSES = new Set(["Incorporated", "Registered", "Revived", "Renamed"]);
const LOCAL_STRUCK_STATUSES = new Set(["Dissolved/Struck Off"]);
const LOCAL_PENDING_STATUSES = new Set(["Liable For Dissolution", "Intent To Dissolve"]);

function escRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function searchLocalAB(q: string, status: StatusFilter, limit = 20): Promise<ResultShape[]> {
  const col = await companies();
  const isNumeric = /^\d+$/.test(q);
  const upper = q.toUpperCase();
  const projection = { name: 1, entityType: 1, status: 1, address: 1, firstEventDate: 1 } as const;

  /* Assemble candidate _ids from the same two-strategy pattern as
     /api/registrar/search. Order matters — earlier hits take precedence
     via the Map deduping on _id. */
  const found = new Map<string, Record<string, unknown>>();

  if (isNumeric) {
    const exact = await col.findOne({ _id: q }, { projection });
    if (exact) found.set(String(exact._id), exact);
    if (found.size < limit) {
      const prefix = await col.find(
        { _id: { $regex: `^${escRegex(q)}` } },
        { projection },
      ).limit(limit).toArray();
      for (const h of prefix) if (!found.has(String(h._id))) found.set(String(h._id), h);
    }
  } else {
    const prefix = await col.find(
      { nameNorm: { $regex: `^${escRegex(upper)}` } },
      { projection },
    ).limit(limit).toArray();
    for (const h of prefix) if (!found.has(String(h._id))) found.set(String(h._id), h);

    if (found.size < limit) {
      try {
        const textHits = await col.find(
          { $text: { $search: q } },
          { projection: { ...projection, score: { $meta: "textScore" } } },
        )
          .sort({ score: { $meta: "textScore" } })
          .limit(limit)
          .toArray();
        for (const h of textHits) if (!found.has(String(h._id))) found.set(String(h._id), h);
      } catch {
        /* text index unavailable — prefix already gave us results */
      }
    }
  }

  /* Map to the shared ResultShape + apply the status filter using the
     gazette-derived state.derived field. Skip name-only shell docs (no
     corp number = no way for the operator to place an order downstream). */
  const rows: ResultShape[] = [];
  for (const doc of found.values()) {
    const id = String(doc._id ?? "");
    if (id.startsWith("name:")) continue;

    const d = doc as {
      _id: string; name?: string; entityType?: string;
      status?: { derived?: string };
      address?: { city?: string };
      firstEventDate?: Date | string | null;
    };

    const derived = d.status?.derived ?? "";
    const statusState =
      LOCAL_ACTIVE_STATUSES.has(derived)  ? "Active"   :
      LOCAL_STRUCK_STATUSES.has(derived)  ? "Inactive" :
      LOCAL_PENDING_STATUSES.has(derived) ? "Active"   :   // still on registry but pending
                                            "Active";       // Amalgamated etc.

    if (!matchesStatus(statusState, derived, status)) continue;

    const regDate = d.firstEventDate
      ? (d.firstEventDate instanceof Date ? d.firstEventDate.toISOString() : String(d.firstEventDate)).slice(0, 10)
      : "";

    rows.push({
      name:             d.name ?? "Unknown",
      businessNumber:   "",                        // Societies + gazette-only corps don't carry a BN
      registryId:       id,
      location:         d.address?.city ?? "",
      status:           statusState,
      statusNotes:      derived,
      entityType:       d.entityType ?? "",
      registrationDate: regDate,
      jurisdiction:     "Alberta",
      provinceKey:      "ab",
    });
  }
  return rows.slice(0, limit);
}

/**
 * Keep only the rows that actually contain the number the visitor typed.
 *
 * Searching "2682736 alberta inc" returned eleven rows: the right company
 * first, then "1003534 ALBERTA LIMITED", "ALBERTA INC.", "ALBERTA'S OWN
 * INC." and seven more — CBR matching the word "alberta" and ignoring the
 * number that identifies precisely one corporation. The exact hit was there,
 * buried in noise, which reads as a broken search.
 *
 * So when a query carries a registry-number-shaped token (6+ digits) and any
 * row contains it, that subset IS the answer. If nothing matches the number
 * we return the fuzzy list untouched — the number may be a typo, or from a
 * jurisdiction we don't hold, and a wrong list beats an empty one.
 */
function preferNumberMatches(q: string, rows: ResultShape[]): { rows: ResultShape[]; hadNumber: boolean; matchedNumber: boolean } {
  const tokens = q.match(/\d{6,}/g);
  if (!tokens?.length) return { rows, hadNumber: false, matchedNumber: false };

  const hits = rows.filter((r) => {
    const hay = `${r.name} ${r.registryId} ${r.businessNumber}`.replace(/[^0-9]/g, " ");
    return tokens.some((t) => hay.includes(t));
  });
  return {
    rows: hits.length > 0 ? hits : rows,
    hadNumber: true,
    matchedNumber: hits.length > 0,
  };
}

/** Merge local Mongo results into CBR results. CBR is the source of truth
 *  for corporations (fresher status), so we keep CBR docs when both sources
 *  have the same registryId. Local-only hits (societies + brand-new corps
 *  the gazette caught before CBR) get appended. */
function mergeResults(cbr: ResultShape[], local: ResultShape[], cap: number): ResultShape[] {
  const seen = new Set(cbr.map((r) => r.registryId).filter(Boolean));
  const merged = [...cbr];
  for (const l of local) {
    if (l.registryId && seen.has(l.registryId)) continue;
    merged.push(l);
    if (merged.length >= cap) break;
  }
  return merged;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q        = searchParams.get("q")?.trim() ?? "";
  const province = searchParams.get("province") ?? "all";
  const rawStatus = searchParams.get("status") ?? "all";
  const status: StatusFilter =
    rawStatus === "active" || rawStatus === "pending" || rawStatus === "struck" ? rawStatus : "all";


  if (q.length < 2) return NextResponse.json({ results: [], total: 0 });

  /* Six jurisdictions have no searchable index (see NO_LIVE_SEARCH). Don't
     refuse outright, though: we do NOT know the corporation is from there.
     The province is either a dropdown choice or — on a jurisdiction service
     page — an assumption the page made, and a visitor reading the
     Newfoundland good-standing page may well be looking up an Ontario
     company. Narrowing to an empty index would hide a corporation we can
     actually find.
     So widen to all of Canada and search for real. If something comes back,
     it is their company and the jurisdiction question was moot. If nothing
     does, `noLiveSearch` tells the client to explain which registry we
     cannot reach, rather than implying no such corporation exists. */
  const noLiveIndex = NO_LIVE_SEARCH.has(province);
  const searchProvince = noLiveIndex ? "all" : province;
  const noLiveExtras = noLiveIndex
    ? { noLiveSearch: true, registryName: MANUAL_REGISTRY_NAME[province] ?? "that registry" }
    : {};

  try {
    if (searchProvince === "bc") {
      return NextResponse.json(await searchBC(q, status));
    }
    const cbrCode = searchProvince === "all" ? undefined : PROVINCE_CBR[searchProvince];

    /* For Alberta and all-province searches, merge local gazette DB results
       in so Alberta Societies (and other entity types CBR doesn't expose)
       surface. Runs in parallel with the CBR fetch (~50-150ms Atlas).
       CBR has no PEI records and PEI's own API is not queried (see above). */
    const includeLocalAB = searchProvince === "ab" || searchProvince === "all";
    const [cbrResp, localAB] = await Promise.all([
      searchCBR(q, status, cbrCode),
      includeLocalAB ? searchLocalAB(q, status, 12).catch((e) => {
        console.warn("[CRS] local AB search failed (non-fatal):", e);
        return [] as ResultShape[];
      }) : Promise.resolve([] as ResultShape[]),
    ]);

    const hasLocalAB = includeLocalAB && localAB.length > 0;
    if (!hasLocalAB) {
      const ranked = preferNumberMatches(q, cbrResp.results);
      /* Widened off a no-index jurisdiction, the query named a specific
         corporation by number, and nothing carries that number: these rows
         merely share a word with the query ("newfoundland and labrador"
         matched eleven companies that were not the one asked for). Report
         nothing found, so the offer to look it up by hand is what shows. */
      const missed = noLiveIndex && ranked.hadNumber && !ranked.matchedNumber;
      const only   = missed ? [] : ranked.rows;
      return NextResponse.json({
        ...cbrResp,
        results: only,
        total:   only.length === cbrResp.results.length ? cbrResp.total : only.length,
        ...noLiveExtras,
      });
    }

    let merged = cbrResp.results;
    if (hasLocalAB) merged = mergeResults(merged, localAB, 20);
    const rankedMerged = preferNumberMatches(q, merged);
    merged = (noLiveIndex && rankedMerged.hadNumber && !rankedMerged.matchedNumber) ? [] : rankedMerged.rows;

    const sourceParts: string[] = ["cbr"];
    if (hasLocalAB) sourceParts.push("gazette");

    return NextResponse.json({
      ...cbrResp,
      results:      merged,
      total:        merged.length,
      source:       sourceParts.join("+"),
      localMatches: hasLocalAB ? localAB.length : undefined,
      ...noLiveExtras,
    });
  } catch (err) {
    console.error("[CRS] company-search error:", err);
    return NextResponse.json({ error: "Search temporarily unavailable" }, { status: 502 });
  }
}
