import { NextResponse } from "next/server";

interface OrgBookAttr  { type: string; value: string; format: string }
interface OrgBookName  { text: string; language: string }
interface OrgBookCred  {
  names: OrgBookName[];
  topic: { source_id: string };
  attributes: OrgBookAttr[];
  inactive: boolean;
}
interface OrgBookResp  { total: number; results: OrgBookCred[] }

const ENTITY_LABELS: Record<string, string> = {
  BC: "BC Company", SP: "Sole Proprietor", GP: "General Partnership",
  LP: "Limited Partnership", LL: "Limited Liability Partnership",
  A: "Extraprovincial Company", S: "Society", BEN: "Benefit Company",
  CP: "Cooperative Association", ULC: "Unlimited Liability Company",
  LLC: "Limited Liability Company", XP: "Extraprovincial Partnership",
  XS: "Extraprovincial Society", PA: "Private Act Company", C: "Continuation In",
};

function attr(attrs: OrgBookAttr[], type: string) {
  return attrs.find((a) => a.type === type)?.value ?? "";
}

async function searchBC(q: string) {
  const url = `https://orgbook.gov.bc.ca/api/v4/search/credential?q=${encodeURIComponent(q)}&page=1&limit=12&format=json`;
  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`OrgBook ${res.status}`);
  const data: OrgBookResp = await res.json();
  return {
    total: data.total,
    results: data.results.map((r) => {
      const typeCode = attr(r.attributes, "entity_type");
      return {
        name:               r.names[0]?.text ?? "Unknown",
        registrationNumber: r.topic?.source_id ?? "",
        status:             attr(r.attributes, "entity_status") === "ACT" ? "Active" : "Inactive",
        entityType:         ENTITY_LABELS[typeCode] ?? typeCode,
        registrationDate:   attr(r.attributes, "registration_date").slice(0, 10),
        jurisdiction:       "British Columbia",
        provinceKey:        "bc",
      };
    }),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q        = searchParams.get("q")?.trim() ?? "";
  const province = searchParams.get("province") ?? "all";

  if (q.length < 2) return NextResponse.json({ results: [], total: 0 });

  try {
    if (province === "bc" || province === "all") {
      const data = await searchBC(q);
      return NextResponse.json(data);
    }
    return NextResponse.json({ results: [], total: 0, comingSoon: true });
  } catch (err) {
    console.error("[CRS] company-search error:", err);
    return NextResponse.json({ error: "Search temporarily unavailable" }, { status: 502 });
  }
}
