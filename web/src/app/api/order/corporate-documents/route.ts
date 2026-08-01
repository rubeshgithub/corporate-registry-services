import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import crypto from "node:crypto";
import { inboundMessages, ensureInboundMessageIndexes } from "@/lib/inbound-messages-mongo";

/**
 * POST /api/order/corporate-documents
 *
 * Quote-first flow (no upfront payment). Visitor picks which documents
 * they want for a specific corporation, we email them a quote within a
 * few hours, and once confirmed, deliver everything within 24 hours.
 *
 * Persists to inbound_messages so it shows up in the admin analytics
 * inbox alongside contact + wizard submits. Sends SES notifications to
 * both the owner and the visitor.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOC_LABELS: Record<string, string> = {
  "original":         "Original / copy of Incorporation Document",
  "articles":         "Articles of Incorporation",
  "proof-filings":    "Proof of filings (Annual Returns, changes to directors/shareholders/address, etc.)",
  "full-set":         "Full set of documents — everything on file, up to date",
};

type Hit = {
  name:             string;
  registryId:       string;
  businessNumber:   string;
  jurisdiction:     string;
  provinceKey:      string;
  location:         string;
};

type Body = {
  hit:          Hit;
  documents:    string[];   // keys from DOC_LABELS
  notes?:       string;
  contact:      { name: string; email: string; phone: string };
  src:          string;
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

function makeRef() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "CRS-";
  for (let i = 0; i < 6; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

function isValid(body: Body): string | null {
  if (!body?.hit?.name)                          return "Missing company selection.";
  if (!Array.isArray(body.documents) || body.documents.length === 0)
                                                 return "Select at least one document.";
  for (const key of body.documents) {
    if (!(key in DOC_LABELS))                    return `Unknown document: ${key}`;
  }
  if (!body?.contact?.name?.trim())              return "Missing contact name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body?.contact?.email ?? ""))
                                                 return "Invalid email.";
  if (!body?.contact?.phone?.trim())             return "Missing phone number.";
  return null;
}

export async function POST(request: Request) {
  let body: Body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const err = isValid(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const ref = makeRef();
  const docLabels = body.documents.map((k) => DOC_LABELS[k]);
  const docLines  = docLabels.map((l) => `  • ${l}`).join("\n");

  const ownerBody = `
New corporate-documents quote request — Ref: ${ref}
====================================
Company:       ${body.hit.name}
Jurisdiction:  ${body.hit.jurisdiction}
Registry ID:   ${body.hit.registryId || "—"}
BN:            ${body.hit.businessNumber || "—"}
Location:      ${body.hit.location || "—"}

Documents requested:
${docLines}
${body.notes ? `\nVisitor notes:\n${body.notes}\n` : ""}
--- Customer ---
Name:  ${body.contact.name}
Email: ${body.contact.email}
Phone: ${body.contact.phone}
Src:   ${body.src}
====================================
  `.trim();

  const customerBody = `
Hi ${body.contact.name},

Thank you for reaching out to CRS — Corporate Registry Services.

We've received your document request for ${body.hit.name}${body.hit.jurisdiction ? ` (${body.hit.jurisdiction})` : ""} and our team is already on it.

Request Details
${"─".repeat(58)}
Reference:   ${ref}
Company:     ${body.hit.name}
${body.hit.registryId ? `Registry ID: ${body.hit.registryId}` : ""}

Documents requested:
${docLines}
${"─".repeat(58)}

What happens next:

Step 1 — Custom Quote (within a few hours)
   We'll review what's available on file with the registry and
   email you a formal quote. No hidden charges — ever.

Step 2 — Approve & Pay Securely
   Reply to approve the quote. We'll send a secure payment link —
   no work begins until you confirm.

Step 3 — Registry Retrieval & Delivery
   All requested documents are pulled directly from the government
   registry and delivered to your email within 24 hours of payment.

${"─".repeat(58)}
Questions? Simply reply to this email — we're here to help.

— The CRS Team
Corporate Registry Services
support@corporateregistryservices.ca
  `.trim();

  const ownerEmail = process.env.NOTIFY_EMAIL ?? process.env.OWNER_EMAIL ?? "info@crs.ca";
  const fromEmail  = process.env.SES_FROM    ?? process.env.FROM_EMAIL  ?? "noreply@crs.ca";

  /* Persist for the admin analytics inbox. Fire-and-forget — SES delivery
     is what the visitor cares about; a Mongo hiccup shouldn't 4xx them. */
  void (async () => {
    try {
      await ensureInboundMessageIndexes();
      const col = await inboundMessages();
      const ipRaw = (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "").split(",")[0]?.trim() ?? "";
      const ipHash = ipRaw ? crypto.createHash("sha256").update(ipRaw).digest("hex").slice(0, 24) : undefined;
      await col.insertOne({
        source:    "wizard",
        name:      body.contact.name.trim(),
        email:     body.contact.email.trim().toLowerCase(),
        phone:     body.contact.phone?.trim() || undefined,
        subject:   `Corporate documents — ${body.hit.name}`,
        message:   `Ref ${ref} — ${body.hit.jurisdiction} — Docs: ${docLabels.join(", ")}${body.notes ? ` — Notes: ${body.notes}` : ""}`,
        payload: {
          ref,
          service:      "corporate-documents",
          hit:          body.hit,
          documents:    body.documents,
          documentLabels: docLabels,
          notes:        body.notes ?? "",
          src:          body.src,
        },
        ipHash,
        userAgent: (request.headers.get("user-agent") ?? "").slice(0, 200) || undefined,
        createdAt: new Date(),
      });
    } catch (e) {
      console.error("[CRS] corporate-documents Mongo save failed:", e instanceof Error ? e.message : e);
    }
  })();

  try {
    const ses = makeSes();

    await ses.send(new SendEmailCommand({
      Source:      fromEmail,
      Destination: { ToAddresses: [ownerEmail] },
      Message: {
        Subject: { Data: `[CRS] Docs quote ${ref} — ${body.hit.name}` },
        Body:    { Text: { Data: ownerBody } },
      },
    }));

    await ses.send(new SendEmailCommand({
      Source:      fromEmail,
      Destination: { ToAddresses: [body.contact.email] },
      Message: {
        Subject: { Data: `Your CRS corporate documents request — ${ref}` },
        Body:    { Text: { Data: customerBody } },
      },
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[CRS] corporate-documents SES send failed:", msg);
    return NextResponse.json({ ref, emailError: msg }, { status: 200 });
  }

  return NextResponse.json({ ref }, { status: 200 });
}
