import { NextResponse } from "next/server";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

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
  let body: { name: string; email: string; phone?: string; subject?: string; message: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { name, email, phone, subject, message } = body;
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return NextResponse.json({ error: "Name, email and message are required." }, { status: 400 });
  }

  const toEmail   = process.env.NOTIFY_EMAIL ?? process.env.OWNER_EMAIL ?? "support@corporateregistryservices.ca";
  const fromEmail = process.env.SES_FROM     ?? process.env.FROM_EMAIL  ?? "support@corporateregistryservices.ca";
  const subjectLine = subject?.trim() || "General Enquiry";

  const ownerBody = `
New enquiry from CRS website
=====================================
Name:    ${name}
Email:   ${email}
Phone:   ${phone || "—"}
Subject: ${subjectLine}
=====================================
${message}
=====================================
  `.trim();

  const customerBody = `
Hi ${name},

Thank you for contacting CRS — Corporate Registry Services.
We've received your message and will respond within 1 hour on business days.

Your enquiry:
${message}

— The CRS Team
Corporate Registry Services
support@corporateregistryservices.ca
  `.trim();

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
    await ses.send(new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: "We've received your enquiry — CRS" },
        Body:    { Text: { Data: customerBody } },
      },
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[CRS] contact form SES error:", msg);
    return NextResponse.json({ error: "Could not send — please email us directly at support@corporateregistryservices.ca" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
