import { NextResponse } from "next/server";
import crypto from "node:crypto";
import Stripe from "stripe";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { orderDrafts, ensureOrderDraftIndexes } from "@/lib/order-drafts-mongo";

/**
 * POST /api/admin/abandoned-sweep
 *
 * Emails the ops inbox about order drafts that have gone cold — a visitor
 * who picked a company or typed contact details on an /order/* page and then
 * left without paying.
 *
 * Why a sweep rather than an alert at the moment of abandonment: there is no
 * reliable "visitor left" event in a browser. The beacon tells us a draft was
 * touched; only the *absence* of further touches means they gave up, and that
 * can only be observed after the fact.
 *
 * Why not email on arrival: the SMS already covers "someone is on an order
 * page". An email per arrival would be noise. This fires only once a draft is
 * cold, and only when it carries something worth acting on.
 *
 * Auth: Bearer ADMIN_SWEEP_TOKEN, or an authenticated admin cookie. Intended
 * to be called on a schedule (see .github/workflows/abandoned-sweep.yml).
 *
 * Query params:
 *   minutes  how cold before a draft counts as abandoned (default 20, max 1440)
 *   dry      "1" to report what would be sent without sending or marking
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_COLD_MINUTES = 20;
/* Only alert on abandonments from the last day — older ones live on the
   dashboard, not in the inbox. */
const DEFAULT_MAX_AGE_HOURS = 24;
/* A burst guard: if something goes wrong upstream we would rather under-report
   than dump hundreds of emails into the inbox. */
const MAX_EMAILS_PER_RUN = 25;

function makeSes() {
  return new SESClient({
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SWEEP_TOKEN?.trim();
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!presented) return false;
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url     = new URL(req.url);
  const dry     = url.searchParams.get("dry") === "1";
  const minutes = Math.min(
    Math.max(parseInt(url.searchParams.get("minutes") ?? "", 10) || DEFAULT_COLD_MINUTES, 1),
    1440,
  );
  /* Upper bound on age. Without this, the first live run would mail the
     entire historical backlog — drafts that are already visible on the
     dashboard and long past being worth a same-day call. Only genuinely
     recent abandonments justify an alert. */
  const maxAgeHours = Math.min(
    Math.max(parseInt(url.searchParams.get("maxAgeHours") ?? "", 10) || DEFAULT_MAX_AGE_HOURS, 1),
    24 * 30,
  );

  await ensureOrderDraftIndexes();
  const col     = await orderDrafts();
  const cutoff  = new Date(Date.now() - minutes * 60_000);
  const floorAt = new Date(Date.now() - maxAgeHours * 3600_000);

  /* Cold, never-notified drafts that carry something actionable. A row with
     neither a company nor any contact detail is just a page visit and is not
     worth an email. */
  const candidates = await col
    .find({
      notifiedAt: { $exists: false },
      updatedAt:  { $lt: cutoff, $gte: floorAt },
      $or: [
        { "company.name": { $exists: true, $nin: ["", null] } },
        { "contact.email": { $exists: true, $nin: ["", null] } },
        { "contact.phone": { $exists: true, $nin: ["", null] } },
        { "contact.name":  { $exists: true, $nin: ["", null] } },
      ],
    })
    .sort({ updatedAt: -1 })
    .limit(MAX_EMAILS_PER_RUN)
    .toArray();

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, coldMinutes: minutes, maxAgeHours, considered: 0, emailed: 0, skippedPaid: 0 });
  }

  /* Don't chase someone who actually paid. Match on the email they typed
     against recent paid Stripe sessions — the same cross-reference the
     dashboard's cart-abandonment card uses. */
  const paidEmails = new Set<string>();
  const secret = process.env.STRIPE_SECRET_KEY;
  if (secret) {
    try {
      const stripe   = new Stripe(secret);
      const since    = Math.floor((Date.now() - 7 * 24 * 3600 * 1000) / 1000);
      const sessions = await stripe.checkout.sessions.list({ limit: 100, created: { gte: since } });
      for (const s of sessions.data) {
        if (s.payment_status === "paid" && s.customer_details?.email) {
          paidEmails.add(s.customer_details.email.trim().toLowerCase());
        }
      }
    } catch (e) {
      /* Stripe unavailable — better to send a possibly redundant alert than
         to silently drop a real lead. */
      console.warn("[abandoned-sweep] Stripe cross-check failed:", e instanceof Error ? e.message : e);
    }
  }

  const ownerEmail = process.env.NOTIFY_EMAIL ?? process.env.OWNER_EMAIL ?? "info@crs.ca";
  const fromEmail  = process.env.SES_FROM     ?? process.env.FROM_EMAIL  ?? "noreply@crs.ca";
  const siteUrl    = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.corporateregistryservices.ca";
  const ses        = makeSes();

  let emailed = 0, skippedPaid = 0;

  for (const d of candidates) {
    const email = (d.contact?.email ?? "").trim().toLowerCase();
    if (email && paidEmails.has(email)) {
      skippedPaid++;
      if (!dry) await col.updateOne({ _id: d._id }, { $set: { notifiedAt: new Date() } });
      continue;
    }

    const reachable = [d.contact?.email, d.contact?.phone].some((v) => (v ?? "").trim());
    const mins      = Math.round((Date.now() - new Date(d.updatedAt).getTime()) / 60_000);

    const body = `
ABANDONED ORDER — ${d.service}
=====================================================
They reached ${d.path} and did not complete payment.
Last activity ${mins} minute${mins === 1 ? "" : "s"} ago.

--- Company ---
Name:          ${d.company?.name || "— (not selected)"}
Registry ID:   ${d.company?.registryId || "—"}
BN:            ${d.company?.businessNumber || "—"}
Jurisdiction:  ${d.company?.jurisdiction || d.company?.provinceKey || "—"}

--- Contact (as far as they filled it in) ---
Name:          ${d.contact?.name  || "—"}
Email:         ${d.contact?.email || "—"}
Phone:         ${d.contact?.phone || "—"}

${reachable
  ? "REACHABLE — worth a personal reply. If they could not pay by card, offer\nInterac e-Transfer and send the address directly to them."
  : "NOT REACHABLE — no email or phone captured. Company details only."}

Session:       ${d.sessionId}
First seen:    ${new Date(d.createdAt).toISOString()}
Last activity: ${new Date(d.updatedAt).toISOString()}
=====================================================

Full list: ${siteUrl}/admin/analytics  (Cart abandonment card)
`.trim();

    if (!dry) {
      try {
        await ses.send(new SendEmailCommand({
          Source: fromEmail,
          Destination: { ToAddresses: [ownerEmail] },
          Message: {
            Subject: { Data: `[CRS] Abandoned ${d.service} — ${d.company?.name || d.contact?.email || "unknown company"}${reachable ? "" : " (no contact)"}` },
            Body:    { Text: { Data: body } },
          },
        }));
        await col.updateOne({ _id: d._id }, { $set: { notifiedAt: new Date() } });
        emailed++;
      } catch (e) {
        /* Leave notifiedAt unset so the next sweep retries this one. */
        console.error("[abandoned-sweep] send failed for", d.sessionId, e instanceof Error ? e.message : e);
      }
    } else {
      emailed++;
    }
  }

  return NextResponse.json({
    ok: true,
    dry,
    coldMinutes: minutes,
    maxAgeHours,
    considered: candidates.length,
    emailed,
    skippedPaid,
  });
}
