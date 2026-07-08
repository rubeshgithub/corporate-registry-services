import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { TEMPLATES } from "@/lib/outreach-templates";
import { signUnsubscribe } from "@/lib/outreach-token";
import type { OutreachCompany, OutreachService } from "@/lib/outreach-mongo";

/**
 * POST /api/admin/outreach/preview
 *
 * Renders a template exactly like the send endpoint, but with a fake token
 * and no persistence / no SES call. The admin UI uses this to show a live
 * preview as the user edits fields.
 */

export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://corporateregistryservices.ca";
const PREVIEW_TOKEN = "PREVIEWTOKEN";

type Body = {
  service:        OutreachService;
  company:        OutreachCompany;
  recipientEmail?: string;
  recipientName?: string;
  customIntro?:   string;
  subjectOverride?: string;
};

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

  const email = (body.recipientEmail ?? "preview@example.com").trim().toLowerCase();
  let sig = "preview";
  try { sig = signUnsubscribe(email); } catch { /* preview if secret is missing */ }
  const unsubscribeUrl = `${SITE_URL}/api/outreach/unsubscribe?e=${encodeURIComponent(email)}&s=${sig}&t=${PREVIEW_TOKEN}`;

  const rendered = template.render({
    token:         PREVIEW_TOKEN,
    company:       body.company,
    recipientName: body.recipientName,
    unsubscribeUrl,
    customIntro:   body.customIntro,
  });

  return NextResponse.json({
    subject: body.subjectOverride?.trim() || rendered.subject,
    html:    rendered.html,
    text:    rendered.text,
  });
}
