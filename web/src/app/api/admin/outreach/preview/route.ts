import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { TEMPLATES } from "@/lib/outreach-templates";
import { getPrices } from "@/lib/pricing";
import { signUnsubscribe } from "@/lib/outreach-token";
import { isSuppressed, type OutreachCompany, type OutreachService } from "@/lib/outreach-mongo";
import { docu10OptedOut } from "@/lib/docu10-optouts";

/**
 * POST /api/admin/outreach/preview
 *
 * Renders a template exactly like the send endpoint, but with a fake token
 * and no persistence / no SES call. The admin UI uses this to show a live
 * preview as the user edits fields.
 *
 * It also runs the send endpoint's recipient checks (outreach_suppression and
 * docu10's opt-out list) on every To/Cc/Bcc address, so staff see a blocked
 * address while composing. That is a warning only: the send endpoint checks
 * again and is what actually refuses.
 */

export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://corporateregistryservices.ca";
const PREVIEW_TOKEN = "PREVIEWTOKEN";

type Body = {
  service:        OutreachService;
  company:        OutreachCompany;
  recipientEmail?: string;
  recipients?:    string[];     // every To/Cc/Bcc address, for the recipient check
  recipientName?: string;
  customIntro?:   string;
  subjectOverride?: string;
};

type BlockedRecipient = { email: string; reason: "outreach_suppression" | "docu10_optout" };

/** failed = a list could not be read, so the send endpoint would refuse. */
async function checkRecipients(list: unknown): Promise<{ blocked: BlockedRecipient[]; failed: boolean }> {
  const addrs = Array.isArray(list)
    ? [...new Set(list.map((s) => String(s ?? "").trim().toLowerCase()).filter(Boolean))].slice(0, 50)
    : [];
  const blocked: BlockedRecipient[] = [];
  let failed = false;
  if (!addrs.length) return { blocked, failed };
  try {
    for (const email of addrs) {
      if (await isSuppressed(email)) blocked.push({ email, reason: "outreach_suppression" });
    }
  } catch (e) {
    console.error("[outreach/preview] could not read outreach_suppression:", e);
    failed = true;
  }
  try {
    for (const email of await docu10OptedOut(addrs)) blocked.push({ email, reason: "docu10_optout" });
  } catch (e) {
    console.error("[outreach/preview] could not read docu10 opt-outs:", e);
    failed = true;
  }
  return { blocked, failed };
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
    prices:        await getPrices(),
  });

  return NextResponse.json({
    subject: body.subjectOverride?.trim() || rendered.subject,
    html:    rendered.html,
    text:    rendered.text,
    recipientCheck: await checkRecipients(body.recipients),
  });
}
