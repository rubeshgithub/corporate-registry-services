import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  crawlForEmail,
  getPlacesCandidates,
  type EnrichmentResult,
  type PlaceCandidate,
} from "@/lib/registrar-live";
import { companies, lookups, ensureLookupsIndex } from "@/lib/registrar-mongo";
import { isSuppressed } from "@/lib/outreach-mongo";

/**
 * POST /api/admin/outreach/enrich
 *
 * Three response modes depending on request shape:
 *   1. mode:"cached"     — we already have a picked+crawled contact for this
 *                          corp (fresh < 90 days). Return it, skip UI.
 *   2. mode:"candidates" — fresh lookup: return up to 3 Places candidates so
 *                          the operator can pick the right business. No
 *                          website crawl yet — happens on pick.
 *   3. mode:"picked"     — operator sent us a chosen candidate. We crawl its
 *                          website for an email, MX-check, cache, return.
 *
 * Cost-controlled: candidates step is one Places call (~$0.02). Pick step
 * is $0. Everything cached for 90 days after pick.
 */

export const runtime = "nodejs";

const PLACES_FRESH_MS = 90 * 24 * 3600 * 1000;

type Body = {
  name?:       string;
  city?:       string;
  postalCode?: string;
  corpNumber?: string;
  picked?:     PlaceCandidate;   // operator selected this candidate — crawl + persist
  forceRefresh?: boolean;        // bypass caches (used by "↻ Refresh" button)
};

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Company name is required." }, { status: 400 });

  const corpNumber = body.corpNumber?.trim() || undefined;
  await ensureLookupsIndex();

  /* Mode 3 — operator picked a candidate. Crawl + persist. */
  if (body.picked) {
    const crawled = body.picked.website ? await crawlForEmail(body.picked.website) : null;
    const result: EnrichmentResult = {
      email:          crawled?.email ?? null,
      emailSourceUrl: crawled?.sourceUrl ?? null,
      website:        body.picked.website ?? null,
      phone:          body.picked.phone   ?? null,
      enrichedAt:     new Date(),
      enrichStatus:   crawled?.email ? "found"
                    : (body.picked.website || body.picked.phone) ? "phone_or_web_only"
                    : "not_found",
      rating:         body.picked.rating         ?? null,
      reviewCount:    body.picked.reviewCount    ?? null,
      businessStatus: body.picked.businessStatus ?? null,
      mapsUrl:        body.picked.mapsUrl        ?? null,
    };
    await persistPick(corpNumber, result);
    return NextResponse.json({ mode: "picked", contact: await serializeContact(result), matched: body.picked });
  }

  /* Mode 1 — return cached contact if we have a fresh one, unless the
     operator explicitly requested refresh. */
  if (!body.forceRefresh && corpNumber) {
    const cached = await findCachedContact(corpNumber);
    if (cached) return NextResponse.json({ mode: "cached", contact: await serializeContact(cached) });
  }

  /* Mode 2 — fresh candidates from Places, no crawl yet. Skip for numbered
     corps (their names are near-useless for Places matching). */
  if (isNumbered(name)) {
    const skip: EnrichmentResult = {
      email: null, emailSourceUrl: null, website: null, phone: null,
      enrichedAt: new Date(), enrichStatus: "skip_numbered",
    };
    await persistPick(corpNumber, skip);
    return NextResponse.json({ mode: "cached", contact: await serializeContact(skip),
      note: "Numbered corporation — no meaningful public web presence to enrich from." });
  }

  const candidates = await getPlacesCandidates(name, body.city ?? "", body.postalCode);
  return NextResponse.json({ mode: "candidates", candidates });
}

/* ── helpers ─────────────────────────────────────────────────── */

/** Try both cache paths (Alberta companies collection + generic lookups). */
async function findCachedContact(corpNumber: string): Promise<EnrichmentResult | null> {
  const cache = await lookups();
  const cached = await cache.findOne({ _id: `places:${corpNumber}` });
  if (cached && (Date.now() - cached.fetchedAt.getTime()) < PLACES_FRESH_MS) {
    return { ...(cached.payload as EnrichmentResult), enrichedAt: cached.fetchedAt };
  }
  const company = await (await companies()).findOne({ _id: corpNumber });
  if (company?.contact?.enrichedAt) {
    const at = company.contact.enrichedAt instanceof Date
      ? company.contact.enrichedAt
      : new Date(company.contact.enrichedAt);
    if (!Number.isNaN(at.getTime()) && (Date.now() - at.getTime()) < PLACES_FRESH_MS) {
      return { ...(company.contact as EnrichmentResult), enrichedAt: at };
    }
  }
  return null;
}

/** Cache the picked+crawled contact in both the TTL lookups and the
 *  Alberta companies collection (if the corp lives there). */
async function persistPick(corpNumber: string | undefined, result: EnrichmentResult): Promise<void> {
  if (!corpNumber) return;
  const cache = await lookups();
  await cache.replaceOne(
    { _id: `places:${corpNumber}` },
    { source: "places", payload: result, fetchedAt: result.enrichedAt },
    { upsert: true },
  );
  await (await companies()).updateOne(
    { _id: corpNumber },
    { $set: { contact: result } },
  );
}

async function serializeContact(r: EnrichmentResult) {
  // Cross-reference the outreach suppression list so the console can
  // surface "unsubscribed" state before the operator drafts an email.
  // Send-time check is still the last-line-of-defense; this is UX.
  const suppressed = r.email ? await isSuppressed(r.email) : false;
  return {
    email:          r.email,
    emailSourceUrl: r.emailSourceUrl,
    website:        r.website,
    phone:          r.phone,
    enrichedAt:     r.enrichedAt.toISOString(),
    enrichStatus:   r.enrichStatus,
    suppressed,
    rating:         r.rating         ?? null,
    reviewCount:    r.reviewCount    ?? null,
    businessStatus: r.businessStatus ?? null,
    mapsUrl:        r.mapsUrl        ?? null,
  };
}

const NUMBERED_RE = /^\d{5,}\s+(ALBERTA|CANADA|ONTARIO|BRITISH COLUMBIA|B\.?C\.?|SASKATCHEWAN|MANITOBA|QUEBEC)\b/i;
function isNumbered(name: string): boolean { return NUMBERED_RE.test(name); }
