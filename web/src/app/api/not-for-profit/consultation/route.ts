import { NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  ensureOutreachIndexes,
  nfpConsultations,
  isSuppressed,
  type NfpConsultationDoc,
} from "@/lib/outreach-mongo";
import { sendOutreach } from "@/lib/outreach-ses";

/**
 * POST /api/not-for-profit/consultation
 *
 * Public lead-capture for the NFP incorporation consultation booking form.
 * Multi-step form data is validated, stored in `nfp_consultation_requests`,
 * then we fire two emails: confirmation to requester + ops notification
 * with the full form dump so a specialist can prepare for the call.
 *
 * The specialist replies within one business day — no auto-scheduling,
 * no calendar link. Matches the MinuteBook pilot pattern.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL  = process.env.NEXT_PUBLIC_SITE_URL     ?? "https://www.corporateregistryservices.ca";
const OPS_INBOX = process.env.NFP_OPS_INBOX            ?? process.env.MINUTEBOOK_OPS_INBOX ?? process.env.SES_OUTREACH_REPLY_TO ?? "support@corporateregistryservices.ca";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEDUPE_MS = 60 * 60 * 1000;   // 1h — visitor double-clicking submit

type Body = {
  contact?: {
    fullName?: string; email?: string; phone?: string;
    contactMethod?: string; timeWindow?: string;
    justExploring?: boolean;
  };
  /** True when the visitor ticked "I just want to talk first" — API skips
   *  org/board/activities validation and stores null for those fields. */
  explorationMode?: boolean;
  organization?: {
    jurisdictionKey?: string; jurisdictionLabel?: string;
    name1?: string; name2?: string; name3?: string;
    office?: { street?: string; city?: string; province?: string; postal?: string };
    nature?: string; natureOther?: string;
    purpose?: string; serves?: string;
  } | null;
  board?: Array<{
    fullName?: string; role?: string; email?: string; phone?: string;
    address?: { street?: string; city?: string; province?: string; postal?: string };
    ageOk?: boolean;
  }>;
  activities?: {
    donations?: string; charity?: string; eventsPerYear?: string;
    annualRevenue?: string; grants?: string;
  } | null;
  notes?:      string;
  sourcePath?: string;
};

