import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { orderDrafts, ensureOrderDraftIndexes } from "@/lib/order-drafts-mongo";
import { sendAlertSms } from "@/lib/sms-infobip";

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
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_STR = 200;
const trunc = (v: unknown, max = MAX_STR): string => {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return s.length > max ? s.slice(0, max) : s;
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

function ipHashFromRequest(req: Request): string {
  const raw = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "").split(",")[0]?.trim() ?? "";
  return raw ? crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24) : "";
}

type Body = {
  sessionId?: string;
  service?:   string;
  serviceLabel?: string;
  path?:      string;
  priceLabel?: string;
  contact?:   { name?: string; email?: string; phone?: string };
  company?:   {
    name?: string; registryId?: string; businessNumber?: string;
    jurisdiction?: string; provinceKey?: string;
  };
  src?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = trunc(body.contact?.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const service      = trunc(body.service, 40) || "unknown";
  const serviceLabel = trunc(body.serviceLabel, 80) || service;
  const priceLabel   = trunc(body.priceLabel, 40);
  const name         = trunc(body.contact?.name);
  const phone        = trunc(body.contact?.phone, 40);
  const sessionId    = trunc(body.sessionId, 64);
  const path         = trunc(body.path, 120);
  const company      = body.company ?? {};
  const now          = new Date();

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
        ipHash:    ipHashFromRequest(req) || undefined,
      };
      if (name)  setFields["contact.name"]  = name;
      if (phone) setFields["contact.phone"] = phone;
      const setIf = (k: string, v: string) => { if (v) setFields[k] = v; };
      setIf("company.name",           trunc(company.name));
      setIf("company.registryId",     trunc(company.registryId, 60));
      setIf("company.businessNumber", trunc(company.businessNumber, 60));
      setIf("company.jurisdiction",   trunc(company.jurisdiction, 80));
      setIf("company.provinceKey",    trunc(company.provinceKey, 8));

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
Attribution:   ${trunc(body.src, 100) || "—"}

--- Company ---
Name:          ${trunc(company.name) || "— (not selected)"}
Registry ID:   ${trunc(company.registryId, 60) || "—"}
BN:            ${trunc(company.businessNumber, 60) || "—"}
Jurisdiction:  ${trunc(company.jurisdiction, 80) || trunc(company.provinceKey, 8) || "—"}

--- Contact ---
Name:          ${name || "—"}
Email:         ${email}
Phone:         ${phone || "—"}

Requested:     ${now.toISOString()}
Session:       ${sessionId || "—"}
=====================================================
`.trim();

  const customerText = `
Hi${name ? ` ${name}` : ""},

Thanks — we've got your request to pay by Interac e-Transfer${company.name ? ` for ${company.name}` : ""}.

One of our team will email you the transfer details shortly, including the
exact amount and a reference number to include with the transfer. We send
these by hand rather than publishing them, so please wait for our reply
rather than sending a transfer to any address you find elsewhere.

${serviceLabel}${priceLabel ? ` — ${priceLabel}` : ""}

Once the transfer lands we start work the same way as a card payment.

Questions? Just reply to this email.

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
        Subject: { Data: `[CRS] e-Transfer requested — ${serviceLabel} — ${trunc(company.name) || email}` },
        Body:    { Text: { Data: ownerText } },
      },
    }));
    await ses.send(new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: `We'll send your e-Transfer details shortly — CRS` },
        Body:    { Text: { Data: customerText } },
      },
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Email send failed.";
    console.error("[order/etransfer] SES send failed:", msg);
    /* The lead is stored and the operator can find it on the dashboard, so
       report success to the visitor rather than pushing them into a retry
       loop that would duplicate the request. */
  }

  /* Someone actively trying to pay is worth the same ping as a paid order. */
  void sendAlertSms(
    `CRS e-TRANSFER req: ${serviceLabel} - ${trunc(company.name) || "no company"} - ${email}`
  );

  return NextResponse.json({ ok: true });
}
