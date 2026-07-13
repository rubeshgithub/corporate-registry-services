import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { companies, events } from "@/lib/registrar-mongo";
import { fetchLiveCbrStatus, enrichCompany, needsEnrichment, type LiveCbrStatus, type EnrichmentResult } from "@/lib/registrar-live";
import ProfileView from "./ProfileView";

/**
 * Corporation profile page — the hub that ties together:
 *   - Historical events from crs.events (day 1 onward)
 *   - Current live status from CBR API (cached 1 hr)
 *   - Contact info from Google Places + website crawl (cached 90 days)
 *   - Conditional order-flow CTAs based on live status
 *
 * Rendered server-side so it's SEO-indexable. All external API calls
 * (CBR + Places) fire in parallel with the DB reads.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { slug: string };

/** Resolve the URL segment to a company doc. Accepts either a canonical slug
 *  or a bare corp number (all-digits) so external links / CompanySearch can
 *  deep-link with just the number. If a corp number is used, we return a
 *  redirect intent so the caller can 302 to the canonical URL. */
async function resolveCompany(param: string): Promise<
  { doc: NonNullable<Awaited<ReturnType<typeof _findOne>>>; redirectTo?: string } | null
> {
  const col = await companies();
  /* All-digits param → treat as corp number, look up by _id, redirect to slug */
  if (/^\d{5,}$/.test(param)) {
    const byId = await col.findOne({ _id: param });
    if (byId) return { doc: byId, redirectTo: `/corporation/${byId.slug}` };
  }
  const bySlug = await col.findOne({ slug: param });
  if (bySlug) return { doc: bySlug };
  return null;
}

/* Type-inference helper so resolveCompany's return type stays tied to the
   companies collection without duplicating the doc shape. */
async function _findOne() { const c = await companies(); return c.findOne({}); }

async function getProfileData(slug: string) {
  const resolved = await resolveCompany(slug);
  if (!resolved) return null;
  if (resolved.redirectTo) redirect(resolved.redirectTo);
  const company = resolved.doc;

  const evtCol = await events();
  const isNumbered = !String(company._id).startsWith("name:");

  /* Fetch everything in parallel — the DB reads are fast, the external
     calls are the latency limit. */
  const [eventDocs, live, enrichment] = await Promise.all([
    isNumbered
      ? evtCol.find({ corpNumber: company._id }).sort({ eventDate: 1 }).toArray()
      : evtCol.find({ companyNameNorm: company.nameNorm }).sort({ eventDate: 1 }).toArray(),
    isNumbered ? fetchLiveCbrStatus(company._id) : Promise.resolve(null),
    needsEnrichment(company) && isNumbered
      ? enrichCompany(company).catch(() => null)
      : Promise.resolve(null),
  ]);

  /* If enrichment ran, merge the fresh values into the company doc so the
     page always reflects the newest state, not the cached-at-fetch state. */
  const contact = enrichment ?? company.contact ?? null;

  return {
    company: { ...company, contact },
    events:  eventDocs,
    live,
  };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const col = await companies();
  const c   = await col.findOne({ slug }, { projection: { name: 1, "status.derived": 1, "address.city": 1 } });
  if (!c) return { title: "Corporation not found — CRS", robots: { index: false } };
  const title = `${c.name} — Alberta corporation profile · CRS`;
  const desc  = `Registry status, filing history, and services for ${c.name}${c.address?.city ? `, ${c.address.city}` : ""}, Alberta.`;
  return {
    title,
    description: desc,
    openGraph: { title, description: desc },
  };
}

