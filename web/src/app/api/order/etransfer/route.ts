import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { orderDrafts, ensureOrderDraftIndexes } from "@/lib/order-drafts-mongo";
import { sendAlertSms } from "@/lib/sms-infobip";
import { findService } from "@/lib/service-config";
import {
  DAY, HOUR, admit, ipHashFrom, isEmail, oneLine, readJsonObject, savedCounts, text, tooManyRequests,
} from "@/lib/public-form-guard";

/**
 * POST /api/order/etransfer
 *
 * "I'd rather pay by Interac e-Transfer" — the visitor leaves an email and we
 * send the transfer details by hand.
 *
 * Deliberately does NOT return the e-Transfer address. Publishing it on a
 * public page invites misdirected and fraudulent transfers with no way to
 * match them to an order; sending it manually means the operator knows who
 * they are dealing with and can quote the exact amount and reference.
 *
 * The request is written onto the same order_drafts row the abandonment
 * beacon uses, so it shows up on the dashboard's cart-abandonment card with
 * the company already attached. It also sets notifiedAt so the abandonment
 * sweep does not send a second "they left without paying" alert — this
 * person did not leave, they asked for another way to pay.
 *
 * Public and unauthenticated, and the acknowledgement goes from support@ to
 * the address typed, so it is fixed text plus the service label looked up
 * from service-config. The visitor's name, company and the client-sent label
 * and price go to support@ only. See lib/public-form-guard.ts.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 16_000;   // raw request chars, checked before JSON parsing
const MAX_NAME = 100;

const LIMITS = {
  perIpHour:       5,    // accepted requests from one IP hash
  perEmailHour:    3,    // accepted requests giving one address
  acksPerEmailDay: 1,    // acknowledgements sent to one address
  acksAllHour:     30,   // acknowledgements site-wide
};

/** One line, cut to max. For values the visitor can't see or fix. */
const clip = (v: unknown, max = 200): string => oneLine(v).slice(0, max);

