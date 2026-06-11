import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { getBucket, JURISDICTIONS } from "@/lib/service-config";
import type { WizardState } from "@/lib/wizard-types";

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

export async function POST(request: Request) {
  let body: WizardState;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { bucketKey, serviceKeys, jurisdictionKey, details, customer } = body;

  if (!bucketKey || !serviceKeys.length || !customer.fullName || !customer.email) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const bucket = getBucket(bucketKey);
  const jurisdiction = JURISDICTIONS.find((j) => j.key === jurisdictionKey);
  const selectedServices = bucket?.services.filter((s) => serviceKeys.includes(s.key)) ?? [];
  const ref = makeRef();

  const detailLines = Object.entries(details)
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");

  const ownerBody = `
New order request — Ref: ${ref}
====================================
Category:     ${bucket?.label ?? bucketKey}
Jurisdiction: ${jurisdiction?.label ?? jurisdictionKey ?? "N/A"}
Services:     ${selectedServices.map((s) => s.label).join(", ")}
${detailLines ? `\nDetails:\n${detailLines}` : ""}

--- Customer ---
Name:    ${customer.fullName}
Email:   ${customer.email}
Phone:   ${customer.phone}
Company: ${customer.company || "—"}
Contact: ${customer.preferredContact}
====================================
  `.trim();

  const serviceNames = selectedServices.map((s) => s.label).join(", ");
  const feeLines = selectedServices
    .map((s) => `  ${s.label.padEnd(38)} ${s.estimatedFee}`)
    .join("\n");

  const customerBody = `
Hi ${customer.fullName},

Thank you for reaching out to CRS — Corporate Registry Services.
We've received your request and our team is already on it.

Order Details
${"─".repeat(58)}
Reference:    ${ref}
Service(s):   ${serviceNames}
Jurisdiction: ${jurisdiction?.label ?? jurisdictionKey ?? "N/A"}

Estimated Fee${selectedServices.length > 1 ? "s" : ""}:
${feeLines}

All government fees are included. Final charges are confirmed
in your custom quote before any payment is collected.
${"─".repeat(58)}

What happens next:

Step 1 — Custom Quote (within 1 hour)
   We'll review your request and send a formal quote to
   this email address. No hidden charges — ever.

Step 2 — Approve & Pay Securely
   Reply to approve the quote. We'll send a secure payment
   link — no work begins until you confirm.

Step 3 — Government Registry Processing
   Your order is processed directly with the${jurisdiction?.label ? ` ${jurisdiction.label}` : ""} corporate
   registry — no third-party intermediaries.

Step 4 — Documents Delivered to Your Inbox
   Your documents arrive electronically, typically within
   1–3 business hours of payment confirmation.

${"─".repeat(58)}
Questions? Simply reply to this email — we're here to help.

— The CRS Team
Corporate Registry Services
support@corporateregistryservices.ca
  `.trim();

  const ownerEmail = process.env.NOTIFY_EMAIL ?? process.env.OWNER_EMAIL ?? "info@crs.ca";
  const fromEmail  = process.env.SES_FROM    ?? process.env.FROM_EMAIL  ?? "noreply@crs.ca";

  try {
    const ses = makeSes();

    await ses.send(
      new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [ownerEmail] },
        Message: {
          Subject: { Data: `[CRS] New order ${ref} — ${bucket?.label ?? bucketKey}` },
          Body: { Text: { Data: ownerBody } },
        },
      })
    );

    await ses.send(
      new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [customer.email] },
        Message: {
          Subject: { Data: `Your CRS request for ${serviceNames} has been received — ${ref}` },
          Body: { Text: { Data: customerBody } },
        },
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CRS] SES send failed:", msg);
    return NextResponse.json({ ref, emailError: msg }, { status: 200 });
  }

  return NextResponse.json({ ref }, { status: 200 });
}
