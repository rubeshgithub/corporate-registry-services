import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import crypto from "node:crypto";
import { inboundMessages, ensureInboundMessageIndexes } from "@/lib/inbound-messages-mongo";

/* Public, unauthenticated form, so treat every field as hostile. Mail from
 *  support@ is DKIM-signed as corporateregistryservices.ca, and it must not
 *  become a way to put attacker-written text in someone else's inbox. The
 *  visitor gets a fixed acknowledgement that repeats nothing they typed, at
 *  most once a day per address. Only support@ sees the enquiry itself. */

const MAX_BODY    = 64_000;   // raw request chars, checked before JSON parsing
const MAX_NAME    = 100;
const MAX_EMAIL   = 254;
const MAX_PHONE   = 40;
const MAX_SUBJECT = 100;
const MAX_MESSAGE = 5_000;

const HOUR = 60 * 60 * 1000;
const DAY  = 24 * HOUR;
const LIMIT_PER_IP_HOUR    = 5;   // accepted enquiries from one IP hash
const LIMIT_PER_EMAIL_HOUR = 3;   // accepted enquiries giving one reply address
const ACKS_PER_EMAIL_DAY   = 1;   // acknowledgements sent to one address
const ACKS_ALL_HOUR        = 30;  // acknowledgements site-wide, a backstop for rotated IPs

/* WHATWG's input[type=email] pattern, plus a required dot in the domain. It
 *  allows no spaces, commas, angle brackets or quotes, so the value can only
 *  name one mailbox. */
const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/* C0/C1 controls (CR and LF included), line/paragraph separators, bidi overrides. */
const CONTROL_RE = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;
/* The same set minus tab and LF, for multi-line text. */
const BODY_CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;

function text(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** One line, safe for a header: controls become spaces, whitespace collapses. */
function oneLine(v: unknown): string {
  return text(v).replace(CONTROL_RE, " ").replace(/\s+/g, " ").trim();
}

/** Multi-line text: keeps newlines and tabs, drops every other control. */
function multiLine(v: unknown): string {
  return text(v).replace(/\r\n?/g, "\n").replace(BODY_CONTROL_RE, "").trim();
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)),
  ]);
}

/* In-process sliding windows. The check and the record happen in one
 *  synchronous step, so a burst of parallel requests cannot all get under the
 *  limit before any of them reaches Mongo. The Mongo counts below carry the
 *  limits across restarts and instances. Kept on globalThis to survive dev HMR. */
type Hits = Map<string, number[]>;
const g = globalThis as typeof globalThis & { _crsContactHits?: Hits };
const hits: Hits = (g._crsContactHits ??= new Map());

/* Each key is always read with the same window, so pruning to it is safe. */
function countHits(key: string, windowMs: number, now: number): number {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length) hits.set(key, recent);
  else hits.delete(key);
  return recent.length;
}

function addHit(key: string, now: number): void {
  const list = hits.get(key);
  if (list) list.push(now);
  else hits.set(key, [now]);
  if (hits.size > 10_000) {
    for (const [k, ts] of hits) if (now - ts[ts.length - 1] >= DAY) hits.delete(k);
  }
}

type SavedCounts = { ip: number; email: number; acksToEmail: number; acksAll: number };

/* The same limits, counted from saved enquiries. Best effort: if Mongo is
 *  slow or down, the in-process counts still apply and the enquiry still goes out. */
async function savedCounts(ipHash: string | undefined, email: string, now: number): Promise<SavedCounts | null> {
  try {
    return await withTimeout((async () => {
      await ensureInboundMessageIndexes();
      const col = await inboundMessages();
      const hourAgo = new Date(now - HOUR);
      const dayAgo  = new Date(now - DAY);
      const [ip, byEmail, acksToEmail, acksAll] = await Promise.all([
        ipHash ? col.countDocuments({ source: "contact", ipHash, createdAt: { $gte: hourAgo } }) : 0,
        col.countDocuments({ source: "contact", email, createdAt: { $gte: hourAgo } }),
        col.countDocuments({ source: "contact", email, autoReplySent: true, createdAt: { $gte: dayAgo } }),
        col.countDocuments({ source: "contact", autoReplySent: true, createdAt: { $gte: hourAgo } }),
      ]);
      return { ip, email: byEmail, acksToEmail, acksAll };
    })(), 3_000);
  } catch (e) {
    console.error("[CRS] contact form rate-limit lookup failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

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
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY) {
    return NextResponse.json({ error: "Message is too long." }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) {
      return NextResponse.json({ error: "Message is too long." }, { status: 413 });
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name        = oneLine(body.name);
  const email       = text(body.email).trim();
  const phone       = oneLine(body.phone);
  const subjectLine = oneLine(body.subject) || "General Enquiry";
  const message     = multiLine(body.message);

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Name, email and message are required." }, { status: 400 });
  }
  if (email.length > MAX_EMAIL || !EMAIL_RE.test(email)) {
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
  const ipRaw  = (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "").split(",")[0]?.trim() ?? "";
  const ipHash = ipRaw ? crypto.createHash("sha256").update(ipRaw).digest("hex").slice(0, 24) : undefined;
  const now    = Date.now();
  const saved  = await savedCounts(ipHash, emailKey, now);

  /* Synchronous from here to the addHit calls, per the note on `hits`. */
  const ipKey    = `ip:${ipHash ?? "none"}`;
  const emailHit = `email:${emailKey}`;
  const ackHit   = `ack:${emailKey}`;
  if (
    Math.max(countHits(ipKey, HOUR, now), saved?.ip ?? 0) >= LIMIT_PER_IP_HOUR ||
    Math.max(countHits(emailHit, HOUR, now), saved?.email ?? 0) >= LIMIT_PER_EMAIL_HOUR
  ) {
    return NextResponse.json(
      { error: "Too many messages. Please try again later, or email us directly at support@corporateregistryservices.ca" },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }
  /* Over the acknowledgement limits the enquiry still reaches support@; the
   *  visitor just gets no second auto-reply. The response doesn't say which. */
  const sendAck =
    Math.max(countHits(ackHit, DAY, now), saved?.acksToEmail ?? 0) < ACKS_PER_EMAIL_DAY &&
    Math.max(countHits("ack:*", HOUR, now), saved?.acksAll ?? 0) < ACKS_ALL_HOUR;
  addHit(ipKey, now);
  addHit(emailHit, now);
  if (sendAck) {
    addHit(ackHit, now);
    addHit("ack:*", now);
  }

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