function ipHashFromRequest(req: Request): string {
  const raw = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "").split(",")[0]?.trim() ?? "";
  if (!raw) return "";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export async function POST(req: Request) {
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON." }, { status: 400 }); }

  // Contact — hard-required fields (always required, regardless of mode)
  const email    = String(body.contact?.email ?? "").trim().toLowerCase();
  const fullName = String(body.contact?.fullName ?? "").trim();
  const phone    = String(body.contact?.phone ?? "").trim();
  if (!fullName || fullName.length < 2)     return NextResponse.json({ error: "Please enter your full name." }, { status: 400 });
  if (!email || !EMAIL_RE.test(email))      return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  if (phone.replace(/\D/g, "").length !== 10) return NextResponse.json({ error: "Please enter a valid 10-digit Canadian phone number." }, { status: 400 });

  // Exploration mode — visitor hasn't decided on names / board / activities
  // yet and just wants a preliminary call. Skip all the detailed validation
  // and store null for those fields.
  const exploring = body.explorationMode === true || body.contact?.justExploring === true;

  const org       = exploring ? null : (body.organization ?? {});
  const boardIn   = exploring ? [] : (Array.isArray(body.board) ? body.board : []);
  const act       = exploring ? null : (body.activities ?? {});
  const office    = org?.office ?? {};

  if (!exploring) {
    if (!org!.jurisdictionKey)             return NextResponse.json({ error: "Please select a jurisdiction." }, { status: 400 });
    if (!org!.name1 || !org!.name2 || !org!.name3) return NextResponse.json({ error: "Please provide three intended name options." }, { status: 400 });
    if (!office.street || !office.city || !office.province || !office.postal) {
      return NextResponse.json({ error: "Please provide a complete registered office address." }, { status: 400 });
    }
    if (!org!.nature)                             return NextResponse.json({ error: "Please pick the nature of the organization." }, { status: 400 });
    if ((org!.purpose ?? "").trim().length < 50)  return NextResponse.json({ error: "Please describe what the organization will do (minimum 50 characters)." }, { status: 400 });
    if ((org!.serves ?? "").trim().length < 30)   return NextResponse.json({ error: "Please describe who the organization will serve (minimum 30 characters)." }, { status: 400 });
  }

  // Board — at least 3 filled members, with President/Secretary/Treasurer covered (skipped in exploration mode)
  const filledBoard = boardIn.filter((b) => (b.fullName ?? "").trim() && EMAIL_RE.test((b.email ?? "").trim()));
  if (!exploring) {
    if (filledBoard.length < 3) return NextResponse.json({ error: "Please add at least three board members with name and email." }, { status: 400 });
    const roles = filledBoard.map((b) => b.role ?? "");
    if (!roles.includes("President") || !roles.includes("Secretary") || !roles.includes("Treasurer")) {
      return NextResponse.json({ error: "Board must include one President, one Secretary and one Treasurer." }, { status: 400 });
    }
    if (!filledBoard.every((b) => b.ageOk === true)) {
      return NextResponse.json({ error: "Please confirm the age of each board member." }, { status: 400 });
    }
  }

  if (!exploring) {
    if (!act!.donations || !act!.charity || !act!.eventsPerYear || !act!.annualRevenue || !act!.grants) {
      return NextResponse.json({ error: "Please answer all the activities and funding questions." }, { status: 400 });
    }
  }

  // Respect the outreach suppression list.
  if (await isSuppressed(email)) {
    return NextResponse.json({ error: "This address has been unsubscribed from our communications. Please email support@corporateregistryservices.ca for help." }, { status: 403 });
  }

  await ensureOutreachIndexes();
  const col = await nfpConsultations();
  const now = new Date();

  // Idempotency — same email within 1h counts as one. (In exploration mode
  // we don't have a name1 to key on, so email-only works uniformly.)
  const existing = await col.findOne({
    "contact.email": email,
    createdAt:       { $gte: new Date(now.getTime() - DEDUPE_MS) },
  });
  if (existing) {
    return NextResponse.json({
      ok:        true,
      duplicate: true,
      message:   "We already have your request. We'll be in touch within one business day.",
    });
  }

  const doc: NfpConsultationDoc = {
    contact: {
      fullName,
      email,
      phone,
      contactMethod: String(body.contact?.contactMethod ?? "Email"),
      timeWindow:    String(body.contact?.timeWindow    ?? "Morning"),
    },
    explorationMode: exploring,
    organization: exploring ? null : {
      jurisdictionKey:   String(org!.jurisdictionKey ?? ""),
      jurisdictionLabel: String(org!.jurisdictionLabel ?? org!.jurisdictionKey ?? ""),
      name1:             String(org!.name1 ?? "").trim(),
      name2:             String(org!.name2 ?? "").trim(),
      name3:             String(org!.name3 ?? "").trim(),
      office: {
        street:   String(office.street ?? "").trim(),
        city:     String(office.city ?? "").trim(),
        province: String(office.province ?? "").trim(),
        postal:   String(office.postal ?? "").trim(),
      },
      nature:      String(org!.nature ?? ""),
      natureOther: org!.natureOther?.trim() || undefined,
      purpose:     String(org!.purpose ?? "").trim(),
      serves:      String(org!.serves ?? "").trim(),
    },
    board: filledBoard.map((b) => ({
      fullName: String(b.fullName ?? "").trim(),
      role:     String(b.role ?? ""),
      email:    String(b.email ?? "").trim().toLowerCase(),
      phone:    b.phone?.trim() || undefined,
      address: {
        street:   String(b.address?.street ?? "").trim(),
        city:     String(b.address?.city ?? "").trim(),
        province: String(b.address?.province ?? "").trim(),
        postal:   String(b.address?.postal ?? "").trim(),
      },
      ageOk: b.ageOk === true,
    })),
    activities: exploring ? null : {
      donations:     String(act!.donations ?? ""),
      charity:       String(act!.charity ?? ""),
      eventsPerYear: String(act!.eventsPerYear ?? ""),
      annualRevenue: String(act!.annualRevenue ?? ""),
      grants:        String(act!.grants ?? ""),
    },
    notes:      body.notes?.trim() || undefined,
    sourcePath: String(body.sourcePath ?? "/not-for-profit/book-free-consultation"),
    ipHash:     ipHashFromRequest(req) || undefined,
    userAgent:  (req.headers.get("user-agent") ?? "").slice(0, 200) || undefined,
    createdAt:  now,
  };

  await col.insertOne(doc);

  // Fire-and-forget both emails.
  await Promise.allSettled([
    sendRequesterConfirmation(doc),
    sendOpsNotification(doc),
  ]);

  return NextResponse.json({
    ok:      true,
    message: "Thanks — we'll reach out within one business day to schedule your consultation.",
  });
}

