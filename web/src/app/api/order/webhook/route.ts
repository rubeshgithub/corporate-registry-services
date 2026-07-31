import { NextResponse } from "next/server";
import Stripe from "stripe";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import crypto from "node:crypto";
import { markTokenConverted } from "@/lib/outreach-mongo";
import { sendAlertSms } from "@/lib/sms-infobip";

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

/* ─────────────── MinuteBook data feed (fire-and-forget) ───────────────
   Every paid CRS order that materially changes corporate state gets pushed
   to minutebook.corporateregistryservices.ca so customers accumulate
   filing history worth upselling into a completed minute book. Reports
   and name searches are skipped (no state change); incorporation is
   skipped until Phase 3 (no registry ID at payment time). Failures here
   are swallowed so an MB outage never causes Stripe webhook retries. */

type MbEvent = { type: string; effectiveDate: string; data?: Record<string, unknown> };
type MbFeedPayload = {
  orderId:        string;
  service:        string;
  occurredAt:     string;
  customerEmail:  string;
  customerName?:  string;
  company: {
    name:            string;
    registryId:      string;
    businessNumber?: string;
    jurisdiction:    string;
    provinceKey:     string;
    incorpDate?:     string;
    location?:       string;
  };
  events?: MbEvent[];
};

/** Which services push to MB. Kept explicit so we don't accidentally leak
    read-only orders (reports, searches) or incorporations that lack a
    registry ID at time of payment. */
const MB_FED_SERVICES = new Set([
  "annual-return",
  "annual-return-multiple",
  "change-directors",
  "change-address",
  "voluntary-dissolution",
  "revival",
]);

/** Build the MinuteBook feed payload from a Stripe session. Returns null
    for services we don't feed, or if required metadata is missing. */
function buildMbPayload(session: Stripe.Checkout.Session): MbFeedPayload | null {
  const m = session.metadata ?? {};
  const service = m.service;
  if (!service || !MB_FED_SERVICES.has(service)) return null;

  const email = session.customer_details?.email;
  if (!email) return null;
  if (!m.company_name || !m.registry_id || !m.province_key) return null;

  const base: MbFeedPayload = {
    orderId:       session.id,
    service,
    occurredAt:    new Date().toISOString(),
    customerEmail: email,
    customerName:  m.contact_name || undefined,
    company: {
      name:            m.company_name,
      registryId:      m.registry_id,
      businessNumber:  m.business_number || undefined,
      jurisdiction:    m.jurisdiction    || "",
      provinceKey:     m.province_key,
      incorpDate:      m.incorp_date     || undefined,
      location:        m.location        || undefined,
    },
    events: [],
  };

  const today = new Date().toISOString().slice(0, 10);

  if (service === "annual-return" || service === "annual-return-multiple") {
    // 1 annual_return_filed event per year filed. If a set of changes came
    // in on the same filing, emit those as separate events too.
    const years = Math.max(1, parseInt(m.years_filed ?? "1", 10) || 1);
    const currentYear = new Date().getFullYear();
    for (let i = 0; i < years; i++) {
      base.events!.push({
        type:          "annual_return_filed",
        effectiveDate: today,
        data:          { year: currentYear - (years - 1 - i) },
      });
    }
    const changes = readChunkedJson<StoredChanges>(m, "changes_json");
    if (changes) {
      for (const d of changes.directors ?? []) {
        if (d.type === "added")   base.events!.push({ type: "director_appointed",       effectiveDate: d.effectiveDate || today, data: { name: d.name } });
        if (d.type === "resigned") base.events!.push({ type: "director_resigned",       effectiveDate: d.effectiveDate || today, data: { name: d.name } });
        if (d.type === "address")  base.events!.push({ type: "director_address_changed", effectiveDate: d.effectiveDate || today, data: { name: d.name, newAddress: d.newAddress } });
      }
      if (changes.registeredAddress?.changed) {
        base.events!.push({
          type:          "address_changed",
          effectiveDate: changes.registeredAddress.effectiveDate || today,
          data:          { newAddress: changes.registeredAddress.newAddress },
        });
      }
    }
    return base;
  }

  if (service === "change-directors") {
    type Row = { type: string; role: string; name: string; effectiveDate: string; newAddress?: string; officerTitle?: string };
    const details = readChunkedJson<{ changes: Row[] }>(m, "details_json");
    for (const c of details?.changes ?? []) {
      if (c.role === "director") {
        if (c.type === "appointed")       base.events!.push({ type: "director_appointed",       effectiveDate: c.effectiveDate, data: { name: c.name } });
        if (c.type === "resigned")        base.events!.push({ type: "director_resigned",       effectiveDate: c.effectiveDate, data: { name: c.name } });
        if (c.type === "address-changed") base.events!.push({ type: "director_address_changed", effectiveDate: c.effectiveDate, data: { name: c.name, newAddress: c.newAddress } });
      } else if (c.role === "officer") {
        if (c.type === "appointed") base.events!.push({ type: "officer_appointed", effectiveDate: c.effectiveDate, data: { name: c.name, title: c.officerTitle } });
        if (c.type === "resigned")  base.events!.push({ type: "officer_resigned", effectiveDate: c.effectiveDate, data: { name: c.name, title: c.officerTitle } });
        // No officer_address_changed event type on MB — silently skip.
      }
    }
    return base;
  }

  if (service === "change-address") {
    const details = readChunkedJson<{ newAddress: string; effectiveDate: string }>(m, "details_json");
    base.events!.push({
      type:          "address_changed",
      effectiveDate: details?.effectiveDate || today,
      data:          { newAddress: details?.newAddress },
    });
    return base;
  }

  if (service === "voluntary-dissolution") {
    const details = readChunkedJson<{ effectiveDate: string; debtsPaid: boolean; finalTaxFiled: boolean; assetsDistributed: boolean; reason: string }>(m, "details_json");
    base.events!.push({
      type:          "voluntary_dissolution_filed",
      effectiveDate: details?.effectiveDate || today,
      data: {
        debtsPaid:         details?.debtsPaid,
        finalTaxFiled:     details?.finalTaxFiled,
        assetsDistributed: details?.assetsDistributed,
        reason:            details?.reason,
      },
    });
    return base;
  }

  if (service === "revival") {
    const details = readChunkedJson<{ hasMissedFilings: boolean; reasonForRevival: string; filingsNote: string }>(m, "details_json");
    base.events!.push({
      type:          "revival_filed",
      effectiveDate: today,
      data: {
        hasMissedFilings: details?.hasMissedFilings,
        reasonForRevival: details?.reasonForRevival,
        filingsNote:      details?.filingsNote,
      },
    });
    return base;
  }

  return null;
}

