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

async function searchBC(q: string) {
  const url = `https://orgbook.gov.bc.ca/api/v4/search/credential?q=${encodeURIComponent(q)}&page=1&limit=12&format=json`;
  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`OrgBook ${res.status}`);
  const data: OrgBookResp = await res.json();
  return {
    total: data.total,
    source: "orgbook",
    results: data.results.map((r) => {
      const typeCode = oAttr(r.attributes, "entity_type");
      const status   = oAttr(r.attributes, "entity_status");
      return {
        name:               r.names[0]?.text ?? "Unknown",
        businessNumber:     "",
        registryId:         r.topic?.source_id ?? "",
        location:           "British Columbia",
        status:             status === "ACT" ? "Active" : "Inactive",
        statusNotes:        status === "ACT" ? "Active" : status,
        entityType:         ENTITY_LABELS[typeCode] ?? typeCode,
        registrationDate:   oAttr(r.attributes, "registration_date").slice(0, 10),
        jurisdiction:       "British Columbia",
        provinceKey:        "bc",
      };
    }),
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

async function searchCBR(q: string, provinceCode?: string) {
  let url =
    `https://ised-isde.canada.ca/cbr/srch/api/v1/search` +
    `?fq=keyword:%7B${encodeURIComponent(q)}%7D` +
    `&lang=en&queryaction=fieldquery&sortfield=score&sortorder=desc&rows=12&start=0`;

  if (provinceCode) url += `&fq=Registry_Source:${provinceCode}`;

  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`CBR API ${res.status}`);
  const data: CBRResp = await res.json();

  return {
    total:  data.totalResults ?? data.count ?? 0,
    source: "cbr",
    results: (data.docs ?? []).map((d) => {
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
    }),
  };
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q        = searchParams.get("q")?.trim() ?? "";
  const province = searchParams.get("province") ?? "all";

  if (q.length < 2) return NextResponse.json({ results: [], total: 0 });

  try {
    if (province === "bc") {
      return NextResponse.json(await searchBC(q));
    }
    const cbrCode = province === "all" ? undefined : PROVINCE_CBR[province];
    return NextResponse.json(await searchCBR(q, cbrCode));
  } catch (err) {
    console.error("[CRS] company-search error:", err);
    return NextResponse.json({ error: "Search temporarily unavailable" }, { status: 502 });
  }
}
