import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { searchLeads, ensureSearchLeadIndexes } from "@/lib/search-leads-mongo";
import { isSuppressed } from "@/lib/outreach-mongo";
import { sendOutreach } from "@/lib/outreach-ses";
import { newToken, signUnsubscribe } from "@/lib/outreach-token";
import { MAILING } from "@/lib/outreach-templates";
import { getPrices, formatCents } from "@/lib/pricing";
import { calculateAnnualReturnDeadline } from "@/lib/annual-return-deadlines";
import { SITE_PHONE_DISPLAY } from "@/lib/contact";
import { SNAPSHOT_CONSENT_TEXT } from "@/lib/snapshot";
import { parseRegistryDate } from "@/lib/dates";

/**
 * POST /api/notify/snapshot
 *
 * "Email me a free snapshot of this corporation" — offered on registry-search
 * result cards and on /corporation/[slug]. Never gates anything: the visitor
 * can always view the free details without giving an email.
 *
 *   validate → suppression check → rate limit (per IP hash) → dedupe
 *   (email + corporation, 24 h) → re-verify the corporation server-side →
 *   store in search_leads (intent "snapshot") → send the snapshot email.
 *
 * The corporation is re-fetched from our own search API rather than trusted
 * from the request body, so the endpoint can't be used to mail arbitrary text
 * to arbitrary addresses.
 *
 * The email carries offers, so it is a commercial electronic message under
 * CASL: sender identification, mailing address and a working unsubscribe are
 * in the footer. marketingConsent is the unticked opt-in box — express consent
 * for later marketing; without it the request alone gives implied consent.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL     = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.corporateregistryservices.ca";
const EMAIL_RE     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEDUPE_MS    = 24 * 60 * 60 * 1000;
const RATE_WINDOW  = 60 * 60 * 1000;
const RATE_MAX     = 6;

type Body = {
  email?:       string;
  registryId?:  string;
  provinceKey?: string;
  name?:        string;
  consent?:     boolean;
  src?:         string;
  path?:        string;
  sessionId?:   string;
};

type Hit = {
  name: string; businessNumber: string; registryId: string; location: string;
  status: string; statusNotes?: string; entityType: string; registrationDate: string;
  jurisdiction: string; provinceKey: string;
};

function ipHash(req: Request): string {
  const raw = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "").split(",")[0]?.trim() ?? "";
  return raw ? crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24) : "";
}

async function verifyCorporation(origin: string, registryId: string, province: string, name: string): Promise<Hit | null> {
  const q = registryId || name;
  if (!q) return null;
  try {
    const res  = await fetch(`${origin}/api/company-search?q=${encodeURIComponent(q)}&province=${encodeURIComponent(province || "all")}`, { cache: "no-store" });
    const data = await res.json() as { results?: Hit[] };
    const hits = data.results ?? [];
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    return hits.find((h) => registryId && h.registryId === registryId)
        ?? hits.find((h) => !registryId && norm(h.name) === norm(name))
        ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email      = String(body.email ?? "").trim().toLowerCase();
  const registryId = String(body.registryId ?? "").trim().slice(0, 64);
  const province   = String(body.provinceKey ?? "all").trim().toLowerCase().slice(0, 16);
  const nameIn     = String(body.name ?? "").trim().slice(0, 200);
  const consent    = body.consent === true;
  const src        = String(body.src ?? "").replace(/[^a-z0-9._-]/gi, "").slice(0, 100);

  if (!EMAIL_RE.test(email))       return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!registryId && !nameIn)      return NextResponse.json({ error: "Which corporation?" }, { status: 400 });

  /* An unsubscribed address that asks for a snapshot still gets THAT
     snapshot — it is a reply to their own request (CASL exempts responses
     to a request), and silently dropping it made the form claim success
     while nothing arrived. The suppression itself is left in place, so no
     outreach or follow-up marketing goes to them. */
  const suppressed = await isSuppressed(email);

  await ensureSearchLeadIndexes();
  const col  = await searchLeads();
  const now  = new Date();
  const hash = ipHash(req);

  if (hash) {
    const recent = await col.countDocuments({ ipHash: hash, intent: "snapshot", createdAt: { $gte: new Date(now.getTime() - RATE_WINDOW) } });
    if (recent >= RATE_MAX) {
      return NextResponse.json({ error: "Too many snapshot requests — please try again in an hour." }, { status: 429 });
    }
  }

  const dupe = await col.findOne({
    email, intent: "snapshot", registryId: registryId || undefined,
    createdAt: { $gte: new Date(now.getTime() - DEDUPE_MS) },
  });
  if (dupe) return NextResponse.json({ ok: true, duplicate: true });

  const hit = await verifyCorporation(new URL(req.url).origin, registryId, province, nameIn);
  if (!hit) {
    return NextResponse.json({ error: "We couldn't confirm that corporation just now — please try again." }, { status: 404 });
  }

  await col.insertOne({
    email,
    query:        hit.name,
    province:     hit.provinceKey,
    resultCount:  1,
    path:         String(body.path ?? "").slice(0, 300),
    sessionId:    body.sessionId ? String(body.sessionId).slice(0, 100) : undefined,
    ipHash:       hash || undefined,
    userAgent:    (req.headers.get("user-agent") ?? "").slice(0, 200) || undefined,
    createdAt:    now,
    intent:       "snapshot",
    registryId:   hit.registryId || undefined,
    jurisdiction: hit.jurisdiction,
    src:          src || undefined,
    marketingConsent: consent && !suppressed,
    consentAt:        consent && !suppressed ? now : undefined,
    consentText:      consent && !suppressed ? SNAPSHOT_CONSENT_TEXT : undefined,
  });

  const sent = await sendSnapshotEmail(email, hit, src);
  if (!sent) {
    return NextResponse.json({ error: "We saved your request but the email didn't go out — we'll send it shortly." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

/* ─────────────── Email ─────────────── */

async function sendSnapshotEmail(email: string, hit: Hit, src: string): Promise<boolean> {
  const prices = await getPrices();
  const price  = (k: string) => formatCents(prices[k]);
  const tag    = `email-snapshot${src ? `.${src}` : ""}`.slice(0, 100);

  const orderUrl = (path: string) => {
    const qs = new URLSearchParams({ q: hit.name, jurisdiction: hit.provinceKey, src: tag });
    if (hit.registryId) qs.set("registryId", hit.registryId);
    return `${SITE_URL}${path}?${qs.toString()}`;
  };

  const incorporated = hit.registrationDate
    ? (parseRegistryDate(hit.registrationDate)?.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" }) ?? "")
    : "";
  const due = hit.status === "Active" ? calculateAnnualReturnDeadline(hit.registrationDate, hit.provinceKey) : null;
  const dueLine = due && due.status !== "unknown" ? due.label : "";

  const rows: Array<[string, string]> = [
    ["Legal name",        hit.name],
    ["Status",            hit.status + (hit.statusNotes ? ` (${hit.statusNotes})` : "")],
    ["Jurisdiction",      hit.jurisdiction],
    ["Registry number",   hit.registryId],
    ["Business Number",   hit.businessNumber],
    ["Entity type",       hit.entityType],
    ["Incorporated",      incorporated],
    ["Location on file",  hit.location],
    ["Next annual return", dueLine],
  ].filter(([, v]) => !!v) as Array<[string, string]>;

  const offers: Array<{ label: string; sub: string; href: string; primary?: boolean }> = [
    { label: `Order the official Profile Report — ${price("profile-report")}`, sub: "Directors, officers, registered office and filing history. PDF from the government registry within one business hour.", href: orderUrl("/order/profile-report"), primary: true },
    { label: `Certificate of Good Standing — ${price("good-standing")}`,       sub: "Government-issued proof the corporation is active — for banks, lenders and contracts.", href: orderUrl("/order/good-standing") },
    { label: `Copies of corporate documents — from ${price("corporate-document-single")}`, sub: "Articles, certificate of incorporation, annual returns — per document, government fee included.", href: orderUrl("/order/corporate-documents") },
  ];
  if (hit.status === "Active") {
    offers.push({ label: `Is this your company? File its annual return — ${price("annual-return")}`, sub: "Filed within 1 business day, government fee included.", href: orderUrl("/order/annual-return") });
  }

  const token          = newToken();
  const unsubscribeUrl = `${SITE_URL}/o/unsubscribe?e=${encodeURIComponent(email)}&s=${signUnsubscribe(email)}&t=${token}`;
  const today          = new Date().toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" });
  const subject        = `Corporation snapshot: ${hit.name}`.slice(0, 120);

  const text = [
    `Here is the snapshot you requested from Corporate Registry Services.`,
    ``,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ``,
    `From public registry records as of ${today}. This is a summary, not an official registry document.`,
    ``,
    `Need more?`,
    ...offers.map((o) => `• ${o.label}\n  ${o.href}`),
    ``,
    `Questions? Reply to this email or call ${SITE_PHONE_DISPLAY}.`,
    ``,
    `Corporate Registry Services · ${MAILING}`,
    `You're receiving this because you requested a corporation snapshot at ${SITE_URL}.`,
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n");

  const rowHtml = rows.map(([k, v]) =>
    `<tr><td style="padding:6px 10px;color:#5B6B7A;font-size:13px;white-space:nowrap;border-bottom:1px solid #EEF2F5;">${esc(k)}</td>` +
    `<td style="padding:6px 10px;color:#1D2A35;font-size:13px;font-weight:600;border-bottom:1px solid #EEF2F5;">${esc(v)}</td></tr>`).join("");

  const offerHtml = offers.map((o) =>
    `<tr><td style="padding:0 0 10px;">
       <a href="${o.href}" style="display:block;padding:12px 14px;border-radius:8px;text-decoration:none;${o.primary
         ? "background:#003d5b;color:#ffffff;"
         : "background:#ffffff;color:#003d5b;border:1px solid #C9D3DC;"}">
         <span style="display:block;font-weight:700;font-size:14px;">${esc(o.label)} &rarr;</span>
         <span style="display:block;font-size:12px;margin-top:3px;${o.primary ? "color:#D6E4EE;" : "color:#5B6B7A;"}">${esc(o.sub)}</span>
       </a></td></tr>`).join("");

  const html = `<!doctype html><html><body style="margin:0;background:#F4F7FA;font-family:Arial,Helvetica,sans-serif;color:#1D2A35;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FA;padding:24px 0;"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;">
    <tr><td style="background:#003d5b;padding:18px 24px;">
      <div style="color:#D4AF37;font-weight:800;font-size:20px;letter-spacing:-0.01em;">CRS</div>
      <div style="color:#C9D8E3;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;">Corporation snapshot</div>
    </td></tr>
    <tr><td style="padding:22px 24px 6px;">
      <p style="margin:0 0 6px;font-size:18px;font-weight:700;">${esc(hit.name)}</p>
      <p style="margin:0 0 14px;font-size:13px;color:#5B6B7A;">Here is the snapshot you requested.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EEF2F5;border-radius:8px;">${rowHtml}</table>
      <p style="margin:10px 0 0;font-size:11px;color:#8A99A8;">From public registry records as of ${esc(today)}. A summary, not an official registry document.</p>
    </td></tr>
    <tr><td style="padding:18px 24px 8px;">
      <p style="margin:0 0 10px;font-size:14px;font-weight:700;">Need the official record?</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${offerHtml}</table>
    </td></tr>
    <tr><td style="padding:6px 24px 20px;font-size:13px;color:#1D2A35;">
      Questions? Reply to this email or call <strong>${esc(SITE_PHONE_DISPLAY)}</strong>.
    </td></tr>
    <tr><td style="padding:14px 24px;background:#F7F9FB;font-size:11px;line-height:1.6;color:#8A99A8;">
      Corporate Registry Services · ${esc(MAILING)}<br/>
      You&rsquo;re receiving this because you requested a corporation snapshot at <a href="${SITE_URL}" style="color:#8A99A8;">corporateregistryservices.ca</a>.
      <a href="${unsubscribeUrl}" style="color:#8A99A8;">Unsubscribe</a>.
    </td></tr>
  </table></td></tr></table></body></html>`;

  const res = await sendOutreach({ to: [email], cc: [], bcc: [], subject, html, text });
  return !!(res as { ok?: boolean }).ok;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
