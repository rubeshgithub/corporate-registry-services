import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { fetchOtherData, type OtherDataCandidate } from "@/lib/dnb-live";
import { companies, lookups, ensureLookupsIndex } from "@/lib/registrar-mongo";

/**
 * POST /api/admin/companies/other-data
 *
 * Admin-triggered third-party public-directory lookup. Mirrors the
 * candidates → picked flow used by /api/admin/outreach/enrich so the
 * operator UX is consistent.
 *
 * Three request/response modes:
 *   1. mode:"cached"     — we already have a picked (or "none matched")
 *                          result for this corp fresh < 90 days. Return
 *                          it and skip the network call.
 *   2. mode:"candidates" — fresh lookup: return up to 3 Canadian matches
 *                          for the operator to choose from. No cache write
 *                          yet — happens on pick or on dismiss.
 *   3. mode:"picked"     — operator picked a candidate (or set matched:false
 *                          via the "None of these match" button). Persist
 *                          to the companies doc + lookups cache.
 *
 * Public visitors never hit this route — the profile page reads the cached
 * result from the companies doc and renders nothing if absent.
 */

export const runtime = "nodejs";

const CACHE_FRESH_MS = 90 * 24 * 3600 * 1000;

type Body = {
  corpNumber?:   string;
  name?:         string;
  /** Operator picked this candidate — persist it. */
  picked?:       OtherDataCandidate;
  /** Operator dismissed all candidates — persist matched:false. */
  noMatch?:      boolean;
  /** Bypass the 90-day cache. */
  forceRefresh?: boolean;
};

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const name       = (body.name ?? "").trim();
  const corpNumber = body.corpNumber?.trim() || undefined;
  if (!name)       return NextResponse.json({ error: "Company name is required." }, { status: 400 });
  if (!corpNumber) return NextResponse.json({ error: "Corp number is required." }, { status: 400 });

  await ensureLookupsIndex();

  /* Mode 3 — operator picked a candidate OR dismissed all. Persist. */
  if (body.picked || body.noMatch) {
    const now = new Date();
    const otherData = body.noMatch
      ? { matched: false, fetchedAt: now }
      : {
          matched:      true,
          name:         body.picked!.name,
          address:      body.picked!.address,
          city:         body.picked!.city,
          region:       body.picked!.region,
          country:      body.picked!.country,
          postalCode:   body.picked!.postalCode,
          industry:     body.picked!.industry,
          locationType: body.picked!.locationType,
          fetchedAt:    now,
        };
    await persist(corpNumber, otherData);
    return NextResponse.json({ mode: "picked", otherData: serialize(otherData) });
  }

  /* Mode 1 — return cached result if fresh, unless force-refresh. */
  if (!body.forceRefresh) {
    const cached = await findCached(corpNumber);
    if (cached) return NextResponse.json({ mode: "cached", otherData: serialize(cached) });
  }

  /* Mode 2 — fresh lookup. Do not persist yet — operator must pick or dismiss. */
  const result = await fetchOtherData(name);
  if (result.status === "error") {
    return NextResponse.json({ mode: "error", error: result.reason }, { status: 502 });
  }
  if (result.status === "no_match") {
    /* Auto-persist matched:false since there was nothing for the operator
     *  to pick. Saves the operator a click and prevents re-fetching. */
    const now = new Date();
    const otherData = { matched: false as const, fetchedAt: now };
    await persist(corpNumber, otherData);
    return NextResponse.json({
      mode:      "no_match",
      reason:    result.reason,
      otherData: serialize(otherData),
    });
  }

  return NextResponse.json({ mode: "candidates", candidates: result.candidates });
}

/* ── helpers ─────────────────────────────────────────────── */

type OtherDataDoc = {
  matched:      boolean;
  name?:        string;
  address?:     string;
  city?:        string;
  region?:      string;
  country?:     string;
  postalCode?:  string;
  industry?:    string;
  locationType?: string;
  fetchedAt:    Date;
};

async function findCached(corpNumber: string): Promise<OtherDataDoc | null> {
  const cache = await lookups();
  const cached = await cache.findOne({ _id: `otherdata:${corpNumber}` });
  if (cached && (Date.now() - cached.fetchedAt.getTime()) < CACHE_FRESH_MS) {
    return { ...(cached.payload as OtherDataDoc), fetchedAt: cached.fetchedAt };
  }
  const company = await (await companies()).findOne({ _id: corpNumber });
  if (company?.otherData?.fetchedAt) {
    const at = company.otherData.fetchedAt instanceof Date
      ? company.otherData.fetchedAt
      : new Date(company.otherData.fetchedAt);
    if (!Number.isNaN(at.getTime()) && (Date.now() - at.getTime()) < CACHE_FRESH_MS) {
      return { ...company.otherData, fetchedAt: at };
    }
  }
  return null;
}

async function persist(corpNumber: string, otherData: OtherDataDoc): Promise<void> {
  const cache = await lookups();
  await cache.replaceOne(
    { _id: `otherdata:${corpNumber}` },
    { source: "otherdata", payload: otherData, fetchedAt: otherData.fetchedAt },
    { upsert: true },
  );
  await (await companies()).updateOne(
    { _id: corpNumber },
    { $set: { otherData } },
  );
}

function serialize(d: OtherDataDoc) {
  return {
    matched:      d.matched,
    name:         d.name         ?? null,
    address:      d.address      ?? null,
    city:         d.city         ?? null,
    region:       d.region       ?? null,
    country:      d.country      ?? null,
    postalCode:   d.postalCode   ?? null,
    industry:     d.industry     ?? null,
    locationType: d.locationType ?? null,
    fetchedAt:    d.fetchedAt.toISOString(),
  };
}
