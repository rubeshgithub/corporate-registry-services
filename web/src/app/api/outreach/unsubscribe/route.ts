import { NextResponse } from "next/server";
import { outreachSuppression, ensureOutreachIndexes } from "@/lib/outreach-mongo";
import { verifyUnsubscribe } from "@/lib/outreach-token";
import { companies } from "@/lib/registrar-mongo";
import { sendOutreach } from "@/lib/outreach-ses";

/**
 * POST /api/outreach/unsubscribe    (body: form-urlencoded, keys: e, s, t)
 *
 * The link in outreach emails now lands on /o/unsubscribe (a confirmation
 * page). Clicking "Yes, unsubscribe me" on that page POSTs here. Because the
 * unsubscribe action is now behind an actual user click, mail-client
 * pre-fetchers (Gmail scanner, Outlook Safe Links, Proofpoint, etc.) can't
 * silently auto-unsubscribe recipients any more.
 *
 * On success we:
 *   1. Insert into crs_analytics.outreach_suppression        (source of truth for send-time check)
 *   2. Denormalize contact.suppressed = true on crs.companies (so /admin/outreach can badge / filter without a join)
 *   3. Send a plain-text confirmation email to the recipient  (closes the loop; low volume so no reputation risk)
 *   4. Redirect to /unsubscribed?e=<email>                    (human-facing confirmation)
 *
 * GET /api/outreach/unsubscribe  is kept as a backwards-compat handler that
 * just redirects to /o/unsubscribe with the same query — so old emails already
 * out in the wild land on the confirm page instead of firing the action.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://corporateregistryservices.ca";

/** Denormalize suppression to every companies doc using this email.
 *  A single email can be attached to many corps (bookkeeper / accountant),
 *  so this is an updateMany, not updateOne. Safe to call even if no docs
 *  match. Also creates the contact.email index on first call so this stays
 *  fast at 1.5M+ docs. */
async function denormalizeSuppression(email: string) {
  try {
    const c = await companies();
    await c.createIndex({ "contact.email": 1 }, { sparse: true, name: "contact_email_sparse" });
    await c.updateMany(
      { "contact.email": email },
      { $set: { "contact.suppressed": true, "contact.suppressedAt": new Date() } },
    );
  } catch (e) {
    console.error("[outreach/unsubscribe] failed to denormalize suppression to companies:", e);
    // Suppression is still recorded in the source-of-truth collection; the
    // denorm is an optimization for the outreach console. Don't fail the
    // whole request if this update misfires.
  }
}

/** Best-effort confirmation email. Fires under the outreach SES
 *  configuration set so its reputation stays isolated from transactional
 *  email. Failure is logged but doesn't block the redirect — the browser
 *  page already confirms the unsubscribe visually. */
async function sendConfirmationEmail(email: string) {
  const subject = "You've been unsubscribed — Corporate Registry Services";
  const text = [
    `Hi,`,
    ``,
    `This confirms that ${email} has been unsubscribed from Corporate Registry Services outreach emails.`,
    ``,
    `You will not receive any further filing-reminder or outreach emails from us.`,
    ``,
    `If this was a mistake, or you need to reach us about an existing order, reply to this email or write to support@corporateregistryservices.ca.`,
    ``,
    `— Corporate Registry Services`,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1D2A35;">
    <p>Hi,</p>
    <p>This confirms that <strong>${email}</strong> has been unsubscribed from Corporate Registry Services outreach emails.</p>
    <p>You will not receive any further filing-reminder or outreach emails from us.</p>
    <p>If this was a mistake, or you need to reach us about an existing order, reply to this email or write to <a href="mailto:support@corporateregistryservices.ca">support@corporateregistryservices.ca</a>.</p>
    <p style="color:#8A99A8;">— Corporate Registry Services</p>
  </body></html>`;

  try {
    const res = await sendOutreach({ to: [email], cc: [], bcc: [], subject, html, text });
    if (!res.ok) console.warn("[outreach/unsubscribe] confirmation email failed:", res.error);
  } catch (e) {
    console.warn("[outreach/unsubscribe] confirmation email threw:", e);
  }
}

export async function POST(req: Request) {
  const form  = await req.formData().catch(() => null);
  const email = String(form?.get("e") ?? "").trim().toLowerCase();
  const sig   = String(form?.get("s") ?? "").trim();
  const token = String(form?.get("t") ?? "").trim();

  if (!email || !sig || !verifyUnsubscribe(email, sig)) {
    return NextResponse.redirect(new URL("/unsubscribed?err=invalid", SITE_URL), 303);
  }

  try {
    await ensureOutreachIndexes();
    await (await outreachSuppression()).updateOne(
      { email },
      {
        $setOnInsert: {
          email,
          reason:      "unsubscribed",
          addedAt:     new Date(),
          sourceToken: token || undefined,
        },
      },
      { upsert: true },
    );
  } catch (e) {
    console.error("[outreach/unsubscribe] failed to record suppression:", e);
    return NextResponse.redirect(new URL("/unsubscribed?err=server", SITE_URL), 303);
  }

  // Best-effort side effects — don't block the redirect if these misfire.
  // Run in parallel so the user isn't waiting on SES + Mongo serially.
  await Promise.allSettled([
    denormalizeSuppression(email),
    sendConfirmationEmail(email),
  ]);

  // 303 See Other so a form POST → GET redirect is honored consistently across browsers.
  return NextResponse.redirect(new URL(`/unsubscribed?e=${encodeURIComponent(email)}`, SITE_URL), 303);
}

/** Backwards-compat: old emails already in inboxes have GET-style unsubscribe
 *  URLs. Redirect those to the confirmation page instead of firing the
 *  action directly, so pre-fetchers still can't auto-unsubscribe historical
 *  recipients. */
export async function GET(req: Request) {
  const url   = new URL(req.url);
  const email = url.searchParams.get("e") ?? "";
  const sig   = url.searchParams.get("s") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const target = new URL("/o/unsubscribe", SITE_URL);
  if (email) target.searchParams.set("e", email);
  if (sig)   target.searchParams.set("s", sig);
  if (token) target.searchParams.set("t", token);
  return NextResponse.redirect(target, 302);
}