export default async function CorporationProfilePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const data = await getProfileData(slug);
  if (!data) notFound();

  /* Serialize dates to strings for the client component (JS Date → JSON
     drops the type). ProfileView reconstructs them on the client.
     Explicitly enumerate fields so nothing with a toJSON method or
     ObjectId leaks through — Turbopack RSC serialization is strict. */
  const c = data.company;
  const serialized = {
    company: {
      _id:        String(c._id),
      name:       c.name,
      nameNorm:   c.nameNorm,
      entityType: c.entityType,
      slug:       c.slug,
      status: {
        derived:        c.status.derived,
        lastEventDate:  c.status.lastEventDate?.toISOString() ?? null,
        lastIssue:      c.status.lastIssue,
        lastIssueDate:  c.status.lastIssueDate?.toISOString?.() ?? null,
        live:           c.status.live ?? null,
        liveNotes:      c.status.liveNotes ?? null,
        liveCheckedAt:  c.status.liveCheckedAt?.toISOString?.() ?? null,
      },
      address: c.address ? {
        full:   c.address.full,
        city:   c.address.city,
        postal: c.address.postal,
      } : undefined,
      contact: c.contact ? {
        email:          c.contact.email          ?? null,
        emailSourceUrl: c.contact.emailSourceUrl ?? null,
        website:        c.contact.website        ?? null,
        phone:          c.contact.phone          ?? null,
        enrichStatus:   c.contact.enrichStatus,
        enrichedAt:     c.contact.enrichedAt
          ? (c.contact.enrichedAt instanceof Date
              ? c.contact.enrichedAt.toISOString()
              : new Date(c.contact.enrichedAt).toISOString())
          : null,
      } : null,
    },
    events: data.events.map((e) => {
      /* Strip the auto-generated ObjectId (has toJSON — Turbopack RSC rejects
         it) and normalize dates to ISO strings for the client component. */
      const { _id: _drop, eventDate, issueDate, ...rest } = e as typeof e & { _id?: unknown };
      void _drop;
      return {
        ...rest,
        eventDate: eventDate?.toISOString() ?? null,
        issueDate: issueDate?.toISOString() ?? null,
      };
    }),
    live: data.live ? {
      ...data.live,
      fetchedAt: data.live.fetchedAt.toISOString(),
    } : null,
  };

  /* JSON-LD Organization schema — helps Google understand this page
     represents a business entity (not a generic content page). */
  const orgLd = {
    "@context": "https://schema.org",
    "@type":    "Organization",
    "name":     data.company.name,
    "identifier": data.company._id,
    "url":      `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.corporateregistryservices.ca"}/corporation/${data.company.slug}`,
    ...(data.company.entityType ? { "additionalType": data.company.entityType } : {}),
    ...(data.company.address ? {
      "address": {
        "@type":          "PostalAddress",
        "streetAddress":  data.company.address.full,
        "addressLocality": data.company.address.city,
        "postalCode":     data.company.address.postal,
        "addressRegion":  "AB",
        "addressCountry": "CA",
      },
    } : {}),
    ...(data.company.contact?.email    ? { "email":    data.company.contact.email    } : {}),
    ...(data.company.contact?.phone    ? { "telephone": data.company.contact.phone } : {}),
    ...(data.company.contact?.website  ? { "sameAs":   [data.company.contact.website] } : {}),
    ...(data.company.status.lastEventDate ? { "foundingDate": new Date(data.company.status.lastEventDate).toISOString().slice(0, 10) } : {}),
  };

  return (
    <>
      <Header />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }}
      />
      <main style={{ flex: 1, background: "var(--bg)", padding: "2rem 1.5rem" }}>
        <ProfileView data={serialized} />
      </main>
      <Footer />
    </>
  );
}

/* Re-export the shape so the client component stays type-safe. */
export type SerializedProfileData = {
  company: {
    _id: string;
    name: string;
    nameNorm: string;
    entityType?: string;
    slug: string;
    status: {
      derived:        string;
      lastEventDate:  string | null;
      lastIssue:      string;
      lastIssueDate:  string | null;
      live?:          string | null;
      liveNotes?:     string | null;
      liveCheckedAt:  string | null;
    };
    address?: { full: string; city: string; postal: string };
    contact: (Omit<NonNullable<EnrichmentResult>, "enrichedAt"> & { enrichedAt: string | null }) | null;
  };
  events: Array<{
    event: string;
    section: string;
    eventDate: string | null;
    issue: string;
    issueDate: string | null;
    address: string;
    city: string;
    postal: string;
    entityType?: string;
    oldName?: string;
  }>;
  live: (Omit<LiveCbrStatus, "fetchedAt"> & { fetchedAt: string }) | null;
};
