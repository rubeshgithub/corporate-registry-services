import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  ensureOutreachIndexes,
  isSuppressed,
  outreachSends,
  outreachTokens,
  type OutreachCompany,
  type OutreachService,
} from "@/lib/outreach-mongo";
import { newToken, signUnsubscribe } from "@/lib/outreach-token";
import { TEMPLATES } from "@/lib/outreach-templates";
import { sendOutreach } from "@/lib/outreach-ses";

/**
 * POST /api/admin/outreach/send
 *
 * Creates a token, renders the chosen template, sends the email via SES
 * (with the outreach configuration set), and logs the full send for CASL
 * audit. Suppression is checked before any of that — a suppressed recipient
 * gets a 409 with { suppressed: true }.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://corporateregistryservices.ca";

export const runtime = "nodejs";

type Body = {
  service:        OutreachService;
  company:        OutreachCompany;
  to:             string[];
  cc?:            string[];
  bcc?:           string[];
  recipientName?: string;
  campaignId?:    string;
  subjectOverride?: string;
  customIntro?:   string;
};

function normalizeEmails(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.map((s) => String(s ?? "").trim().toLowerCase()).filter(Boolean);
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const template = TEMPLATES[body.service];
  if (!template) return NextResponse.json({ error: "Unknown template." }, { status: 400 });

  const to  = normalizeEmails(body.to);
  const cc  = normalizeEmails(body.cc);
  const bcc = normalizeEmails(body.bcc);
  if (!to.length) return NextResponse.json({ error: "At least one To: recipient is required." }, { status: 400 });
  if (to.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) {
    return NextResponse.json({ error: "Invalid To: address." }, { status: 400 });
  }

  if (!body.company?.name?.trim() || !body.company?.provinceKey) {
    return NextResponse.json({ error: "Company name and jurisdiction are required." }, { status: 400 });
  }

  await ensureOutreachIndexes();

  // Suppression check — never send to a suppressed address, ever.
  for (const addr of [...to, ...cc, ...bcc]) {
    if (await isSuppressed(addr)) {
      return NextResponse.json({ error: `Address is on the suppression list: ${addr}`, suppressed: true }, { status: 409 });
    }
  }

  const token = newToken();
  const primaryTo = to[0];
  // Two-click unsubscribe — link lands on a confirmation page, which POSTs
  // the actual action. Blocks Gmail/Outlook/Proofpoint pre-fetchers from
  // silently auto-unsubscribing every recipient on delivery.
  const unsubscribeUrl = `${SITE_URL}/o/unsubscribe?e=${encodeURIComponent(primaryTo)}&s=${signUnsubscribe(primaryTo)}&t=${token}`;

  const rendered = template.render({
    token,
    company:        body.company,
    recipientName:  body.recipientName,
    unsubscribeUrl,
    customIntro:    body.customIntro,
  });

  const subject = body.subjectOverride?.trim() || rendered.subject;

  const now = new Date();

  // Persist the token first, so a click on a link that's live before the SES
  // callback returns still resolves. (SES send is quick, but this ordering
  // is safer.)
  await (await outreachTokens()).insertOne({
    token,
    service:        body.service,
    company:        body.company,
    recipientEmail: primaryTo,
    recipientName:  body.recipientName?.trim() || undefined,
    campaignId:     body.campaignId?.trim() || undefined,
    createdAt:      now,
    sentAt:         now,
    clickCount:     0,
  });

  const sendRes = await sendOutreach({
    to, cc, bcc,
    subject,
    html: rendered.html,
    text: rendered.text,
  });

  await (await outreachSends()).insertOne({
    tokenId:      token,
    service:      body.service,
    companyName:  body.company.name,
    registryId:   body.company.registryId,
    campaignId:   body.campaignId?.trim() || undefined,
    from:         process.env.SES_OUTREACH_FROM ?? "",
    to, cc, bcc,
    subject,
    bodyHtml:     rendered.html,
    bodyText:     rendered.text,
    sesMessageId: sendRes.sesMessageId,
    sentBy:       "admin",
    sentAt:       now,
  });

  if (!sendRes.ok) {
    return NextResponse.json({ error: sendRes.error, token }, { status: 502 });
  }

  return NextResponse.json({
    ok:            true,
    token,
    landingUrl:    `${SITE_URL}/o/${token}`,
    sesMessageId:  sendRes.sesMessageId,
  });
}
