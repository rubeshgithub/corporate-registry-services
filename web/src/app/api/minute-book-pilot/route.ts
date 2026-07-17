import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { ensureOutreachIndexes, minuteBookPilots, isSuppressed } from "@/lib/outreach-mongo";
import { sendOutreach } from "@/lib/outreach-ses";

/**
 * POST /api/minute-book-pilot
 *
 * Public lead-capture endpoint for the /minute-books hub page. A visitor
 * searches their corp, picks it from the dropdown, then enters their
 * email — we record the request and fire two emails:
 *
 *   1. Confirmation to the requester ("We got it — expect access within
 *      24 hours")
 *   2. Notification to the CRS ops inbox with the corp + email + entry
 *      point so a human can provision access
 *
 * Provisioning is manual for MVP (no MinuteBook subdomain API call yet).
 * Duplicate requests (same email + same corp within 24h) are treated as
 * idempotent — we don't re-send confirmation, don't re-notify ops.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL   = process.env.NEXT_PUBLIC_SITE_URL      ?? "https://www.corporateregistryservices.ca";
const OPS_INBOX  = process.env.MINUTEBOOK_OPS_INBOX      ?? process.env.SES_OUTREACH_REPLY_TO ?? "support@corporateregistryservices.ca";
const APP_URL    = "https://minutebook.corporateregistryservices.ca";

type Body = {
  email?:          string;
  companyName?:    string;
  registryId?:     string;
  jurisdictionKey?: string;
  entityType?:     string;
  status?:         string;
  requesterName?:  string;
  requesterPhone?: string;
  path?:           string;
  sessionId?:      string;
};

function ipHashFromRequest(req: Request): string {
  const raw = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "").split(",")[0]?.trim() ?? "";
  if (!raw) return "";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEDUPE_MS = 24 * 3600 * 1000;

export async function POST(req: Request) {
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  const email = String(body.email ?? "").trim().toLowerCase();
  const companyName = String(body.companyName ?? "").trim();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (!companyName) {
    return NextResponse.json({ error: "Please pick a corporation from the search results first." }, { status: 400 });
  }

  // Respect the outreach suppression list — someone who has unsubscribed
  // shouldn't be able to re-enter our funnel via the pilot form.
  if (await isSuppressed(email)) {
    return NextResponse.json({ error: "This address has been unsubscribed from our communications. Please email support@corporateregistryservices.ca for help." }, { status: 403 });
  }

  await ensureOutreachIndexes();
  const col = await minuteBookPilots();
  const now = new Date();

  // Idempotency — same email + same corp within 24h counts as one request.
  const existing = await col.findOne({
    email,
    registryId:   body.registryId ?? "",
    companyName,
    createdAt:    { $gte: new Date(now.getTime() - DEDUPE_MS) },
  });
  if (existing) {
    return NextResponse.json({
      ok:         true,
      duplicate:  true,
      message:    "We already have your request from the last 24 hours — we'll be in touch shortly.",
    });
  }

  await col.insertOne({
    email,
    companyName,
    registryId:      String(body.registryId ?? ""),
    jurisdictionKey: String(body.jurisdictionKey ?? "unknown"),
    entityType:      String(body.entityType ?? ""),
    status:          String(body.status ?? ""),
    requesterName:   body.requesterName?.trim() || undefined,
    requesterPhone:  body.requesterPhone?.trim() || undefined,
    ipHash:          ipHashFromRequest(req) || undefined,
    userAgent:       (req.headers.get("user-agent") ?? "").slice(0, 200) || undefined,
    path:            String(body.path ?? "/minute-books"),
    sessionId:       body.sessionId?.trim() || undefined,
    createdAt:       now,
  });

  // Fire-and-forget email notifications. Both use the outreach SES config
  // set — same reputation stream as other outreach.
  await Promise.allSettled([
    sendRequesterConfirmation(email, companyName),
    sendOpsNotification({ email, companyName, registryId: body.registryId, jurisdictionKey: body.jurisdictionKey, path: body.path, requesterName: body.requesterName, requesterPhone: body.requesterPhone }),
  ]);

  return NextResponse.json({
    ok:      true,
    message: `You're in — check ${email} for confirmation. We'll email your MinuteBook access within one business day.`,
  });
}

async function sendRequesterConfirmation(email: string, companyName: string) {
  const subject = "MinuteBook free pilot — request received";
  const text = [
    `Hi,`,
    ``,
    `Thanks for requesting a MinuteBook free 30-day pilot for ${companyName}.`,
    ``,
    `Here's what happens next:`,
    `  1. Within one business day, we'll email you a login link to your MinuteBook workspace at ${APP_URL}.`,
    `  2. Your pilot runs 30 days, no credit card required. Cancel any time.`,
    `  3. You'll be able to generate a complete corporate minute book — articles, by-laws, resolutions, registers, share certificates — all jurisdiction-specific and export-ready.`,
    ``,
    `Reply to this email if you have questions in the meantime.`,
    ``,
    `— Corporate Registry Services`,
    SITE_URL,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1D2A35;">
    <p>Hi,</p>
    <p>Thanks for requesting a <strong>MinuteBook free 30-day pilot</strong> for <strong>${escapeHtml(companyName)}</strong>.</p>
    <p><strong>Here's what happens next:</strong></p>
    <ol>
      <li>Within one business day, we'll email you a login link to your MinuteBook workspace at <a href="${APP_URL}">${APP_URL}</a>.</li>
      <li>Your pilot runs 30 days, no credit card required. Cancel any time.</li>
      <li>You'll be able to generate a complete corporate minute book — articles, by-laws, resolutions, registers, share certificates — all jurisdiction-specific and export-ready.</li>
    </ol>
    <p>Reply to this email if you have questions in the meantime.</p>
    <p style="color:#8A99A8;">— Corporate Registry Services · <a href="${SITE_URL}">${SITE_URL}</a></p>
  </body></html>`;

  await sendOutreach({ to: [email], cc: [], bcc: [], subject, html, text });
}

async function sendOpsNotification(lead: {
  email:           string;
  companyName:     string;
  registryId?:     string;
  jurisdictionKey?: string;
  path?:           string;
  requesterName?:  string;
  requesterPhone?: string;
}) {
  const subject = `[Pilot] ${lead.companyName} — ${lead.jurisdictionKey ?? "unknown"} — ${lead.email}`;
  const text = [
    `New MinuteBook pilot request:`,
    ``,
    `  Company: ${lead.companyName}`,
    `  Registry ID: ${lead.registryId || "(unnumbered)"}`,
    `  Jurisdiction: ${lead.jurisdictionKey ?? "unknown"}`,
    `  Requester email: ${lead.email}`,
    lead.requesterName ? `  Requester name: ${lead.requesterName}` : "",
    lead.requesterPhone ? `  Requester phone: ${lead.requesterPhone}` : "",
    `  Origin path: ${lead.path ?? "/minute-books"}`,
    ``,
    `Action: provision a 30-day MinuteBook workspace and email the login link.`,
  ].filter(Boolean).join("\n");
  await sendOutreach({ to: [OPS_INBOX], cc: [], bcc: [], subject, html: `<pre style="font-family:monospace;font-size:13px;">${escapeHtml(text)}</pre>`, text });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
