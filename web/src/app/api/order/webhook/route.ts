import { NextResponse } from "next/server";
import Stripe from "stripe";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

/**
 * POST /api/order/webhook
 *
 * Stripe webhook receiver. Configure this URL in the Stripe Dashboard
 * (Developers → Webhooks → Add endpoint), subscribing to at minimum:
 *   - checkout.session.completed
 *   - checkout.session.async_payment_succeeded
 *
 * The signing secret goes in STRIPE_WEBHOOK_SECRET. We verify the
 * signature against the raw request body — never JSON-parse first,
 * or verification breaks.
 */

// Force the runtime to hand us the raw body — signature verification depends on it.
export const runtime = "nodejs";

function makeSes() {
  return new SESClient({
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

function fmtAmount(session: Stripe.Checkout.Session) {
  if (!session.amount_total) return "";
  return `$${(session.amount_total / 100).toFixed(2)} ${session.currency?.toUpperCase() ?? "CAD"}`;
}

/**
 * Reassemble a JSON payload chunked across metadata keys of the form
 * "{prefix}_1", "{prefix}_2", … Returns null if no chunks or JSON is invalid.
 */
function readChunkedJson<T>(meta: Record<string, string>, prefix: string): T | null {
  const parts: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const v = meta[`${prefix}_${i}`];
    if (v === undefined) break;
    parts.push(v);
  }
  if (!parts.length) return null;
  try {
    return JSON.parse(parts.join("")) as T;
  } catch {
    return null;
  }
}

type StoredChanges = {
  directors:    Array<{ type: string; name: string; effectiveDate: string; newAddress: string }>;
  shareholders: Array<{ type: string; name: string; effectiveDate: string; newAddress: string; oldPercent: string; newPercent: string }>;
  registeredAddress: { changed: boolean; newAddress: string; effectiveDate: string };
  recordsAddress:    { changed: boolean; newAddress: string; effectiveDate: string };
  authorizedAgent:   { changed: boolean; newAgent: string;   effectiveDate: string };
  other:             string;
};

/** Human-readable, plain-text formatting of the change list — used in the fulfillment email. */
function formatChanges(c: StoredChanges | null): string {
  if (!c) return "(no structured changes payload)";
  const lines: string[] = [];

  if (c.directors.length) {
    lines.push(`Director changes (${c.directors.length}):`);
    for (const d of c.directors) {
      const detail = d.type === "address" ? ` → ${d.newAddress}` : "";
      lines.push(`  • ${d.type}: ${d.name} (effective ${d.effectiveDate})${detail}`);
    }
  }

  if (c.shareholders.length) {
    lines.push(`Shareholder changes (${c.shareholders.length}):`);
    for (const s of c.shareholders) {
      let detail = "";
      if (s.type === "address") detail = ` → ${s.newAddress}`;
      if (s.type === "voting")  detail = ` → voting ${s.oldPercent}% → ${s.newPercent}%`;
      lines.push(`  • ${s.type}: ${s.name} (effective ${s.effectiveDate})${detail}`);
    }
  }

  if (c.registeredAddress?.changed) {
    lines.push(`Registered address changed (effective ${c.registeredAddress.effectiveDate}):`);
    lines.push(`  ${c.registeredAddress.newAddress}`);
  }
  if (c.recordsAddress?.changed) {
    lines.push(`Records address changed (effective ${c.recordsAddress.effectiveDate}):`);
    lines.push(`  ${c.recordsAddress.newAddress}`);
  }
  if (c.authorizedAgent?.changed) {
    lines.push(`Authorized agent changed (effective ${c.authorizedAgent.effectiveDate}):`);
    lines.push(`  ${c.authorizedAgent.newAgent}`);
  }
  if (c.other?.trim()) {
    lines.push("Other:");
    lines.push(`  ${c.other.trim()}`);
  }

  return lines.length ? lines.join("\n") : "(none reported — file with existing registry data)";
}

function ownerBody(s: Stripe.Checkout.Session): string {
  const m = s.metadata ?? {};
  const changes = readChunkedJson<StoredChanges>(m, "changes_json");
  return `
NEW PAID ANNUAL RETURN ORDER — Stripe session ${s.id}
=====================================================
Amount:        ${fmtAmount(s)}
Payment:       ${s.payment_status}
Years to file: ${m.years_filed ?? "1"}
Attribution:   ${m.src ?? "—"}

--- Company (from live registry lookup) ---
Name:          ${m.company_name ?? "—"}
Jurisdiction:  ${m.jurisdiction ?? "—"} (${m.province_key ?? "—"})
Registry ID:   ${m.registry_id ?? "—"}
BN:            ${m.business_number ?? "—"}
Entity type:   ${m.entity_type ?? "—"}
Status:        ${m.registry_status ?? "—"}
Incorporated:  ${m.incorp_date ?? "—"}
Location:      ${m.location ?? "—"}

--- Changes since last filing ---
Summary:       ${m.changes_summary ?? "—"}

${formatChanges(changes)}

--- Customer ---
Name:          ${m.contact_name ?? "—"}
Email:         ${s.customer_details?.email ?? "—"}
Phone:         ${m.contact_phone ?? "—"}
=====================================================

Action: file this annual return with the ${m.jurisdiction ?? "target"} registry within 24 hours.
Stripe: https://dashboard.stripe.com/payments/${s.payment_intent}
`.trim();
}

function customerBody(s: Stripe.Checkout.Session): string {
  const m = s.metadata ?? {};
  return `
Hi ${m.contact_name ?? "there"},

We've received your payment for the ${m.jurisdiction ?? "Canadian"} Annual Return
filing for ${m.company_name ?? "your corporation"}.

What happens next:
  • Our team files your annual return with the ${m.jurisdiction ?? "corporate"} registry
    within 24 hours.
  • You'll get a filing confirmation email with the registry receipt attached.
  • We'll email you 30 days before next year's anniversary date, so you never
    miss another filing.

Order summary:
  Reference:    ${s.id}
  Amount paid:  ${fmtAmount(s)}
  Company:      ${m.company_name ?? "—"}
  Registry ID:  ${m.registry_id ?? "—"}
  Jurisdiction: ${m.jurisdiction ?? "—"}

Questions? Reply to this email — we'll respond within one business hour.

— The CRS Team
Corporate Registry Services
support@corporateregistryservices.ca
`.trim();
}

function incorporationOwnerBody(s: Stripe.Checkout.Session): string {
  const m = s.metadata ?? {};
  return `
NEW PAID INCORPORATION — Stripe session ${s.id}
=====================================================
Amount:        ${fmtAmount(s)}
Payment:       ${s.payment_status}
Type:          ${m.incorporation_type ?? "—"}
Jurisdiction:  ${m.jurisdiction ?? "—"}
Attribution:   ${m.src ?? "—"}

--- Company ---
${m.incorporation_type === "named" ? `Name options:  ${m.name_options ?? "—"}` : ""}
${m.incorporation_type === "extra-provincial" ? `Existing name: ${m.existing_corp_name ?? "—"}\nHome juris.:   ${m.home_jurisdiction ?? "—"}` : ""}
Nature:        ${m.nature_of_business ?? "—"}
Fiscal YE:     ${m.fiscal_year_end || "—"}
Restrictions:  ${m.restrictions || "—"}

--- Addresses ---
Registered:    ${m.registered_address ?? "—"}
Records:       ${m.records_address ?? "—"}

--- People ---
Directors (${m.directors_count ?? "0"}):
  ${m.directors_summary ?? "—"}
Shareholders (${m.shareholders_count ?? "0"}):
  ${m.shareholders_summary ?? "—"}
Incorporator:  ${m.incorp_name ?? "—"} (${m.incorp_relationship ?? "—"})
Phone:         ${m.incorp_phone ?? "—"}
Email:         ${s.customer_details?.email ?? "—"}
=====================================================

Action: file with the ${m.jurisdiction ?? "target"} registry within 24 hours.
Stripe: https://dashboard.stripe.com/payments/${s.payment_intent}
`.trim();
}

function incorporationCustomerBody(s: Stripe.Checkout.Session): string {
  const m = s.metadata ?? {};
  return `
Hi ${m.incorp_name ?? "there"},

We've received your payment for the ${m.jurisdiction ?? "Canadian"} incorporation.

What happens next:
  • Our team files with the ${m.jurisdiction ?? "corporate"} registry within 24 hours.
  • You'll receive your Certificate of Incorporation, Articles, and filing receipt by email.
  • We'll email you 30 days before your first anniversary — annual returns start next year.

Order summary:
  Reference:    ${s.id}
  Amount paid:  ${fmtAmount(s)}
  Type:         ${m.incorporation_type ?? "—"}
  Jurisdiction: ${m.jurisdiction ?? "—"}

Questions? Reply to this email — we'll respond within one business hour.

— The CRS Team
Corporate Registry Services
support@corporateregistryservices.ca
`.trim();
}

async function fulfill(session: Stripe.Checkout.Session) {
  const service = session.metadata?.service;

  const ownerEmail    = process.env.NOTIFY_EMAIL ?? process.env.OWNER_EMAIL ?? "info@crs.ca";
  const fromEmail     = process.env.SES_FROM     ?? process.env.FROM_EMAIL  ?? "noreply@crs.ca";
  const customerEmail = session.customer_details?.email;
  const ses = makeSes();

  if (service === "annual-return" || service === "annual-return-multiple") {
    await ses.send(new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [ownerEmail] },
      Message: {
        Subject: { Data: `[CRS] Paid — Annual Return ${session.metadata?.jurisdiction ?? ""} — ${session.metadata?.company_name ?? "—"}` },
        Body:    { Text: { Data: ownerBody(session) } },
      },
    }));
    if (customerEmail) {
      await ses.send(new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [customerEmail] },
        Message: {
          Subject: { Data: `Payment received — we're filing your annual return` },
          Body:    { Text: { Data: customerBody(session) } },
        },
      }));
    }
    return;
  }

  if (service === "incorporation") {
    await ses.send(new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [ownerEmail] },
      Message: {
        Subject: { Data: `[CRS] Paid — Incorporation ${session.metadata?.jurisdiction ?? ""} — ${session.metadata?.incorp_name ?? "—"}` },
        Body:    { Text: { Data: incorporationOwnerBody(session) } },
      },
    }));
    if (customerEmail) {
      await ses.send(new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [customerEmail] },
        Message: {
          Subject: { Data: `Payment received — we're filing your incorporation` },
          Body:    { Text: { Data: incorporationCustomerBody(session) } },
        },
      }));
    }
    return;
  }

  // Other services not wired yet — silently ignore.
}

export async function POST(req: Request) {
  const secret        = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const stripe = new Stripe(secret);
  const sig    = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature." }, { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Signature verification failed.";
    console.error("[order/webhook] Signature verification failed:", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Guard: only fulfill if the session actually reached "paid" (covers async
        // payment methods like bank debits that go pending → paid).
        if (session.payment_status === "paid") {
          await fulfill(session);
        }
        break;
      }
      default:
        // Ignore other event types silently.
        break;
    }
  } catch (e: unknown) {
    // Log and return 500 so Stripe retries — better than silently dropping.
    const msg = e instanceof Error ? e.message : "Fulfillment failed.";
    console.error("[order/webhook] Fulfillment error:", msg, { eventId: event.id, type: event.type });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