function makeSes() {
  return new SESClient({
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

function asObject(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export async function POST(req: Request) {
  const read = await readJsonObject(req, MAX_BODY, { tooLong: "Request is too long.", invalid: "Invalid request body." });
  if ("response" in read) return read.response;
  const { body } = read;

  const contact = asObject(body.contact);
  const email   = text(contact.email).trim().toLowerCase();
  if (!isEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const name = oneLine(contact.name);
  if (name.length > MAX_NAME) {
    return NextResponse.json({ error: `Name must be ${MAX_NAME} characters or fewer.` }, { status: 400 });
  }

  const service      = clip(body.service, 40) || "unknown";
  const serviceLabel = clip(body.serviceLabel, 80) || service;
  const priceLabel   = clip(body.priceLabel, 40);
  const phone        = clip(contact.phone, 40);
  const sessionId    = clip(body.sessionId, 64);
  const path         = clip(body.path, 120);
  const src          = clip(body.src, 100);
  const companyIn    = asObject(body.company);
  const company = {
    name:           clip(companyIn.name),
    registryId:     clip(companyIn.registryId, 60),
    businessNumber: clip(companyIn.businessNumber, 60),
    jurisdiction:   clip(companyIn.jurisdiction, 80),
    provinceKey:    clip(companyIn.provinceKey, 8),
  };
  /* The only service wording the visitor's acknowledgement may carry. */
  const knownServiceLabel = findService(service)?.label;

  const ipHash = ipHashFrom(req);
  const nowMs  = Date.now();
  const now    = new Date(nowMs);

  /* Counted from the order_drafts rows this route writes. Rows are keyed on
     sessionId + service, so repeats from one session collapse into one row and
     session-less requests aren't saved; the in-process counts cover those. */
  const saved = await savedCounts("order/etransfer", async () => {
    await ensureOrderDraftIndexes();
    const col = await orderDrafts();
    const hourAgo = new Date(nowMs - HOUR);
    const dayAgo  = new Date(nowMs - DAY);
    const [ip, byEmail, acksToEmail, acksAll] = await Promise.all([
      ipHash ? col.countDocuments({ ipHash, etransferRequestedAt: { $gte: hourAgo } }) : 0,
      col.countDocuments({ "contact.email": email, etransferRequestedAt: { $gte: hourAgo } }),
      col.countDocuments({ "contact.email": email, etransferAckSentAt: { $gte: dayAgo } }),
      col.countDocuments({ etransferRequestedAt: { $gte: hourAgo }, etransferAckSentAt: { $gte: hourAgo } }),
    ]);
    return { ip, email: byEmail, acksToEmail, acksAll };
  });

  const admitted = admit("etransfer", LIMITS, ipHash, email, saved, nowMs);
  if (!admitted) {
    return tooManyRequests("Too many requests. Please try again later, or email us at support@corporateregistryservices.ca");
  }
  const { sendAck } = admitted;

  /* Record it against the draft so the operator sees it in the same place as
     every other warm lead. A session-less request still gets emailed — we
     just can't merge it with the visitor's other activity. */
  if (sessionId.length >= 8) {
    try {
      await ensureOrderDraftIndexes();
      const col = await orderDrafts();
      const setFields: Record<string, unknown> = {
        sessionId, service, path,
        "contact.email":        email,
        etransferRequestedAt:   now,
        /* Suppress the abandonment alert — this is not an abandonment. */
        notifiedAt:             now,
        updatedAt:              now,
        userAgent: (req.headers.get("user-agent") ?? "").slice(0, 200) || undefined,
        ipHash,
      };
      if (sendAck) setFields.etransferAckSentAt = now;
      if (name)  setFields["contact.name"]  = name;
      if (phone) setFields["contact.phone"] = phone;
      const setIf = (k: string, v: string) => { if (v) setFields[k] = v; };
      setIf("company.name",           company.name);
      setIf("company.registryId",     company.registryId);
      setIf("company.businessNumber", company.businessNumber);
      setIf("company.jurisdiction",   company.jurisdiction);
      setIf("company.provinceKey",    company.provinceKey);

      await col.updateOne(
        { sessionId, service },
        { $set: setFields, $setOnInsert: { createdAt: now } },
        { upsert: true },
      );
    } catch (e) {
      /* Storage failure must not cost us the lead — the email below is what
         actually matters. */
      console.error("[order/etransfer] draft write failed:", e instanceof Error ? e.message : e);
    }
  }

  const ownerEmail = process.env.NOTIFY_EMAIL ?? process.env.OWNER_EMAIL ?? "info@crs.ca";
  const fromEmail  = process.env.SES_FROM     ?? process.env.FROM_EMAIL  ?? "noreply@crs.ca";

  const ownerText = `
E-TRANSFER REQUESTED — ${serviceLabel}
=====================================================
They asked for Interac e-Transfer instructions instead of paying by card.
ACTION: reply with the transfer address, the exact amount, and a reference.

Service:       ${serviceLabel}${priceLabel ? ` (${priceLabel})` : ""}
Page:          ${path || "—"}
Attribution:   ${src || "—"}

--- Company ---
Name:          ${company.name || "— (not selected)"}
Registry ID:   ${company.registryId || "—"}
BN:            ${company.businessNumber || "—"}
Jurisdiction:  ${company.jurisdiction || company.provinceKey || "—"}

--- Contact ---
Name:          ${name || "—"}
Email:         ${email}
Phone:         ${phone || "—"}
Auto-reply:    ${sendAck ? "sent" : "not sent (auto-reply limit reached for this address or site-wide)"}

Requested:     ${now.toISOString()}
Session:       ${sessionId || "—"}
=====================================================
`.trim();

  /* Fixed text plus the catalogue's service label. Nothing the visitor typed
     goes in, not even their name. */
  const customerText = `
Hi,

Thanks — we've got your request to pay by Interac e-Transfer${knownServiceLabel ? ` for ${knownServiceLabel}` : ""}.

One of our team will email you the transfer details shortly, including the
exact amount and a reference number to include with the transfer. We send
these by hand rather than publishing them, so please wait for our reply
rather than sending a transfer to any address you find elsewhere.

Once the transfer lands we start work the same way as a card payment.

Questions? Just reply to this email.
If you didn't make this request, you can ignore this email.

— The CRS Team
Corporate Registry Services
support@corporateregistryservices.ca
`.trim();

  try {
    const ses = makeSes();
    await ses.send(new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [ownerEmail] },
      Message: {
        Subject: { Data: `[CRS] e-Transfer requested — ${serviceLabel} — ${company.name || email}` },
        Body:    { Text: { Data: ownerText } },
      },
    }));
    if (sendAck) {
      await ses.send(new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: `We'll send your e-Transfer details shortly — CRS` },
          Body:    { Text: { Data: customerText } },
        },
      }));
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Email send failed.";
    console.error("[order/etransfer] SES send failed:", msg);
    /* The lead is stored and the operator can find it on the dashboard, so
       report success to the visitor rather than pushing them into a retry
       loop that would duplicate the request. */
  }

  /* Someone actively trying to pay is worth the same ping as a paid order. */
  void sendAlertSms(
    `CRS e-TRANSFER req: ${serviceLabel} - ${company.name || "no company"} - ${email}`
  );

  return NextResponse.json({ ok: true });
}
