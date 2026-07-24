import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { companies, events } from "@/lib/registrar-mongo";
import { outreachTokens, outreachSends, isSuppressed } from "@/lib/outreach-mongo";

/**
 * GET /api/admin/companies/[corpNumber]
 *
 * Full detail view for one corporation — powers the /admin/companies
 * drawer. Returns:
 *   - the company doc (contact, status, address, first/last event dates)
 *   - up to 25 most-recent events for the timeline
 *   - up to 20 most-recent outreach sends + click/conversion state
 *   - suppression state (from the source-of-truth outreach_suppression
 *     collection, not just the denormalized contact.suppressed field)
 *
 * All queries run in parallel — the drawer opens in a single round trip.
 * Bounded response size (25 events + 20 outreach records) so this stays
 * fast even for a corp with a long gazette history.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ corpNumber: string }> },
) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const { corpNumber } = await params;
  const id = decodeURIComponent(corpNumber ?? "").trim();
  if (!id || !/^\d{2,20}$/.test(id)) {
    return NextResponse.json({ error: "Invalid corp number." }, { status: 400 });
  }

  const cCol = await companies();
  const eCol = await events();
  const tCol = await outreachTokens();
  const sCol = await outreachSends();

  const [company, eventRows, tokens, sends] = await Promise.all([
    cCol.findOne({ _id: id }),
    eCol.find({ corpNumber: id }, {
      projection: { event: 1, section: 1, eventDate: 1, issue: 1, issueDate: 1, address: 1, city: 1, postal: 1, entityType: 1, oldName: 1, predecessors: 1 },
    }).sort({ eventDate: -1, issue: -1 }).limit(25).toArray(),
    tCol.find({ "company.registryId": id }).sort({ sentAt: -1 }).limit(20).toArray(),
    sCol.find({ registryId: id }).sort({ sentAt: -1 }).limit(20).toArray(),
  ]);

  if (!company) {
    return NextResponse.json({ error: "Corporation not found." }, { status: 404 });
  }

  // Suppression check — the denormalized contact.suppressed on the
  // company doc is a stale mirror of the outreach_suppression collection
  // (backfilled when contact.email was known at unsub time). This is the
  // authoritative check, using the current contact email if we have one.
  const suppressed = company.contact?.email ? await isSuppressed(company.contact.email) : false;

  return NextResponse.json({
    company: serializeCompany(company, suppressed),
    events:  eventRows.map(serializeEvent),
    outreach: mergeOutreach(tokens, sends),
  });
}

/* ── serializers ─────────────────────────────────────────────── */

type CompanyDocLike = {
  _id:       string;
  name?:     string;
  entityType?: string;
  slug?:     string;
  firstEventDate?: Date | null;
  status?: {
    derived?:       string;
    lastEventDate?: Date | null;
    lastIssue?:     string;
    lastIssueDate?: Date | null;
    live?:          string | null;
    liveCheckedAt?: Date | null;
  };
  address?: { full?: string; city?: string; postal?: string };
  contact?: {
    email?:          string | null;
    emailSourceUrl?: string | null;
    website?:        string | null;
    phone?:          string | null;
    enrichedAt?:     Date | null;
    enrichStatus?:   string;
    rating?:         number | null;
    reviewCount?:    number | null;
    businessStatus?: string | null;
    mapsUrl?:        string | null;
    suppressed?:     boolean;
    suppressedAt?:   Date | null;
  };
  outreach?: {
    lastEmailAt?:  Date | null;
    sequenceStep?: number;
    replied?:      boolean;
    orderId?:      string | null;
  };
  otherData?: {
    matched:       boolean;
    name?:         string;
    address?:      string;
    city?:         string;
    region?:       string;
    country?:      string;
    postalCode?:   string;
    industry?:     string;
    locationType?: string;
    fetchedAt?:    Date | null;
  };
};