/* ─────────────── Emails ─────────────── */

async function sendRequesterConfirmation(d: NfpConsultationDoc) {
  const subject = "Free NFP consultation — request received";

  if (d.explorationMode) {
    // "Just want to talk" mode — visitor hasn't picked names / board /
    // activities yet. Skip the pre-screen preview and set a broader agenda.
    const text = [
      `Hi ${d.contact.fullName},`,
      ``,
      `Thanks for booking a free preliminary call about your not-for-profit.`,
      ``,
      `Here's what happens next:`,
      `  1. Within one business day, a CRS incorporation specialist will contact you at ${d.contact.email} (or by ${d.contact.contactMethod.toLowerCase()} if you preferred) to schedule the 30-minute call.`,
      `  2. The call is an open conversation — we'll help you figure out whether federal or provincial incorporation fits, what kind of board you'll need, and how names and purposes get chosen.`,
      `  3. You leave with a written checklist tailored to what your organisation actually looks like — yours to keep with no obligation.`,
      ``,
      `Reply to this email with any questions in the meantime.`,
      ``,
      `— Corporate Registry Services`,
      SITE_URL,
    ].join("\n");
    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1D2A35;">
      <p>Hi ${escapeHtml(d.contact.fullName)},</p>
      <p>Thanks for booking a <strong>free preliminary call</strong> about your not-for-profit.</p>
      <p><strong>Here's what happens next:</strong></p>
      <ol>
        <li>Within <strong>one business day</strong>, a CRS incorporation specialist will contact you at <strong>${escapeHtml(d.contact.email)}</strong> (or by ${escapeHtml(d.contact.contactMethod.toLowerCase())} if you preferred) to schedule the 30-minute call.</li>
        <li>The call is an open conversation — we'll help you figure out whether federal or provincial incorporation fits, what kind of board you'll need, and how names and purposes get chosen.</li>
        <li>You leave with a written checklist tailored to what your organisation actually looks like — yours to keep with no obligation.</li>
      </ol>
      <p>Reply to this email with any questions in the meantime.</p>
      <p style="color:#8A99A8;">— Corporate Registry Services · <a href="${SITE_URL}">${SITE_URL}</a></p>
    </body></html>`;
    await sendOutreach({ to: [d.contact.email], cc: [], bcc: [], subject, html, text });
    return;
  }

  const text = [
    `Hi ${d.contact.fullName},`,
    ``,
    `Thanks for booking a free consultation for your not-for-profit incorporation.`,
    ``,
    `Here's what happens next:`,
    `  1. Within one business day, a CRS incorporation specialist will contact you at ${d.contact.email} (or by ${d.contact.contactMethod.toLowerCase()} if you preferred) to schedule the 30-minute call.`,
    `  2. Before the call, we pre-screen your three proposed names against ${d.organization!.jurisdictionLabel} registry and NUANS:`,
    `       • ${d.organization!.name1}`,
    `       • ${d.organization!.name2}`,
    `       • ${d.organization!.name3}`,
    `  3. We check your ${d.board.length}-person board against ${d.organization!.jurisdictionLabel} minimums.`,
    `  4. You leave the call with a written checklist of every form, fee and deadline — yours to keep even if you decide not to file with us.`,
    ``,
    `There's no obligation. Reply to this email with any questions in the meantime.`,
    ``,
    `— Corporate Registry Services`,
    SITE_URL,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1D2A35;">
    <p>Hi ${escapeHtml(d.contact.fullName)},</p>
    <p>Thanks for booking a <strong>free consultation</strong> for your not-for-profit incorporation.</p>
    <p><strong>Here's what happens next:</strong></p>
    <ol>
      <li>Within <strong>one business day</strong>, a CRS incorporation specialist will contact you at <strong>${escapeHtml(d.contact.email)}</strong> (or by ${escapeHtml(d.contact.contactMethod.toLowerCase())} if you preferred) to schedule the 30-minute call.</li>
      <li>Before the call, we pre-screen your three proposed names against ${escapeHtml(d.organization!.jurisdictionLabel)} registry and NUANS:
        <ul style="margin-top:0.35rem;">
          <li>${escapeHtml(d.organization!.name1)}</li>
          <li>${escapeHtml(d.organization!.name2)}</li>
          <li>${escapeHtml(d.organization!.name3)}</li>
        </ul>
      </li>
      <li>We check your ${d.board.length}-person board against ${escapeHtml(d.organization!.jurisdictionLabel)} minimums.</li>
      <li>You leave the call with a written checklist of every form, fee and deadline — yours to keep even if you decide not to file with us.</li>
    </ol>
    <p>There's no obligation. Reply to this email with any questions in the meantime.</p>
    <p style="color:#8A99A8;">— Corporate Registry Services · <a href="${SITE_URL}">${SITE_URL}</a></p>
  </body></html>`;

  await sendOutreach({ to: [d.contact.email], cc: [], bcc: [], subject, html, text });
}

async function sendOpsNotification(d: NfpConsultationDoc) {
  const tag     = d.explorationMode ? "[NFP Consult · EXPLORE]" : "[NFP Consult]";
  const org     = d.organization;
  const summary = org ? `${org.jurisdictionLabel} — ${org.name1}` : `preliminary call — hasn't picked names yet`;
  const subject = `${tag} ${d.contact.fullName} — ${summary}`;

  const lines: string[] = [
    d.explorationMode
      ? `⚠ EXPLORATION MODE — visitor hasn't finalised names, board or activities yet. Preliminary call requested.`
      : `New NFP incorporation consultation request:`,
    ``,
    `── Contact ─────────────────────`,
    `  Name:            ${d.contact.fullName}`,
    `  Email:           ${d.contact.email}`,
    `  Phone:           ${d.contact.phone}`,
    `  Prefers:         ${d.contact.contactMethod} · ${d.contact.timeWindow}`,
  ];

  if (org) {
    lines.push(
      ``,
      `── Organization ────────────────`,
      `  Jurisdiction:    ${org.jurisdictionLabel}`,
      `  Name option 1:   ${org.name1}`,
      `  Name option 2:   ${org.name2}`,
      `  Name option 3:   ${org.name3}`,
      `  Registered office: ${org.office.street}, ${org.office.city}, ${org.office.province} ${org.office.postal}`,
      `  Nature:          ${org.nature}${org.natureOther ? ` (${org.natureOther})` : ""}`,
      ``,
      `  Purpose:`,
      ...indent(org.purpose, "    "),
      ``,
      `  Serves:`,
      ...indent(org.serves, "    "),
      ``,
      `── Board (${d.board.length}) ────────────────`,
    );
    d.board.forEach((b, i) => {
      lines.push(
        `  ${i + 1}. ${b.fullName} — ${b.role}`,
        `     ${b.email}${b.phone ? ` · ${b.phone}` : ""}`,
        `     ${b.address.street}, ${b.address.city}, ${b.address.province} ${b.address.postal}`,
      );
    });
  }

  if (d.activities) {
    lines.push(
      ``,
      `── Activities ──────────────────`,
      `  Donations:            ${d.activities.donations}`,
      `  CRA charity plan:     ${d.activities.charity}`,
      `  Events/year:          ${d.activities.eventsPerYear}`,
      `  First-year revenue:   ${d.activities.annualRevenue}`,
      `  Government grants:    ${d.activities.grants}`,
    );
  }
  if (d.notes) {
    lines.push(``, `── Notes ───────────────────────`, ...indent(d.notes, "  "));
  }
  lines.push(``, `Source: ${d.sourcePath}`);

  const text = lines.join("\n");
  await sendOutreach({
    to: [OPS_INBOX], cc: [], bcc: [],
    subject,
    html: `<pre style="font-family:monospace;font-size:13px;line-height:1.45;">${escapeHtml(text)}</pre>`,
    text,
  });
}

function indent(s: string, prefix: string): string[] {
  return s.split(/\r?\n/).map((line) => prefix + line);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