/** POST the payload to MinuteBook, signed with HMAC-SHA256. Never throws —
    logs on failure. MB outage should not cause Stripe webhook retries. */
async function pushToMinuteBook(session: Stripe.Checkout.Session): Promise<void> {
  const url    = process.env.MINUTEBOOK_FEED_URL;
  const secret = process.env.CRS_FEED_SECRET;
  if (!url || !secret) return; // Feature not configured yet — silent no-op.

  const payload = buildMbPayload(session);
  if (!payload) return;

  const body = JSON.stringify(payload);
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type":     "application/json",
        "X-CRS-Signature":  `sha256=${signature}`,
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[crs→mb] non-2xx response:", res.status, text.slice(0, 400));
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown MinuteBook feed error.";
    console.error("[crs→mb] push failed:", msg);
  }
}

/** Format the service-specific details block for corp-doc fulfillment
 *  emails (share-certificate, director-resolution, shareholder-resolution,
 *  bylaws). Progressive-disclosure sub-forms serialize into a single
 *  details JSON — this reads whatever fields are present for the specific
 *  resolution / flavour and formats them for the ops mailbox. */
function formatCorpDocDetails(service: string, d: Record<string, unknown> | null): string {
  if (!d) return "(no structured details payload)";

  if (service === "share-certificate") {
    return [
      `Shareholder:              ${d.shareholderName ?? "—"}`,
      `Address:                  ${d.shareholderAddress ?? "—"}`,
      `Class:                    ${d.shareClass ?? "—"}`,
      `Number of shares:         ${d.numShares ?? "—"}`,
      `Issue date:               ${d.issueDate ?? "—"}`,
      `Certificates to prepare:  ${d.numCertificates ?? 1}`,
      `Signing officer:          ${d.signingOfficerName ?? "—"} (${d.signingOfficerRole ?? "—"})`,
      `Consideration ($ paid):   ${d.consideration != null ? `$${d.consideration}` : "not provided — email customer if needed for the securities register"}`,
      `Transfer restrictions:    ${d.transferRestrictions === "custom" ? "CUSTOM (see notes / customRestrictionText)" : "standard"}`,
      (d.customRestrictionText as string)?.trim() ? `Custom restrictions:      ${(d.customRestrictionText as string).trim()}` : "",
      (d.notes as string)?.trim() ? `Notes:                    ${(d.notes as string).trim()}` : "",
    ].filter(Boolean).join("\n");
  }

  if (service === "director-resolution") {
    const t = String(d.resolutionType ?? "");
    const lines: string[] = [
      `Resolution type:   ${t || "—"}`,
      `Effective date:    ${d.effectiveDate ?? "—"}`,
      `Directors:         ${d.directorsNames ?? "—"}`,
    ];
    if (t === "annual-package") {
      lines.push(`Fiscal year end:   ${d.fiscalYearEnd ?? "—"}`);
      lines.push(`Officer changes?:  ${d.hasOfficerChanges ? "YES" : "no"}`);
      lines.push(`Dividends this yr: ${d.hasDividendsThisYear ? "YES" : "no"}`);
    } else if (t === "share-issuance") {
      lines.push(`New shareholder:   ${d.newShareholderName ?? "—"}`);
      lines.push(`Class + count:     ${d.shareIssueClass ?? "—"} · ${d.shareIssueCount ?? "—"}`);
      lines.push(`Consideration:     $${d.shareIssueConsideration ?? "—"}`);
    } else if (t === "officer-appointment") {
      lines.push(`Officer:           ${d.officerName ?? "—"} (${d.officerPosition ?? "—"})`);
      lines.push(`Action:            ${d.officerAction === "remove" ? "REMOVE" : "APPOINT"}`);
    } else if (t === "banking") {
      lines.push(`Bank:              ${d.bankName ?? "—"}`);
      lines.push(`Purpose:           ${d.bankPurpose ?? "—"}`);
      lines.push(`Signing officers:  ${d.bankSigningOfficers ?? "—"}`);
      lines.push(`Signature rule:    ${d.bankSignatureRule ?? "—"}`);
    } else if (t === "dividend") {
      lines.push(`Class:             ${d.dividendShareClass ?? "—"}`);
      lines.push(`Per share:         $${d.dividendPerShare ?? "—"}`);
      lines.push(`Record date:       ${d.dividendRecordDate ?? "—"}`);
      lines.push(`Payment date:      ${d.dividendPaymentDate ?? "—"}`);
    } else if (t === "other") {
      lines.push(`Description:       ${d.otherDescription ?? "—"}`);
    }
    if ((d.notes as string)?.trim()) lines.push(`Notes:             ${(d.notes as string).trim()}`);
    return lines.join("\n");
  }

  if (service === "shareholder-resolution") {
    const t = String(d.resolutionType ?? "");
    const lines: string[] = [
      `Resolution type:   ${t || "—"}`,
      `Ordinary/Special:  ${d.isSpecial ? "SPECIAL (two-thirds threshold)" : "Ordinary (simple majority)"}`,
      `Effective date:    ${d.effectiveDate ?? "—"}`,
      `Shareholders:      ${d.shareholdersNames ?? "—"}`,
    ];
    if (t === "annual-package") {
      lines.push(`Fiscal year end:   ${d.fiscalYearEnd ?? "—"}`);
      lines.push(`Directors elected: ${d.directorsBeingElected ?? "—"}`);
      lines.push(`Waive auditor?:    ${d.waiveAuditor !== false ? "YES" : "no"}`);
      lines.push(`Approve financials?: ${d.approveFinancials !== false ? "YES" : "no"}`);
    } else if (t === "article-amendment") {
      lines.push(`Nature:            ${d.amendmentNature ?? "—"}`);
      lines.push(`Detail:            ${d.amendmentDetail ?? "—"}`);
    } else if (t === "bylaw-confirmation") {
      lines.push(`By-law:            ${d.bylawNumber ?? "—"}`);
      lines.push(`Enacted date:      ${d.bylawEnactedDate ?? "—"}`);
    } else if (t === "fundamental-change") {
      lines.push(`Type:              ${d.fundamentalChangeType ?? "—"}`);
      lines.push(`Detail:            ${d.fundamentalChangeDetail ?? "—"}`);
    } else if (t === "other") {
      lines.push(`Description:       ${d.otherDescription ?? "—"}`);
    }
    if ((d.notes as string)?.trim()) lines.push(`Notes:             ${(d.notes as string).trim()}`);
    return lines.join("\n");
  }

  if (service === "bylaws") {
    const f = String(d.flavour ?? "");
    const lines: string[] = [
      `Flavour:                  ${f === "new-standard" ? "NEW · Standard By-Law No. 1" :
                                    f === "new-custom"   ? "NEW · CUSTOM (email customer to gather provisions before drafting)" :
                                    f === "amendment"    ? "AMENDMENT to existing by-law" : "—"}`,
    ];
    if (f === "new-standard" || f === "new-custom") {
      lines.push(`Officer positions:        ${d.officerPositions ?? "—"}`);
      lines.push(`Fiscal year end:          ${d.fiscalYearEnd ?? "—"}`);
      lines.push(`Director count range:     ${d.minDirectors ?? "—"}–${d.maxDirectors ?? "—"}`);
      lines.push(`Signing authority:        ${d.signingAuthority ?? "—"}`);
      lines.push(`Corporate seal:           ${d.usesCorporateSeal ? "YES" : "no"}`);
      lines.push(`Transfer restrictions:    ${d.transferRestrictions === "custom" ? "CUSTOM (see notes)" : "standard"}`);
      if (f === "new-custom" && (d.customProvisionsNote as string)?.trim()) {
        lines.push("");
        lines.push(`CUSTOM PROVISIONS (customer will be emailed for full detail):`);
        lines.push(`  ${(d.customProvisionsNote as string).trim()}`);
      }
    } else if (f === "amendment") {
      lines.push(`By-law being amended:     ${d.bylawNumber ?? "—"}`);
      lines.push(`Effective date:           ${d.effectiveDate ?? "—"}`);
      lines.push(`Amendment detail:`);
      lines.push(`  ${(d.amendmentDetail as string)?.trim() ?? "—"}`);
    }
    if ((d.notes as string)?.trim()) lines.push(`Notes:                    ${(d.notes as string).trim()}`);
    return lines.join("\n");
  }

  return JSON.stringify(d, null, 2);
}

