import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { inboundMessages, ensureInboundMessageIndexes } from "@/lib/inbound-messages-mongo";
import {
  DAY, HOUR, admit, ipHashFrom, isEmail, multiLine, oneLine, readJsonObject, savedCounts, text, tooManyRequests,
} from "@/lib/public-form-guard";

/* Public, unauthenticated form, so treat every field as hostile. Mail from
 *  support@ is DKIM-signed as corporateregistryservices.ca, and it must not
 *  become a way to put attacker-written text in someone else's inbox. The
 *  visitor gets a fixed acknowledgement that repeats nothing they typed, at
 *  most once a day per address. Only support@ sees the enquiry itself. */

const MAX_BODY    = 64_000;   // raw request chars, checked before JSON parsing
const MAX_NAME    = 100;
const MAX_PHONE   = 40;
const MAX_SUBJECT = 100;
const MAX_MESSAGE = 5_000;

const LIMITS = {
  perIpHour:       5,    // accepted enquiries from one IP hash
  perEmailHour:    3,    // accepted enquiries giving one reply address
  acksPerEmailDay: 1,    // acknowledgements sent to one address
  acksAllHour:     30,   // acknowledgements site-wide
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
  const read = await readJsonObject(request, MAX_BODY, { tooLong: "Message is too long.", invalid: "Invalid JSON" });
  if ("response" in read) return read.response;
  const { body } = read;

  const name        = oneLine(body.name);
  const email       = text(body.email).trim();
  const phone       = oneLine(body.phone);
  const subjectLine = oneLine(body.subject) || "General Enquiry";
  const message     = multiLine(body.message);

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Name, email and message are required." }, { status: 400 });
  }
  if (!isEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  const tooLong =
    name.length        > MAX_NAME    ? `Name must be ${MAX_NAME} characters or fewer.` :
    phone.length       > MAX_PHONE   ? `Phone must be ${MAX_PHONE} characters or fewer.` :
    subjectLine.length > MAX_SUBJECT ? `Subject must be ${MAX_SUBJECT} characters or fewer.` :
    message.length     > MAX_MESSAGE ? "Message must be 5,000 characters or fewer." :
    null;
  if (tooLong) return NextResponse.json({ error: tooLong }, { status: 400 });

  const emailKey = email.toLowerCase();
  const ipHash   = ipHashFrom(request);
  const now      = Date.now();

  const saved = await savedCounts("contact form", async () => {
    await ensureInboundMessageIndexes();
    const col = await inboundMessages();
    const hourAgo = new Date(now - HOUR);
    const dayAgo  = new Date(now - DAY);
    const [ip, byEmail, acksToEmail, acksAll] = await Promise.all([
      ipHash ? col.countDocuments({ source: "contact", ipHash, createdAt: { $gte: hourAgo } }) : 0,
      col.countDocuments({ source: "contact", email: emailKey, createdAt: { $gte: hourAgo } }),
      col.countDocuments({ source: "contact", email: emailKey, autoReplySent: true, createdAt: { $gte: dayAgo } }),
      col.countDocuments({ source: "contact", autoReplySent: true, createdAt: { $gte: hourAgo } }),
    ]);
    return { ip, email: byEmail, acksToEmail, acksAll };
  });

  const admitted = admit("contact", LIMITS, ipHash, emailKey, saved, now);
  if (!admitted) {
    return tooManyRequests("Too many messages. Please try again later, or email us directly at support@corporateregistryservices.ca");
  }
  const { sendAck } = admitted;

  const toEmail   = process.env.NOTIFY_EMAIL ?? process.env.OWNER_EMAIL ?? "support@corporateregistryservices.ca";
  const fromEmail = process.env.SES_FROM     ?? process.env.FROM_EMAIL  ?? "support@corporateregistryservices.ca";

  const ownerBody = `
New enquiry from CRS website
=====================================
Name:       ${name}
Email:      ${email}
Phone:      ${phone || "—"}
Subject:    ${subjectLine}
Auto-reply: ${sendAck ? "sent" : "not sent (auto-reply limit reached for this address or site-wide)"}
=====================================
${message}
=====================================
  `.trim();

  /* Fixed text only. Nothing the visitor typed goes in, not even their name. */
  const customerBody = `
Hi,

Thank you for contacting CRS — Corporate Registry Services.
We've received your enquiry and will reply within 1 hour on business days.

If you didn't contact us, you can ignore this email.

— The CRS Team
Corporate Registry Services
support@corporateregistryservices.ca
  `.trim();

  /* Persist to Mongo first so we always have a record even if SES fails
   *  or the reply-address bounces. Fire-and-forget — the SES send is what
   *  matters to the visitor. */
  void (async () => {
    try {
      await ensureInboundMessageIndexes();
      const col = await inboundMessages();
      await col.insertOne({
        source:        "contact",
        name,
        email:         emailKey,
        phone:         phone || undefined,
        subject:       subjectLine,
        message,
        ipHash,
        userAgent:     (request.headers.get("user-agent") ?? "").slice(0, 200) || undefined,
        autoReplySent: sendAck,
        createdAt:     new Date(now),
      });
    } catch (e) {
      console.error("[CRS] contact form Mongo save failed:", e instanceof Error ? e.message : e);
    }
  })();

  try {
    const ses = makeSes();
    await ses.send(new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: `[CRS Enquiry] ${subjectLine} — ${name}` },
        Body:    { Text: { Data: ownerBody } },
      },
    }));
    if (sendAck) {
      await ses.send(new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: "We've received your enquiry — CRS" },
          Body:    { Text: { Data: customerBody } },
        },
      }));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CRS] contact form SES error:", msg);
    return NextResponse.json({ error: "Could not send — please email us directly at support@corporateregistryservices.ca" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
