import { NextResponse } from "next/server";

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

async function searchBC(q: string, status: StatusFilter) {
  // Bump upstream limit to widen the filterable window. OrgBook typically
  // returns what we ask for (unlike CBR which hard-caps at ~29).
  const url = `https://orgbook.gov.bc.ca/api/v4/search/credential?q=${encodeURIComponent(q)}&page=1&limit=40&format=json`;
  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`OrgBook ${res.status}`);
  const data: OrgBookResp = await res.json();
  const mapped = data.results.map((r) => {
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
  return {
    total:  filtered.length,
    source: "orgbook",
    results: filtered.slice(0, 12),
  };
}

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

const PROVINCE_CBR: Record<string, string> = {
  ab: "AB", on: "ON", mb: "MB", sk: "SK", ns: "NS",
  nb: "NB", nl: "NL", pe: "PE", nt: "NT", yt: "YT",
  nu: "NU", federal: "CA",
};

const CBR_LABEL: Record<string, string> = {
  AB: "Alberta",     ON: "Ontario",            MB: "Manitoba",
  SK: "Saskatchewan", NS: "Nova Scotia",       NB: "New Brunswick",
  NL: "Newfoundland & Labrador", PE: "Prince Edward Island",
  NT: "Northwest Territories",  YT: "Yukon",  NU: "Nunavut",
  BC: "British Columbia",        CA: "Federal", QC: "Quebec",
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
      jurisdiction:     d.Jurisdiction ?? CBR_LABEL[src] ?? src,
      provinceKey:      src === "CA" ? "federal" : src.toLowerCase(),
    };
  });

  const filtered = mapped.filter((r) => matchesStatus(r.status, r.statusNotes, status));

  return {
    // When a status filter is active, `total` reflects post-filter matches in
    // the fetched window — not the full CBR corpus — because the upstream
    // total is meaningless once we've narrowed by an unindexed field.
    total:  status === "all" ? (data.totalResults ?? data.count ?? 0) : filtered.length,
    source: "cbr",
    results: filtered.slice(0, 12),
  };
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

  try {
    if (province === "bc") {
      return NextResponse.json(await searchBC(q, status));
    }
    const cbrCode = province === "all" ? undefined : PROVINCE_CBR[province];
    return NextResponse.json(await searchCBR(q, status, cbrCode));
  } catch (err) {
    console.error("[CRS] company-search error:", err);
    return NextResponse.json({ error: "Search temporarily unavailable" }, { status: 502 });
  }
}
