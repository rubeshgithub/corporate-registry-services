import { NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  ensureOutreachIndexes,
  incorporationConsultations,
  isSuppressed,
  type IncorporationConsultationDoc,
} from "@/lib/outreach-mongo";
import { sendOutreach } from "@/lib/outreach-ses";

/**
 * POST /api/incorporation/consultation
 *
 * Public lead-capture for the for-profit incorporation consultation booking
 * form at /incorporation/book-free-consultation. Mirrors the NFP consultation
 * pattern: validate → store in `incorporation_consultation_requests` → fire
 * requester confirmation + ops notification. Specialist replies within one
 * business day, no calendar link.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL  = process.env.NEXT_PUBLIC_SITE_URL     ?? "https://www.corporateregistryservices.ca";
const OPS_INBOX = process.env.INCORP_OPS_INBOX         ?? process.env.NFP_OPS_INBOX ?? process.env.MINUTEBOOK_OPS_INBOX ?? process.env.SES_OUTREACH_REPLY_TO ?? "support@corporateregistryservices.ca";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEDUPE_MS = 60 * 60 * 1000;

type Body = {
  contact?: {
    fullName?: string; email?: string; phone?: string;
    contactMethod?: string; timeWindow?: string;
    justExploring?: boolean;
  };
  explorationMode?: boolean;
  corporation?: {
    jurisdictionKey?: string; jurisdictionLabel?: string;
    nameType?: "named" | "numbered";
    name1?: string; name2?: string; name3?: string;
    office?: { street?: string; city?: string; province?: string; postal?: string };
    nature?: string; natureOther?: string;
    activity?: string;
  } | null;
  directors?: Array<{
    fullName?: string; email?: string; phone?: string;
    address?: { street?: string; city?: string; province?: string; postal?: string };
    canadianResident?: boolean;
    ageOk?: boolean;
  }>;
  shareStructure?: {
    structureType?: string;
    shareholders?:  string;
    specialRights?: string;
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

  const email    = String(body.contact?.email ?? "").trim().toLowerCase();
  const fullName = String(body.contact?.fullName ?? "").trim();
  const phone    = String(body.contact?.phone ?? "").trim();
  if (!fullName || fullName.length < 2)     return NextResponse.json({ error: "Please enter your full name." }, { status: 400 });
  if (!email || !EMAIL_RE.test(email))      return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  if (phone.replace(/\D/g, "").length !== 10) return NextResponse.json({ error: "Please enter a valid 10-digit Canadian phone number." }, { status: 400 });

  const exploring = body.explorationMode === true || body.contact?.justExploring === true;

  const corp        = exploring ? null : (body.corporation ?? {});
  const directorsIn = exploring ? [] : (Array.isArray(body.directors) ? body.directors : []);
  const share       = exploring ? null : (body.shareStructure ?? {});
  const office      = corp?.office ?? {};

  if (!exploring) {
    if (!corp!.jurisdictionKey)             return NextResponse.json({ error: "Please select a jurisdiction." }, { status: 400 });
    const nameType = corp!.nameType ?? "named";
    if (nameType === "named") {
      if (!corp!.name1 || !corp!.name2 || !corp!.name3) {
        return NextResponse.json({ error: "Please provide three intended name options (or switch to a numbered corporation)." }, { status: 400 });
      }
    }
    if (!office.street || !office.city || !office.province || !office.postal) {
      return NextResponse.json({ error: "Please provide a complete registered office address." }, { status: 400 });
    }
    if (!corp!.nature)                             return NextResponse.json({ error: "Please pick the nature of the business." }, { status: 400 });
    if ((corp!.activity ?? "").trim().length < 30) return NextResponse.json({ error: "Please describe what the business will do (minimum 30 characters)." }, { status: 400 });
  }

  const filledDirectors = directorsIn.filter((d) => (d.fullName ?? "").trim() && EMAIL_RE.test((d.email ?? "").trim()));
  if (!exploring) {
    if (filledDirectors.length < 1) return NextResponse.json({ error: "Please add at least one director with name, email, and address." }, { status: 400 });
    if (!filledDirectors.every((d) => d.ageOk === true)) {
      return NextResponse.json({ error: "Please confirm each director is 18 years or older." }, { status: 400 });
    }
    if (!filledDirectors.every((d) => d.address?.street && d.address?.city && d.address?.province && d.address?.postal)) {
      return NextResponse.json({ error: "Each director needs a complete residential address (required by all Canadian registries)." }, { status: 400 });
    }
  }

  if (!exploring) {
    if (!share!.structureType || !share!.shareholders || !share!.specialRights) {
      return NextResponse.json({ error: "Please answer the share structure questions." }, { status: 400 });
    }
  }

  if (await isSuppressed(email)) {
    return NextResponse.json({ error: "This address has been unsubscribed from our communications. Please email support@corporateregistryservices.ca for help." }, { status: 403 });
  }

  await ensureOutreachIndexes();
  const col = await incorporationConsultations();
  const now = new Date();

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

  const doc: IncorporationConsultationDoc = {
    contact: {
      fullName,
      email,
      phone,
      contactMethod: String(body.contact?.contactMethod ?? "Email"),
      timeWindow:    String(body.contact?.timeWindow    ?? "Morning"),
    },
    explorationMode: exploring,
    corporation: exploring ? null : {
      jurisdictionKey:   String(corp!.jurisdictionKey ?? ""),
      jurisdictionLabel: String(corp!.jurisdictionLabel ?? corp!.jurisdictionKey ?? ""),
      nameType:          (corp!.nameType ?? "named") as "named" | "numbered",
      name1:             corp!.nameType === "numbered" ? undefined : String(corp!.name1 ?? "").trim(),
      name2:             corp!.nameType === "numbered" ? undefined : String(corp!.name2 ?? "").trim(),
      name3:             corp!.nameType === "numbered" ? undefined : String(corp!.name3 ?? "").trim(),
      office: {
        street:   String(office.street ?? "").trim(),
        city:     String(office.city ?? "").trim(),
        province: String(office.province ?? "").trim(),
        postal:   String(office.postal ?? "").trim(),
      },
      nature:      String(corp!.nature ?? ""),
      natureOther: corp!.natureOther?.trim() || undefined,
      activity:    String(corp!.activity ?? "").trim(),
    },
    directors: filledDirectors.map((d) => ({
      fullName: String(d.fullName ?? "").trim(),
      email:    String(d.email ?? "").trim().toLowerCase(),
      phone:    d.phone?.trim() || undefined,
      address: {
        street:   String(d.address?.street ?? "").trim(),
        city:     String(d.address?.city ?? "").trim(),
        province: String(d.address?.province ?? "").trim(),
        postal:   String(d.address?.postal ?? "").trim(),
      },
      canadianResident: d.canadianResident === true,
      ageOk:            d.ageOk === true,
    })),
    shareStructure: exploring ? null : {
      structureType: String(share!.structureType ?? ""),
      shareholders:  String(share!.shareholders ?? ""),
      specialRights: String(share!.specialRights ?? ""),
    },
    notes:      body.notes?.trim() || undefined,
    sourcePath: String(body.sourcePath ?? "/incorporation/book-free-consultation"),
    ipHash:     ipHashFromRequest(req) || undefined,
    userAgent:  (req.headers.get("user-agent") ?? "").slice(0, 200) || undefined,
    createdAt:  now,
  };

  await col.insertOne(doc);

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

async function sendRequesterConfirmation(d: IncorporationConsultationDoc) {
  const subject = "Free incorporation consultation — request received";

  if (d.explorationMode) {
    const text = [
      `Hi ${d.contact.fullName},`,
      ``,
      `Thanks for booking a free preliminary call about incorporating your business.`,
      ``,
      `Here's what happens next:`,
      `  1. Within one business day, a CRS incorporation specialist will contact you at ${d.contact.email} (or by ${d.contact.contactMethod.toLowerCase()} if you preferred) to schedule the 30-minute call.`,
      `  2. The call is an open conversation — we'll help you figure out whether federal or provincial incorporation fits, whether to file named or numbered, how many directors you need, and how to structure your shares.`,
      `  3. You leave with a written checklist tailored to your situation — yours to keep with no obligation.`,
      ``,
      `Reply to this email with any questions in the meantime.`,
      ``,
      `— Corporate Registry Services`,
      SITE_URL,
    ].join("\n");
    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1D2A35;">
      <p>Hi ${escapeHtml(d.contact.fullName)},</p>
      <p>Thanks for booking a <strong>free preliminary call</strong> about incorporating your business.</p>
      <p><strong>Here's what happens next:</strong></p>
      <ol>
        <li>Within <strong>one business day</strong>, a CRS incorporation specialist will contact you at <strong>${escapeHtml(d.contact.email)}</strong> (or by ${escapeHtml(d.contact.contactMethod.toLowerCase())} if you preferred) to schedule the 30-minute call.</li>
        <li>The call is an open conversation — we'll help you figure out whether federal or provincial incorporation fits, whether to file named or numbered, how many directors you need, and how to structure your shares.</li>
        <li>You leave with a written checklist tailored to your situation — yours to keep with no obligation.</li>
      </ol>
      <p>Reply to this email with any questions in the meantime.</p>
      <p style="color:#8A99A8;">— Corporate Registry Services · <a href="${SITE_URL}">${SITE_URL}</a></p>
    </body></html>`;
    await sendOutreach({ to: [d.contact.email], cc: [], bcc: [], subject, html, text });
    return;
  }

  const corp = d.corporation!;
  const namesBlock = corp.nameType === "numbered"
    ? `  Filing as a numbered corporation — the registry will assign the next available number.`
    : [
        `  Before the call, we pre-screen your three proposed names against ${corp.jurisdictionLabel} registry and NUANS:`,
        `       • ${corp.name1}`,
        `       • ${corp.name2}`,
        `       • ${corp.name3}`,
      ].join("\n");

  const text = [
    `Hi ${d.contact.fullName},`,
    ``,
    `Thanks for booking a free consultation for your ${corp.jurisdictionLabel} incorporation.`,
    ``,
    `Here's what happens next:`,
    `  1. Within one business day, a CRS incorporation specialist will contact you at ${d.contact.email} (or by ${d.contact.contactMethod.toLowerCase()} if you preferred) to schedule the 30-minute call.`,
    namesBlock,
    `  3. We check your ${d.directors.length}-director list against ${corp.jurisdictionLabel} residency and minimum-director rules.`,
    `  4. You leave the call with a written checklist of every form, fee and deadline — yours to keep even if you decide not to file with us.`,
    ``,
    `There's no obligation. Reply to this email with any questions in the meantime.`,
    ``,
    `— Corporate Registry Services`,
    SITE_URL,
  ].join("\n");

  const namesHtml = corp.nameType === "numbered"
    ? `<li>Filing as a <strong>numbered corporation</strong> — the registry will assign the next available number.</li>`
    : `<li>Before the call, we pre-screen your three proposed names against ${escapeHtml(corp.jurisdictionLabel)} registry and NUANS:
        <ul style="margin-top:0.35rem;">
          <li>${escapeHtml(corp.name1 ?? "")}</li>
          <li>${escapeHtml(corp.name2 ?? "")}</li>
          <li>${escapeHtml(corp.name3 ?? "")}</li>
        </ul>
      </li>`;

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1D2A35;">
    <p>Hi ${escapeHtml(d.contact.fullName)},</p>
    <p>Thanks for booking a <strong>free consultation</strong> for your ${escapeHtml(corp.jurisdictionLabel)} incorporation.</p>
    <p><strong>Here's what happens next:</strong></p>
    <ol>
      <li>Within <strong>one business day</strong>, a CRS incorporation specialist will contact you at <strong>${escapeHtml(d.contact.email)}</strong> (or by ${escapeHtml(d.contact.contactMethod.toLowerCase())} if you preferred) to schedule the 30-minute call.</li>
      ${namesHtml}
      <li>We check your ${d.directors.length}-director list against ${escapeHtml(corp.jurisdictionLabel)} residency and minimum-director rules.</li>
      <li>You leave the call with a written checklist of every form, fee and deadline — yours to keep even if you decide not to file with us.</li>
    </ol>
    <p>There's no obligation. Reply to this email with any questions in the meantime.</p>
    <p style="color:#8A99A8;">— Corporate Registry Services · <a href="${SITE_URL}">${SITE_URL}</a></p>
  </body></html>`;

  await sendOutreach({ to: [d.contact.email], cc: [], bcc: [], subject, html, text });
}

async function sendOpsNotification(d: IncorporationConsultationDoc) {
  const tag     = d.explorationMode ? "[Incorp Consult · EXPLORE]" : "[Incorp Consult]";
  const corp    = d.corporation;
  const summary = corp
    ? (corp.nameType === "numbered"
        ? `${corp.jurisdictionLabel} — numbered corporation`
        : `${corp.jurisdictionLabel} — ${corp.name1}`)
    : `preliminary call — hasn't picked jurisdiction yet`;
  const subject = `${tag} ${d.contact.fullName} — ${summary}`;

  const lines: string[] = [
    d.explorationMode
      ? `⚠ EXPLORATION MODE — visitor hasn't finalised jurisdiction, name, directors, or share structure yet. Preliminary call requested.`
      : `New incorporation consultation request:`,
    ``,
    `── Contact ─────────────────────`,
    `  Name:            ${d.contact.fullName}`,
    `  Email:           ${d.contact.email}`,
    `  Phone:           ${d.contact.phone}`,
    `  Prefers:         ${d.contact.contactMethod} · ${d.contact.timeWindow}`,
  ];

  if (corp) {
    lines.push(
      ``,
      `── Corporation ─────────────────`,
      `  Jurisdiction:    ${corp.jurisdictionLabel}`,
      `  Name type:       ${corp.nameType === "numbered" ? "Numbered" : "Named"}`,
    );
    if (corp.nameType === "named") {
      lines.push(
        `  Name option 1:   ${corp.name1 ?? ""}`,
        `  Name option 2:   ${corp.name2 ?? ""}`,
        `  Name option 3:   ${corp.name3 ?? ""}`,
      );
    }
    lines.push(
      `  Registered office: ${corp.office.street}, ${corp.office.city}, ${corp.office.province} ${corp.office.postal}`,
      `  Nature:          ${corp.nature}${corp.natureOther ? ` (${corp.natureOther})` : ""}`,
      ``,
      `  What the business will do:`,
      ...indent(corp.activity, "    "),
      ``,
      `── Directors (${d.directors.length}) ────────────`,
    );
    d.directors.forEach((dir, i) => {
      lines.push(
        `  ${i + 1}. ${dir.fullName}${dir.canadianResident ? " · Canadian resident" : " · NON-resident"}`,
        `     ${dir.email}${dir.phone ? ` · ${dir.phone}` : ""}`,
        `     ${dir.address.street}, ${dir.address.city}, ${dir.address.province} ${dir.address.postal}`,
      );
    });
  }

  if (d.shareStructure) {
    lines.push(
      ``,
      `── Share structure ─────────────`,
      `  Structure type:       ${d.shareStructure.structureType}`,
      `  # of shareholders:    ${d.shareStructure.shareholders}`,
      `  Special share rights: ${d.shareStructure.specialRights}`,
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