/** Format the service-specific details block for the fulfillment email. */
function formatChangeDetails(service: string, d: Record<string, unknown> | null): string {
  if (!d) return "(no structured details payload)";

  if (service === "change-directors") {
    const changes = (d.changes as Array<Record<string, string>>) ?? [];
    if (!changes.length) return "(no changes recorded)";
    return changes.map((c, i) => {
      const role  = c.role === "officer" ? `Officer (${c.officerTitle || "no title"})` : "Director";
      const kind  = c.type === "appointed" ? "Appointed"
                 : c.type === "resigned"  ? "Resigned"
                 : "Address changed";
      const extra = c.type === "address-changed" && c.newAddress ? ` → ${c.newAddress}` : "";
      return `  ${i + 1}. ${role} · ${kind} · ${c.name} (effective ${c.effectiveDate})${extra}`;
    }).join("\n");
  }

  if (service === "change-address") {
    return `New address: ${d.newAddress ?? "—"}\nEffective:   ${d.effectiveDate ?? "—"}`;
  }

  if (service === "voluntary-dissolution") {
    return [
      `Effective dissolution date: ${d.effectiveDate ?? "—"}`,
      `All debts paid:             ${d.debtsPaid ? "YES" : "no"}`,
      `Final T2 tax return filed:  ${d.finalTaxFiled ? "YES" : "no"}`,
      `Assets distributed:         ${d.assetsDistributed ? "YES" : "no"}`,
      `Reason:                     ${(d.reason as string)?.trim() || "(not stated)"}`,
    ].join("\n");
  }

  if (service === "revival") {
    return [
      `Missed annual returns: ${d.hasMissedFilings ? "YES — customer aware they'll be quoted separately" : "no"}`,
      d.hasMissedFilings ? `Filings note:          ${(d.filingsNote as string)?.trim() || "(no detail)"}` : "",
      `Reason for revival:    ${(d.reasonForRevival as string)?.trim() || "(not stated)"}`,
    ].filter(Boolean).join("\n");
  }

  return JSON.stringify(d, null, 2);
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

/** Customer-facing summary of changes captured on the order form. Only
 *  the details we want to echo back — kept concise so the confirmation
 *  email doesn't turn into a wall of text. */
function customerChangesSection(m: Record<string, string>): string {
  const summary = (m.changes_summary ?? "").trim();
  if (!summary || summary === "no changes reported") return "";

  const changes = readChunkedJson<StoredChanges>(m, "changes_json");
  const lines: string[] = ["", "Changes you asked us to file:", `  ${summary}`, ""];

  if (changes) {
    for (const d of changes.directors ?? []) {
      const detail = d.type === "address" ? ` → new address: ${d.newAddress}` : "";
      lines.push(`  • Director ${d.type}: ${d.name} (effective ${d.effectiveDate})${detail}`);
    }
    for (const s of changes.shareholders ?? []) {
      const detail =
        s.type === "address" ? ` → new address: ${s.newAddress}` :
        s.type === "voting"  ? ` → voting ${s.oldPercent}% → ${s.newPercent}%` : "";
      lines.push(`  • Shareholder ${s.type}: ${s.name} (effective ${s.effectiveDate})${detail}`);
    }
    if (changes.registeredAddress?.changed) {
      lines.push(`  • New registered address (effective ${changes.registeredAddress.effectiveDate}):`);
      lines.push(`      ${changes.registeredAddress.newAddress}`);
    }
    if (changes.recordsAddress?.changed) {
      lines.push(`  • New records address (effective ${changes.recordsAddress.effectiveDate}):`);
      lines.push(`      ${changes.recordsAddress.newAddress}`);
    }
    if (changes.authorizedAgent?.changed) {
      lines.push(`  • New authorized agent (effective ${changes.authorizedAgent.effectiveDate}):`);
      lines.push(`      ${changes.authorizedAgent.newAgent}`);
    }
    if (changes.other?.trim()) {
      lines.push(`  • Your note:`);
      lines.push(`      ${changes.other.trim().split(/\r?\n/).join("\n      ")}`);
    }
  }

  lines.push("");
  lines.push("We've captured all of the above and our team will file the return with these updates.");
  return lines.join("\n");
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
${customerChangesSection(m)}

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

  // Fire the MinuteBook feed push in the background — emails and the
  // Stripe response take priority; a MinuteBook failure must never cause
  // a Stripe retry. pushToMinuteBook itself catches all errors.
  void pushToMinuteBook(session);

  // Attribute the paid conversion back to the outreach token that drove it,
  // if any. Fire-and-forget — failure here never blocks fulfillment.
  const outreachRef = session.metadata?.outreach_ref;
  if (outreachRef) void markTokenConverted(outreachRef, session.id);

  // Ping the operator's phone. Amount is a strong summary signal; company
  // + jurisdiction let them place the order without opening the dashboard.
  // Fire-and-forget — Infobip must never fail a Stripe fulfillment.
  void sendAlertSms(
    `CRS PAID: ${fmtAmount(session)} - ${session.metadata?.service ?? "order"} - `
    + `${session.metadata?.company_name ?? "-"} - ${session.metadata?.jurisdiction ?? "-"}`
  );

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

  if (service === "change-directors" || service === "change-address" || service === "voluntary-dissolution" || service === "revival") {
    const m = session.metadata ?? {};
    const details = readChunkedJson<Record<string, unknown>>(m, "details_json");
    const label =
      service === "change-directors"       ? "Director / Officer Change" :
      service === "change-address"         ? "Registered Address Change" :
      service === "voluntary-dissolution"  ? "Voluntary Dissolution"     :
                                             "Corporate Revival";

    const detailsBlock = formatChangeDetails(service, details);

    const ownerText = `
NEW PAID ORDER — ${label} — Stripe session ${session.id}
=====================================================
Amount:        ${fmtAmount(session)}
Payment:       ${session.payment_status}
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

--- ${label} ---
${detailsBlock}

--- Customer ---
Name:          ${m.contact_name ?? "—"}
Email:         ${customerEmail ?? "—"}
Phone:         ${m.contact_phone ?? "—"}
=====================================================

Action: file with the ${m.jurisdiction ?? "target"} registry within 24 hours.
Stripe: https://dashboard.stripe.com/payments/${session.payment_intent}
`.trim();

    const customerText = `
Hi ${m.contact_name ?? "there"},

We've received your payment for a ${label} for ${m.company_name ?? "your corporation"}.

We're filing the paperwork with the ${m.jurisdiction ?? "government"} registry within
24 hours. You'll receive a filing confirmation and receipt by email.

Order summary:
  Reference:    ${session.id}
  Amount paid:  ${fmtAmount(session)}
  Company:      ${m.company_name ?? "—"}
  Jurisdiction: ${m.jurisdiction ?? "—"}

Questions? Reply to this email — we'll respond within one business hour.

— The CRS Team
Corporate Registry Services
support@corporateregistryservices.ca
`.trim();

    await ses.send(new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [ownerEmail] },
      Message: {
        Subject: { Data: `[CRS] Paid — ${label} ${m.jurisdiction ?? ""} — ${m.company_name ?? "—"}` },
        Body:    { Text: { Data: ownerText } },
      },
    }));
    if (customerEmail) {
      await ses.send(new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [customerEmail] },
        Message: {
          Subject: { Data: `Payment received — we're filing your ${label.toLowerCase()}` },
          Body:    { Text: { Data: customerText } },
        },
      }));
    }
    return;
  }

  if (service === "corporate-search" || service === "nuans-search") {
    const m = session.metadata ?? {};
    const label = service === "corporate-search" ? "Corporate Name Search" : "NUANS Name Search";
    const ownerText = `
NEW PAID ORDER — ${label} — Stripe session ${session.id}
=====================================================
Amount:        ${fmtAmount(session)}
Payment:       ${session.payment_status}
Attribution:   ${m.src ?? "—"}

--- Name search ---
Proposed name: ${m.proposed_name ?? "—"}
Fallback:      ${m.alt_name || "(none)"}
Jurisdiction:  ${m.jurisdiction ?? "—"} (${m.province_key || "federal"})

--- Customer ---
Name:          ${m.contact_name ?? "—"}
Email:         ${customerEmail ?? "—"}
Phone:         ${m.contact_phone ?? "—"}
=====================================================

Action: run the ${label.toLowerCase()} and email the report PDF to the customer.
Stripe: https://dashboard.stripe.com/payments/${session.payment_intent}
`.trim();

    const customerText = `
Hi ${m.contact_name ?? "there"},

We've received your payment for a ${label} for the proposed name
"${m.proposed_name ?? "—"}"${m.alt_name ? ` (fallback "${m.alt_name}")` : ""}.

We're running the search now and will email your report as soon as it
completes — typically within one business hour.

Order summary:
  Reference:    ${session.id}
  Amount paid:  ${fmtAmount(session)}
  Jurisdiction: ${m.jurisdiction ?? "—"}

Questions? Reply to this email — we'll respond within one business hour.

— The CRS Team
Corporate Registry Services
support@corporateregistryservices.ca
`.trim();

    await ses.send(new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [ownerEmail] },
      Message: {
        Subject: { Data: `[CRS] Paid — ${label} — ${m.proposed_name ?? "—"}` },
        Body:    { Text: { Data: ownerText } },
      },
    }));
    if (customerEmail) {
      await ses.send(new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [customerEmail] },
        Message: {
          Subject: { Data: `Payment received — your ${label} is on the way` },
          Body:    { Text: { Data: customerText } },
        },
      }));
    }
    return;
  }

  if (service === "profile-report" || service === "good-standing") {
    const m = session.metadata ?? {};
    const label = service === "profile-report" ? "Corporate Profile Report" : "Certificate of Good Standing";
    const ownerText = `
NEW PAID ORDER — ${label} — Stripe session ${session.id}
=====================================================
Amount:        ${fmtAmount(session)}
Payment:       ${session.payment_status}
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

--- Customer ---
Name:          ${m.contact_name ?? "—"}
Email:         ${customerEmail ?? "—"}
Phone:         ${m.contact_phone ?? "—"}
=====================================================

Action: pull the ${label.toLowerCase()} from the ${m.jurisdiction ?? "target"} registry and email PDF to the customer.
Stripe: https://dashboard.stripe.com/payments/${session.payment_intent}
`.trim();

    const customerText = `
Hi ${m.contact_name ?? "there"},

We've received your payment for a ${label} for ${m.company_name ?? "your corporation"}.

We're pulling it from the ${m.jurisdiction ?? "government"} registry now and will
email the PDF as soon as it's available — typically within one business hour.

Order summary:
  Reference:    ${session.id}
  Amount paid:  ${fmtAmount(session)}
  Company:      ${m.company_name ?? "—"}
  Registry ID:  ${m.registry_id ?? "—"}
  Jurisdiction: ${m.jurisdiction ?? "—"}

Questions? Reply to this email — we'll respond within one business hour.

— The CRS Team
Corporate Registry Services
support@corporateregistryservices.ca
`.trim();

    await ses.send(new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [ownerEmail] },
      Message: {
        Subject: { Data: `[CRS] Paid — ${label} ${m.jurisdiction ?? ""} — ${m.company_name ?? "—"}` },
        Body:    { Text: { Data: ownerText } },
      },
    }));
    if (customerEmail) {
      await ses.send(new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [customerEmail] },
        Message: {
          Subject: { Data: `Payment received — your ${label} is on the way` },
          Body:    { Text: { Data: customerText } },
        },
      }));
    }
    return;
  }

  /* Corp-doc family — document preparation services (not gov filings).
     share-certificate, director-resolution, shareholder-resolution, bylaws.
     Customer email language reflects "prepare" not "file" and the
     1-business-day SLA. */
  if (service === "share-certificate" || service === "director-resolution" || service === "shareholder-resolution" || service === "bylaws") {
    const m = session.metadata ?? {};
    const details = readChunkedJson<Record<string, unknown>>(m, "details_json");
    const label =
      service === "share-certificate"       ? "Share Certificate"        :
      service === "director-resolution"     ? "Director Resolution"      :
      service === "shareholder-resolution"  ? "Shareholder Resolution"   :
                                              "Corporate By-Laws";

    // For custom by-laws, ops needs a very visible flag at the top of the
    // email because they must email the customer BEFORE drafting — the
    // form only captured a short note.
    const isCustomBylaws = service === "bylaws" && details?.flavour === "new-custom";
    const detailsBlock = formatCorpDocDetails(service, details);
    const opsFlag = isCustomBylaws
      ? "\n⚠ CUSTOM BY-LAWS — email the customer first to gather full custom provisions before drafting.\n"
      : "";

    const ownerText = `
NEW PAID ORDER — ${label} — Stripe session ${session.id}
=====================================================
Amount:        ${fmtAmount(session)}
Payment:       ${session.payment_status}
Attribution:   ${m.src ?? "—"}
${opsFlag}
--- Company (from registry lookup) ---
Name:          ${m.company_name ?? "—"}
Jurisdiction:  ${m.jurisdiction ?? "—"} (${m.province_key ?? "—"})
Registry ID:   ${m.registry_id ?? "—"}
BN:            ${m.business_number ?? "—"}
Entity type:   ${m.entity_type ?? "—"}
Status:        ${m.registry_status ?? "—"}
Incorporated:  ${m.incorp_date ?? "—"}
Location:      ${m.location ?? "—"}

--- ${label} details ---
${detailsBlock}

--- Customer ---
Name:          ${m.contact_name ?? "—"}
Email:         ${customerEmail ?? "—"}
Phone:         ${m.contact_phone ?? "—"}
=====================================================

Action: prepare the ${label.toLowerCase()} and email PDFs to the customer within 1 business day.
${isCustomBylaws ? "First step for custom by-laws: reply to the customer to gather full custom provisions.\n" : ""}Stripe: https://dashboard.stripe.com/payments/${session.payment_intent}
`.trim();

    const customerNextStep = isCustomBylaws
      ? "Because you selected custom by-laws, we'll email you first to gather your custom provisions — reply with any specifics (share transfer restrictions, class-of-shares rules, non-standard voting, etc.). Turnaround is 3-5 business days from that reply."
      : `We're preparing your ${label.toLowerCase()} now. You'll receive the ready-to-sign PDFs by email within one business day.`;

    const customerText = `
Hi ${m.contact_name ?? "there"},

We've received your payment for a ${label} for ${m.company_name ?? "your corporation"}.

${customerNextStep}

Order summary:
  Reference:    ${session.id}
  Amount paid:  ${fmtAmount(session)}
  Company:      ${m.company_name ?? "—"}
  Registry ID:  ${m.registry_id ?? "—"}
  Jurisdiction: ${m.jurisdiction ?? "—"}

Questions? Reply to this email — we'll respond within one business hour.

— The CRS Team
Corporate Registry Services
support@corporateregistryservices.ca
`.trim();

    await ses.send(new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [ownerEmail] },
      Message: {
        Subject: { Data: `[CRS] Paid — ${label} — ${m.company_name ?? "—"}${isCustomBylaws ? " · CUSTOM" : ""}` },
        Body:    { Text: { Data: ownerText } },
      },
    }));
    if (customerEmail) {
      await ses.send(new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [customerEmail] },
        Message: {
          Subject: { Data: `Payment received — we're preparing your ${label.toLowerCase()}` },
          Body:    { Text: { Data: customerText } },
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
