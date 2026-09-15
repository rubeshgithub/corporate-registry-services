import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { getBucket, JURISDICTIONS } from "@/lib/service-config";
import { DEFAULT_PRICES, getPrices, priceKeyForService, swapPrice } from "@/lib/pricing";
import { inboundMessages, ensureInboundMessageIndexes } from "@/lib/inbound-messages-mongo";
import {
  DAY, HOUR, admit, ipHashFrom, isEmail, multiLine, oneLine, readJsonObject, savedCounts, text, tooManyRequests, withTimeout,
} from "@/lib/public-form-guard";

/* Public, unauthenticated quote request. The acknowledgement goes from
 *  support@ to an address the visitor typed, so it carries only fixed text and
 *  server-derived values: the reference, the service and jurisdiction labels
 *  and the catalogue fees. Their name, company and details go to support@
 *  only. See lib/public-form-guard.ts. */

const MAX_BODY     = 64_000;   // raw request chars, checked before JSON parsing
const MAX_NAME     = 100;
const MAX_PHONE    = 40;
const MAX_COMPANY  = 200;
const MAX_DETAILS  = 30;       // detail fields
const MAX_DETAIL_KEY = 60;
const MAX_DETAIL   = 2_000;

const LIMITS = {
  perIpHour:       5,    // accepted requests from one IP hash
  perEmailHour:    3,    // accepted requests giving one address
  acksPerEmailDay: 2,    // acknowledgements sent to one address (each carries a new reference)
  acksAllHour:     30,   // acknowledgements site-wide
};

const PREFERRED_CONTACT = ["Email", "Phone", "Either"];

