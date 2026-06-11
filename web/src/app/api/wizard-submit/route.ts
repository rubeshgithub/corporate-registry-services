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

  const customerBody = `
Hi ${customer.fullName},

Thank you for your request. We've received your order (Ref: ${ref}) and will send you a custom quote within 1 hour.

What you ordered:
  Category:     ${bucket?.label ?? bucketKey}
  Jurisdiction: ${jurisdiction?.label ?? jurisdictionKey ?? "N/A"}
  Services:     ${selectedServices.map((s) => s.label).join(", ")}

We'll reach you via ${customer.preferredContact.toLowerCase()} at the details you provided.

— The CRS Team
info@crs.ca
  `.trim();

  const ownerEmail = process.env.OWNER_EMAIL ?? "info@crs.ca";
  const fromEmail = process.env.FROM_EMAIL ?? "noreply@crs.ca";

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
          Subject: { Data: `Your CRS request has been received — ${ref}` },
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