function serializeCompany(doc: CompanyDocLike, suppressed: boolean) {
  return {
    corpNumber:     String(doc._id ?? ""),
    name:           doc.name ?? "",
    entityType:     doc.entityType ?? "",
    slug:           doc.slug ?? "",
    firstEventDate: doc.firstEventDate ? new Date(doc.firstEventDate).toISOString() : null,
    status: {
      derived:       doc.status?.derived ?? "",
      lastEventDate: doc.status?.lastEventDate ? new Date(doc.status.lastEventDate).toISOString() : null,
      lastIssue:     doc.status?.lastIssue     ?? "",
      lastIssueDate: doc.status?.lastIssueDate ? new Date(doc.status.lastIssueDate).toISOString() : null,
      live:          doc.status?.live          ?? null,
      liveCheckedAt: doc.status?.liveCheckedAt ? new Date(doc.status.liveCheckedAt).toISOString() : null,
    },
    address: {
      full:   doc.address?.full   ?? "",
      city:   doc.address?.city   ?? "",
      postal: doc.address?.postal ?? "",
    },
    contact: {
      email:          doc.contact?.email          ?? null,
      emailSourceUrl: doc.contact?.emailSourceUrl ?? null,
      website:        doc.contact?.website        ?? null,
      phone:          doc.contact?.phone          ?? null,
      enrichedAt:     doc.contact?.enrichedAt     ? new Date(doc.contact.enrichedAt).toISOString() : null,
      enrichStatus:   doc.contact?.enrichStatus   ?? "pending",
      rating:         doc.contact?.rating         ?? null,
      reviewCount:    doc.contact?.reviewCount    ?? null,
      businessStatus: doc.contact?.businessStatus ?? null,
      mapsUrl:        doc.contact?.mapsUrl        ?? null,
      // Authoritative suppression flag (from the collection lookup, not
      // the denormalized field — that one may be stale).
      suppressed,
      suppressedAt:   doc.contact?.suppressedAt   ? new Date(doc.contact.suppressedAt).toISOString() : null,
    },
    outreachSummary: {
      lastEmailAt:  doc.outreach?.lastEmailAt ? new Date(doc.outreach.lastEmailAt).toISOString() : null,
      sequenceStep: doc.outreach?.sequenceStep ?? 0,
      replied:      !!doc.outreach?.replied,
      orderId:      doc.outreach?.orderId ?? null,
    },
    otherData: doc.otherData ? {
      matched:      !!doc.otherData.matched,
      name:         doc.otherData.name         ?? null,
      address:      doc.otherData.address      ?? null,
      city:         doc.otherData.city         ?? null,
      region:       doc.otherData.region       ?? null,
      country:      doc.otherData.country      ?? null,
      postalCode:   doc.otherData.postalCode   ?? null,
      industry:     doc.otherData.industry     ?? null,
      locationType: doc.otherData.locationType ?? null,
      fetchedAt:    doc.otherData.fetchedAt ? new Date(doc.otherData.fetchedAt).toISOString() : null,
    } : null,
  };
}

type EventDocLike = {
  event?:      string;
  section?:    string;
  eventDate?:  Date | null;
  issue?:      string;
  issueDate?:  Date | null;
  address?:    string;
  city?:       string;
  postal?:     string;
  entityType?: string;
  oldName?:    string;
  predecessors?: string[];
};

function serializeEvent(e: EventDocLike) {
  return {
    event:      e.event      ?? "",
    section:    e.section    ?? "",
    eventDate:  e.eventDate  ? new Date(e.eventDate).toISOString()  : null,
    issue:      e.issue      ?? "",
    issueDate:  e.issueDate  ? new Date(e.issueDate).toISOString()  : null,
    address:    e.address    ?? "",
    city:       e.city       ?? "",
    postal:     e.postal     ?? "",
    entityType: e.entityType ?? "",
    oldName:    e.oldName    ?? "",
    predecessors: e.predecessors ?? [],
  };
}

/* ── outreach history merge ───────────────────────────────────
 * Join tokens (click/convert state) with sends (subject, body, SES
 * message ID). Same tokenId across both. Output one row per send. */

type TokenDocLike = {
  token:              string;
  service:            string;
  sentAt?:            Date | null;
  clickCount?:        number;
  firstClickedAt?:    Date | null;
  ackFiled?:          Date | null;
  convertedAt?:       Date | null;
  convertedSessionId?: string;
};

type SendDocLike = {
  tokenId:        string;
  service:        string;
  subject:        string;
  to:             string[];
  sentAt?:        Date | null;
  bouncedAt?:     Date | null;
  complainedAt?:  Date | null;
};

function mergeOutreach(tokens: TokenDocLike[], sends: SendDocLike[]) {
  const tokenMap = new Map<string, TokenDocLike>();
  for (const t of tokens) tokenMap.set(t.token, t);

  return sends.map((s) => {
    const t = tokenMap.get(s.tokenId);
    return {
      tokenId:       s.tokenId,
      service:       s.service,
      subject:       s.subject,
      to:            s.to,
      sentAt:        s.sentAt ? new Date(s.sentAt).toISOString() : null,
      bouncedAt:     s.bouncedAt    ? new Date(s.bouncedAt).toISOString()    : null,
      complainedAt:  s.complainedAt ? new Date(s.complainedAt).toISOString() : null,
      clickCount:    t?.clickCount ?? 0,
      firstClickedAt: t?.firstClickedAt ? new Date(t.firstClickedAt).toISOString() : null,
      ackFiled:      t?.ackFiled    ? new Date(t.ackFiled).toISOString()    : null,
      convertedAt:   t?.convertedAt ? new Date(t.convertedAt).toISOString() : null,
    };
  });
}