function makeSes() {
  return new SESClient({
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

function makeRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "CRS-";
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export async function POST(request: Request) {
  const read = await readJsonObject(request, MAX_BODY, { tooLong: "Request is too long.", invalid: "Invalid JSON" });
  if ("response" in read) return read.response;
  const { body } = read;

  const bucket = getBucket(text(body.bucketKey));
  const serviceKeys = Array.isArray(body.serviceKeys) ? body.serviceKeys.filter((k) => typeof k === "string") : [];
  const selectedServices = bucket?.services.filter((s) => serviceKeys.includes(s.key)) ?? [];
  if (!bucket || !selectedServices.length) {
    return NextResponse.json({ error: "Please choose a service and try again." }, { status: 400 });
  }

  const jurisdictionKey = oneLine(body.jurisdictionKey).slice(0, 40);
  const jurisdiction    = JURISDICTIONS.find((j) => j.key === jurisdictionKey);

  const customer         = asObject(body.customer);
  const fullName         = oneLine(customer.fullName);
  const email            = text(customer.email).trim();
  const phone            = oneLine(customer.phone);
  const company          = oneLine(customer.company);
  const preferredContact = PREFERRED_CONTACT.find((c) => c === customer.preferredContact) ?? "—";

  if (!fullName || !email) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }
  if (!isEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const fieldLabels = new Map(selectedServices.flatMap((s) => s.detailFields ?? []).map((f) => [f.key, f.label]));
  const details: Record<string, string> = {};
  let detailTooLong: string | null = null;
  for (const [k, v] of Object.entries(asObject(body.details))) {
    const key   = oneLine(k).slice(0, MAX_DETAIL_KEY);
    const value = multiLine(v);
    if (!key || !value) continue;
    if (value.length > MAX_DETAIL) detailTooLong ??= `${fieldLabels.get(key) ?? "Each detail"} must be 2,000 characters or fewer.`;
    details[key] = value;
  }

  const tooLong =
    fullName.length > MAX_NAME    ? `Name must be ${MAX_NAME} characters or fewer.` :
    phone.length    > MAX_PHONE   ? `Phone must be ${MAX_PHONE} characters or fewer.` :
    company.length  > MAX_COMPANY ? `Company name must be ${MAX_COMPANY} characters or fewer.` :
    Object.keys(details).length > MAX_DETAILS ? "Too many details." :
    detailTooLong;
  if (tooLong) return NextResponse.json({ error: tooLong }, { status: 400 });

  const emailKey = email.toLowerCase();
  const ipHash   = ipHashFrom(request);
  const now      = Date.now();

  const [saved, prices] = await Promise.all([
    savedCounts("wizard-submit", async () => {
      await ensureInboundMessageIndexes();
      const col = await inboundMessages();
      const hourAgo = new Date(now - HOUR);
      const dayAgo  = new Date(now - DAY);
      const [ip, byEmail, acksToEmail, acksAll] = await Promise.all([
        ipHash ? col.countDocuments({ source: "wizard", ipHash, createdAt: { $gte: hourAgo } }) : 0,
        col.countDocuments({ source: "wizard", email: emailKey, createdAt: { $gte: hourAgo } }),
        col.countDocuments({ source: "wizard", email: emailKey, autoReplySent: true, createdAt: { $gte: dayAgo } }),
        col.countDocuments({ source: "wizard", autoReplySent: true, createdAt: { $gte: hourAgo } }),
      ]);
      return { ip, email: byEmail, acksToEmail, acksAll };
    }),
    withTimeout(getPrices(), 3_000).catch(() => DEFAULT_PRICES),
  ]);

  const admitted = admit("wizard", LIMITS, ipHash, emailKey, saved, now);
  if (!admitted) {
    return tooManyRequests("Too many requests. Please try again later, or email us directly at support@corporateregistryservices.ca");
  }
  const { sendAck } = admitted;

  const ref = makeRef();
  const jurisdictionLabel = jurisdiction?.label ?? (jurisdictionKey || "N/A");
  const serviceNames = selectedServices.map((s) => s.label).join(", ");

  const detailLines = Object.entries(details)
    .map(([k, v]) => `  ${k}: ${v.replace(/\n/g, "\n    ")}`)
    .join("\n");

  const ownerBody = `
New order request — Ref: ${ref}
====================================
Category:     ${bucket.label}
Jurisdiction: ${jurisdictionLabel}
Services:     ${serviceNames}
${detailLines ? `\nDetails:\n${detailLines}` : ""}

--- Customer ---
Name:    ${fullName}
Email:   ${email}
Phone:   ${phone || "—"}
Company: ${company || "—"}
Contact: ${preferredContact}
Auto-reply: ${sendAck ? "sent" : "not sent (auto-reply limit reached for this address or site-wide)"}
====================================
  `.trim();

  /* Catalogue fee, so the email quotes what the site and checkout show. */
  const feeFor = (s: (typeof selectedServices)[number]) => {
    const cents = prices[priceKeyForService(s.key)] ?? s.priceCents;
    return cents != null ? swapPrice(s.estimatedFee, cents) : s.estimatedFee;
  };
  const feeLines = selectedServices
    .map((s) => `  ${s.label.padEnd(38)} ${feeFor(s)}`)
    .join("\n");

  /* Fixed text plus server-derived values only. Nothing the visitor typed goes
     in, not even their name. */
  const customerBody = `
Hi,

Thank you for reaching out to CRS — Corporate Registry Services.
We've received your request and our team is already on it.

Order Details
${"─".repeat(58)}
Reference:    ${ref}
Service(s):   ${serviceNames}
Jurisdiction: ${jurisdiction?.label ?? "N/A"}

Estimated Fee${selectedServices.length > 1 ? "s" : ""}:
${feeLines}

All government fees are included. Final charges are confirmed
in your custom quote before any payment is collected.
${"─".repeat(58)}

What happens next:

Step 1 — Custom Quote (within 1 business hour)
   We'll review your request and send a formal quote to
   this email address. No hidden charges — ever.

Step 2 — Approve & Pay Securely
   Reply to approve the quote. We'll send a secure payment
   link — no work begins until you confirm.

Step 3 — Government Registry Processing
   Your order is processed directly with the${jurisdiction ? ` ${jurisdiction.label}` : ""} corporate
   registry — no third-party intermediaries.

Step 4 — Documents Delivered to Your Inbox
   Your documents arrive electronically, typically within
   1–3 business hours of payment confirmation.

${"─".repeat(58)}
Questions? Simply reply to this email — we're here to help.
If you didn't make this request, you can ignore this email.

— The CRS Team
Corporate Registry Services
support@corporateregistryservices.ca
  `.trim();

  const ownerEmail = process.env.NOTIFY_EMAIL ?? process.env.OWNER_EMAIL ?? "info@crs.ca";
  const fromEmail  = process.env.SES_FROM    ?? process.env.FROM_EMAIL  ?? "noreply@crs.ca";

  /* Persist the wizard submit to Mongo so the operator has a queryable
     audit trail beyond the SES inbox, and so the rate limits above survive
     restarts. Fire-and-forget — SES delivery is what the visitor cares about;
     a Mongo failure shouldn't 4xx them. */
  void (async () => {
    try {
      await ensureInboundMessageIndexes();
      const col = await inboundMessages();
      await col.insertOne({
        source:    "wizard",
        name:      fullName,
        email:     emailKey,
        phone:     phone || undefined,
        subject:   `${bucket.label} — ${serviceNames}`,
        message:   `Ref ${ref} — ${jurisdictionLabel} — Company: ${company || "—"} — Prefers: ${preferredContact}`,
        payload: {
          ref,
          bucketKey:       bucket.key,
          serviceKeys:     selectedServices.map((s) => s.key),
          serviceLabels:   selectedServices.map((s) => s.label),
          jurisdictionKey: jurisdictionKey || undefined,
          details,
        },
        ipHash,
        userAgent: (request.headers.get("user-agent") ?? "").slice(0, 200) || undefined,
        autoReplySent: sendAck,
        createdAt: new Date(now),
      });
    } catch (e) {
      console.error("[CRS] wizard-submit Mongo save failed:", e instanceof Error ? e.message : e);
    }
  })();

  try {
    const ses = makeSes();

    await ses.send(
      new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [ownerEmail] },
        Message: {
          Subject: { Data: `[CRS] New order ${ref} — ${bucket.label}` },
          Body: { Text: { Data: ownerBody } },
        },
      })
    );

    if (sendAck) {
      await ses.send(
        new SendEmailCommand({
          Source: fromEmail,
          Destination: { ToAddresses: [email] },
          Message: {
            Subject: { Data: `Your CRS request for ${serviceNames} has been received — ${ref}` },
            Body: { Text: { Data: customerBody } },
          },
        })
      );
    }
  } catch (err) {
    /* The request is saved, so the visitor still gets their reference. The SES
       error stays in the server log rather than the response. */
    console.error("[CRS] SES send failed:", err instanceof Error ? err.message : String(err));
  }

  return NextResponse.json({ ref }, { status: 200 });
}
