import { NextResponse } from "next/server";
import { searchCompanies } from "@/lib/company-search-core";
import { guardSearch } from "@/lib/search-api-guard";

/**
 * Public company search, used by the site's own lookup widgets and order forms. The search lives in
 * lib/company-search-core.ts; this route puts the abuse guard in front (lib/search-api-guard.ts, owner Oct 31 2026):
 * our own pages only, per-connection limits, a cleaned query and at most MAX_RESULTS rows.
 */

const MAX_RESULTS = 25;
const MAX_QUERY = 120;

export async function GET(request: Request) {
  const url = new URL(request.url);
  /* Wildcards and runs of punctuation do nothing useful for a company name and are how a list gets enumerated. */
  const q = (url.searchParams.get("q") ?? "").replace(/[*%?_\\]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
  /* At least two letters or digits: one character matches half the registry. */
  if ((q.match(/[\p{L}\p{N}]/gu) ?? []).length < 2) return NextResponse.json({ results: [], total: 0 });

  const verdict = guardSearch(request, q);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: verdict.message, results: [], total: 0 },
      { status: verdict.status, headers: verdict.retryAfterS ? { "Retry-After": String(verdict.retryAfterS) } : undefined },
    );
  }

  url.searchParams.set("q", q);
  const res = await searchCompanies(new Request(url.toString(), { headers: request.headers }));
  if (!res.ok) return res;
  const body = await res.json() as { results?: unknown[]; total?: number } & Record<string, unknown>;
  if (Array.isArray(body.results) && body.results.length > MAX_RESULTS) {
    body.results = body.results.slice(0, MAX_RESULTS);
  }
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
