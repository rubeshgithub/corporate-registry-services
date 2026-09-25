import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { inboundMessages, ensureInboundMessageIndexes } from "@/lib/inbound-messages-mongo";
import { searchLeads, ensureSearchLeadIndexes } from "@/lib/search-leads-mongo";
import {
  DAY, HOUR, admit, ipHashFrom, isEmail, oneLine, readJsonObject, savedCounts, text, tooManyRequests,
} from "@/lib/public-form-guard";

/**
 * POST /api/notify/search-help
 *
 * A visitor searched the registry, got zero results, and believes their
 * corporation exists anyway. Sends the enquiry to support@ so an operator
 * can run a manual search, and a fixed acknowledgement to the visitor
 * promising a reply within 24 hours.
 *
 * ── Why this isn't /api/notify/search-lead ───────────────────────────────
 * That route is documented as "No ops notification: this is passive interest,
 * not a booking" — it only mails the visitor. The zero-result popup promises
 * a 24-hour callback, so it needs a route that actually reaches a human.
 * Pointing the popup at search-lead (as it first shipped) made that promise
 * unbacked.
 *
 * ── Security posture ─────────────────────────────────────────────────────
 * Public and unauthenticated, and it sends mail from support@ (DKIM-signed
 * as corporateregistryservices.ca) to an address the visitor typed. So it
 * follows the same rules as /api/contact: the visitor's acknowledgement is
 * fixed text repeating nothing they typed (otherwise this becomes a way to
 * put attacker-written text in someone else's inbox), the searched name is
 * length-capped and oneLine()'d before it reaches a subject header, and
 * admit() caps submissions per IP and per address. Only support@ sees the
 * searched name.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY  = 8_000;
const MAX_QUERY = 200;

const LIMITS = {
  perIpHour:       5,
  perEmailHour:    3,
  acksPerEmailDay: 2,
  acksAllHour:     30,
};

const PROV_LABEL: Record<string, string> = {
  all: "any Canadian jurisdiction", bc: "British Columbia", ab: "Alberta",
  on: "Ontario", federal: "Federal", mb: "Manitoba", sk: "Saskatchewan",
  ns: "Nova Scotia", nb: "New Brunswick", nl: "Newfoundland and Labrador",
  pe: "Prince Edward Island", nt: "Northwest Territories", yt: "Yukon", nu: "Nunavut",
};

function makeSes() {
  return new SESClient({
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

export async function POST(request: Request) {
  const read = await readJsonObject(request, MAX_BODY, {
    tooLong: "Request is too long.",
    invalid: "Invalid JSON",
  });
  if ("response" in read) return read.response;
  const { body } = read;

  const email    = text(body.email).trim();
  const query    = oneLine(body.query).slice(0, MAX_QUERY);
  const province = oneLine(body.province).toLowerCase().slice(0, 20) || "all";

  if (!isEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (query.length < 2) {
    return NextResponse.json({ error: "Search query is missing." }, { status: 400 });
  }

  const emailKey = email.toLowerCase();
  const ipHash   = ipHashFrom(request);
  const now      = Date.now();

  const saved = await savedCounts("search help", async () => {
    await ensureInboundMessageIndexes();
    const col     = await inboundMessages();
    const hourAgo = new Date(now - HOUR);
    const dayAgo  = new Date(now - DAY);
    const [ip, byEmail, acksToEmail, acksAll] = await Promise.all([
      ipHash ? col.countDocuments({ source: "search-help", ipHash, createdAt: { $gte: hourAgo } }) : 0,
      col.countDocuments({ source: "search-help", email: emailKey, createdAt: { $gte: hourAgo } }),
      col.countDocuments({ source: "search-help", email: emailKey, autoReplySent: true, createdAt: { $gte: dayAgo } }),
      col.countDocuments({ source: "search-help", autoReplySent: true, createdAt: { $gte: hourAgo } }),
    ]);
    return { ip, email: byEmail, acksToEmail, acksAll };
  });

  const admitted = admit("search-help", LIMITS, ipHash, emailKey, saved, now);
  if (!admitted) {
    return tooManyRequests("Too many requests. Please try again later, or email us directly at support@corporateregistryservices.ca");
  }
  const { sendAck } = admitted;

  const toEmail   = process.env.NOTIFY_EMAIL ?? process.env.OWNER_EMAIL ?? "support@corporateregistryservices.ca";
  const fromEmail = process.env.SES_FROM     ?? process.env.FROM_EMAIL  ?? "support@corporateregistryservices.ca";
  const provLabel = PROV_LABEL[province] ?? province;
  /* Jurisdictions with no searchable index: the visitor was promised a free
     snapshot within a few business hours, not a 24-hour reply. */
  const manual  = ["pe", "nl", "yt", "nb", "nt", "nu"].includes(province);
  const promise = manual ? "a free snapshot within a few business hours" : "a reply within 24 hours";

  const ownerBody = `
Registry search returned NO RESULTS — visitor wants a manual search
=====================================
Searched for:  ${query}
Jurisdiction:  ${provLabel}
Reply to:      ${email}
Promised:      ${promise}
Auto-reply:    ${sendAck ? "sent" : "not sent (auto-reply limit reached for this address or site-wide)"}
=====================================
The visitor believes this corporation exists but our search did not find it.
Run a manual search and reply to them directly.
=====================================
  `.trim();

  /* Fixed text only. Nothing the visitor typed goes in — not the corporation
     name they searched — so this can never carry attacker-written text into
     a third party's inbox. */
  const customerBody = `
Hi,

Thank you for contacting CRS — Corporate Registry Services.

We've received your request about a corporation our registry search
couldn't find. A specialist will run a manual search and get back to
you with ${manual ? "a free snapshot of the corporation within a few business hours" : "what we find within 24 hours"}.

If you'd rather talk it through sooner, call or text us at
(778) 949-2055 during business hours.

If you didn't contact us, you can ignore this email.

— The CRS Team
Corporate Registry Services
support@corporateregistryservices.ca
  `.trim();

  /* Persist first so there's a record even if SES fails. Fire-and-forget —
     the send is what matters to the visitor. */
  void (async () => {
    try {
      await ensureInboundMessageIndexes();
      const col = await inboundMessages();
      await col.insertOne({
        source:        "search-help",
        name:          "",              // this form only collects an email
        email:         emailKey,
        subject:       `No results: ${query}`.slice(0, 140),
        message:       `Registry search for "${query}" (${provLabel}) returned no results. Visitor believes the corporation exists and asked for a manual search.`,
        payload:       { query, province, path: text(body.path).slice(0, 200) },
        ipHash,
        userAgent:     (request.headers.get("user-agent") ?? "").slice(0, 200) || undefined,
        autoReplySent: sendAck,
        createdAt:     new Date(now),
      });
      /* Manual-registry snapshot requests also join the lead list (admin →
         Search leads), alongside the automated snapshot requests. */
      if (manual) {
        await ensureSearchLeadIndexes();
        const leads = await searchLeads();
        await leads.insertOne({
          email:       emailKey,
          query,
          province,
          resultCount: 0,
          path:        text(body.path).slice(0, 200),
          ipHash:      ipHash || undefined,
          userAgent:   (request.headers.get("user-agent") ?? "").slice(0, 200) || undefined,
          createdAt:   new Date(now),
          intent:      "snapshot",
          jurisdiction: provLabel,
        });
      }
    } catch (e) {
      console.error("[CRS] search-help Mongo save failed:", e instanceof Error ? e.message : e);
    }
  })();

  try {
    const ses = makeSes();
    await ses.send(new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: `[CRS Search Help] No results: ${query}`.slice(0, 180) },
        Body:    { Text: { Data: ownerBody } },
      },
    }));
    if (sendAck) {
      await ses.send(new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: "We're looking into your search — CRS" },
          Body:    { Text: { Data: customerBody } },
        },
      }));
    }
  } catch (err) {
    console.error("[CRS] search-help SES error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: "Could not send — please email us directly at support@corporateregistryservices.ca" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
