import { calculateAnnualReturnDeadline } from "./annual-return-deadlines";
import type { OutreachCompany, OutreachService } from "./outreach-mongo";

/**
 * Email template registry. Each template renders both an HTML and plain-text
 * version, plus a default subject.
 *
 * v1 ships Annual Returns fully polished. The other four services have
 * placeholder templates so the picker in the admin UI works — replace the
 * `render` bodies for those as needed.
 *
 * IMPORTANT: every template MUST include:
 *   - The persona signoff (env-driven)
 *   - The CASL footer (mailing address, unsubscribe link, commercial-service disclosure)
 *
 * The renderer builds those in a shared wrapper so individual templates
 * can't accidentally omit them.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://corporateregistryservices.ca";
const MAILING  = process.env.CRS_MAILING_ADDRESS  ?? "2618 Hopewell Pl NE, Calgary, AB T1Y 7J7";
const PERSONA_NAME  = process.env.OUTREACH_PERSONA_NAME  ?? "Alex Morgan";
const PERSONA_TITLE = process.env.OUTREACH_PERSONA_TITLE ?? "Registry Specialist";

const REGISTRY_NAME: Record<string, string> = {
  ab: "Alberta Corporate Registry",
  bc: "BC Registries",
  federal: "Corporations Canada",
  mb: "Companies Office of Manitoba",
  nb: "Corporate Affairs Registry (NB)",
  nl: "Registry of Companies (NL)",
  ns: "Registry of Joint Stock Companies (NS)",
  nt: "NWT Corporate Registries",
  nu: "Nunavut Corporate Registries",
  on: "Ontario Business Registry",
  pe: "Corporate Registrar (PEI)",
  qc: "Registraire des entreprises (Québec)",
  sk: "Information Services Corporation (Saskatchewan)",
  yt: "Yukon Corporate Affairs",
};

const PROVINCE_SLUG: Record<string, string> = {
  ab: "alberta", bc: "british-columbia", federal: "canada", mb: "manitoba",
  nb: "new-brunswick", nl: "newfoundland-and-labrador", ns: "nova-scotia",
  nt: "northwest-territories", nu: "nunavut", on: "ontario", pe: "prince-edward-island",
  qc: "quebec", sk: "saskatchewan", yt: "yukon",
};

export type RenderContext = {
  token:          string;
  company:        OutreachCompany;
  recipientName?: string;
  unsubscribeUrl: string;
  customIntro?:   string;
};

export type RenderedEmail = {
  subject: string;
  html:    string;
  text:    string;
};

export type TemplateDef = {
  key:            OutreachService;
  label:          string;
  render:         (ctx: RenderContext) => RenderedEmail;
};

/* ────────────────────────── Shared helpers ────────────────────────── */

function orderUrl(token: string): string {
  return `${SITE_URL}/o/${token}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Outer HTML shell + CASL footer — every template renders its own middle
 *  (header bar, deadline banner, body) so services can differ without
 *  fighting a rigid wrapper. */
function shell({
  subject, innerHtml, textBody, ctx,
}: {
  subject:   string;
  innerHtml: string;
  textBody:  string;
  ctx:       RenderContext;
}): RenderedEmail {
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F5F8;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F5F8;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:8px;overflow:hidden;border:1px solid #DCE4EA;">
    ${innerHtml}
    <tr>
      <td style="background-color:#F1F5F8;padding:20px 32px;border-top:1px solid #DCE4EA;">
        <p style="margin:0 0 6px;font-size:11px;color:#8A99A8;line-height:1.6;">
          CRS — Corporate Registry Services · ${esc(MAILING)} ·
          <a href="${SITE_URL}" style="color:#8A99A8;">corporateregistryservices.ca</a> ·
          <a href="mailto:support@corporateregistryservices.ca" style="color:#8A99A8;">support@corporateregistryservices.ca</a>
        </p>
        <p style="margin:0 0 6px;font-size:11px;color:#8A99A8;line-height:1.6;">
          Sent by ${esc(PERSONA_NAME)}, ${esc(PERSONA_TITLE)}.
        </p>
        <p style="margin:0;font-size:11px;color:#8A99A8;line-height:1.6;">
          You&rsquo;re receiving this compliance notice at your publicly listed business address.
          CRS is a private filing service and is not affiliated with, endorsed by, or approved by any government registry.
          <a href="${ctx.unsubscribeUrl}" style="color:#8A99A8;">Unsubscribe</a> and you won&rsquo;t hear from us again.
        </p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body></html>`;

  const text = `${textBody}

——
${PERSONA_NAME}, ${PERSONA_TITLE}
CRS — Corporate Registry Services
${MAILING}
${SITE_URL}
support@corporateregistryservices.ca

You're receiving this compliance notice at your publicly listed business address.
CRS is a private filing service and is not affiliated with any government registry.
Unsubscribe: ${ctx.unsubscribeUrl}
`;

  return { subject, html, text };
}

/* ─────────────────────── Annual Return template ─────────────────────── */

function daysUntil(d: Date | null): number | null {
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (24 * 3600 * 1000));
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });
}

function statusColor(status?: string): string {
  const s = (status ?? "").toLowerCase();
  if (s === "active") return "#2A7D8F";  // teal
  if (s.includes("inactive") || s.includes("dissolved") || s.includes("struck")) return "#B45309";
  return "#5B7E92";
}

function firstName(ctx: RenderContext): string {
  const raw = (ctx.recipientName ?? "").trim();
  if (!raw) return "there";
  return raw.split(/\s+/)[0];
}

const annualReturnTemplate: TemplateDef = {
  key:   "annual-return",
  label: "Annual Return — filing reminder",
  render(ctx) {
    const info = calculateAnnualReturnDeadline(ctx.company.incorpDate, ctx.company.provinceKey);
    const days = daysUntil(info.dueDate);
    const url  = orderUrl(ctx.token);
    const registryName = REGISTRY_NAME[ctx.company.provinceKey] ?? `${ctx.company.jurisdiction} Corporate Registry`;
    const provinceSlug = PROVINCE_SLUG[ctx.company.provinceKey] ?? ctx.company.provinceKey.toLowerCase();
    const dueLabel     = info.dueDate ? fmtDate(info.dueDate) : "See jurisdiction rules";
    const daysLeftLabel = days !== null
      ? (days > 0 ? `${days} DAYS REMAINING` : days === 0 ? "DUE TODAY" : `${Math.abs(days)} DAYS OVERDUE`)
      : "SEE JURISDICTION RULES";
    const bannerColor  = days !== null && days < 0 ? "#B91C1C" : "#B7791F";
    const incorpLabel  = ctx.company.incorpDate
      ? new Date(ctx.company.incorpDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })
      : "—";
    const lookupDate   = new Date().toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
    const statusVal    = ctx.company.status ?? "Active";

    const subject = info.dueDate
      ? `${ctx.company.name} — ${ctx.company.jurisdiction} Annual Return by ${dueLabel}`
      : `${ctx.company.name} — ${ctx.company.jurisdiction} Annual Return reminder`;

    const customIntroHtml = ctx.customIntro?.trim()
      ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#1A2B3A;">${esc(ctx.customIntro.trim())}</p>`
      : "";

    const rowStyle = (isFirst: boolean, valColor: string, extra: string = "") =>
      `padding:10px 16px;font-size:13px;color:${valColor};${isFirst ? "" : "border-top:1px solid #ECF1F5;"}${extra}`;

    const infoRow = (label: string, value: string, opts: { first?: boolean; valueColor?: string; bold?: boolean; html?: boolean } = {}) => {
      const first = !!opts.first;
      const vc    = opts.valueColor ?? "#1A2B3A";
      const bold  = opts.bold ? "font-weight:bold;" : "";
      const val   = opts.html ? value : esc(value);
      return `<tr>
        <td style="${rowStyle(first, "#5A6B7A")}width:45%;">${esc(label)}</td>
        <td style="${rowStyle(first, vc, bold)}">${val}</td>
      </tr>`;
    };

    const statusPill = `<span style="background-color:${statusColor(statusVal)};color:#FFFFFF;font-size:11px;font-weight:bold;padding:3px 10px;border-radius:10px;">${esc(statusVal)}</span>`;

    const innerHtml = `
    <!-- Header bar -->
    <tr>
      <td style="background-color:#0C3D61;padding:18px 32px;">
        <span style="font-size:18px;font-weight:bold;color:#FFFFFF;letter-spacing:0.5px;">CRS</span>
        <span style="font-size:12px;color:#CBE2EF;">&nbsp;|&nbsp; Corporate Registry Services</span>
      </td>
    </tr>

    <!-- Deadline banner -->
    <tr>
      <td style="background-color:${bannerColor};padding:10px 32px;text-align:center;">
        <span style="font-size:13px;font-weight:bold;color:#FFFFFF;">
          ANNUAL RETURN DUE: ${esc(dueLabel)} &nbsp;·&nbsp; ${esc(daysLeftLabel)}
        </span>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:32px;">

        <h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:#1A2B3A;font-family:Georgia,serif;">
          ${esc(ctx.company.jurisdiction)} Annual Return reminder for ${esc(ctx.company.name)}
        </h1>
        <p style="margin:0 0 22px;font-size:14px;color:#5A6B7A;">
          Hi ${esc(firstName(ctx))}, here is what the ${esc(registryName)} currently has on record:
        </p>

        ${customIntroHtml}

        <!-- Company information -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #DCE4EA;border-radius:6px;margin-bottom:8px;">
          <tr>
            <td colspan="2" style="background-color:#F1F5F8;padding:10px 16px;font-size:11px;font-weight:bold;color:#0C3D61;letter-spacing:1px;text-transform:uppercase;">
              Company Information
            </td>
          </tr>
          ${infoRow("Legal name",             ctx.company.name,                        { bold: true })}
          ${infoRow("Registry / access number", ctx.company.registryId || "—")}
          ${ctx.company.businessNumber ? infoRow("Business number", ctx.company.businessNumber) : ""}
          ${infoRow("Jurisdiction",           ctx.company.jurisdiction)}
          ${infoRow("Entity type",            ctx.company.entityType || "—")}
          ${infoRow("Status",                 statusPill,                              { html: true })}
          ${infoRow("Incorporated",           incorpLabel)}
          ${infoRow("Annual return due",      dueLabel,                                { bold: true, valueColor: "#B7791F" })}
        </table>
        <p style="margin:0 0 24px;font-size:11px;color:#8A99A8;">
          Source: ${esc(registryName)} public record, retrieved ${esc(lookupDate)}. Spot an error? Filing your annual return is exactly how it gets corrected.
        </p>

        <!-- What is an annual return -->
        <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#1A2B3A;">
          An <strong>annual return</strong> is a mandatory registry filing that confirms your corporation&rsquo;s directors,
          addresses, and continued existence &mdash; required every year even if the business had no activity.
        </p>
        <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#1A2B3A;">
          It is <strong>not your tax return</strong> &mdash; filing your T2 does not file your annual return.
          Corporations that miss it can be dissolved by the registry, freezing bank accounts, financing, and contracts.
        </p>

        <!-- CTA -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding:4px 0 8px;">
              <a href="${url}"
                 style="display:inline-block;background-color:#0C3D61;color:#FFFFFF;font-size:16px;font-weight:bold;text-decoration:none;padding:14px 40px;border-radius:6px;">
                Review &amp; File Now &mdash; $99<span style="font-size:11px;font-weight:normal;opacity:0.85;margin-left:4px;">+ gst</span>
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 0 20px;">
              <span style="font-size:12px;color:#8A99A8;">Government fee included &middot; Filed within 24 hours &middot; Your details above are already filled in &mdash; takes about 2 minutes</span>
            </td>
          </tr>
        </table>

        <!-- How it works -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F5F8;border-radius:6px;margin-bottom:24px;">
          <tr>
            <td style="padding:16px 20px;">
              <p style="margin:0 0 10px;font-size:12px;font-weight:bold;color:#0C3D61;text-transform:uppercase;letter-spacing:1px;">How it works</p>
              <p style="margin:0 0 6px;font-size:13px;color:#1A2B3A;">1. Confirm the information above &mdash; or tell us what changed (directors, address)</p>
              <p style="margin:0 0 6px;font-size:13px;color:#1A2B3A;">2. Pay $99<span style="font-size:11px;color:#5A6B7A;margin-left:3px;">+ gst</span> &mdash; no hidden fees, government fee included</p>
              <p style="margin:0;font-size:13px;color:#1A2B3A;">3. We file with the ${esc(registryName)} within 24 hours and monitor your deadline every year after</p>
            </td>
          </tr>
        </table>

        <!-- Secondary CTA -->
        <p style="margin:0 0 18px;font-size:13px;color:#5A6B7A;text-align:center;">
          Prefer to file it yourself?
          <a href="${SITE_URL}/articles/how-to-file-your-annual-return-in-${esc(provinceSlug)}?src=email-ar" style="color:#0C3D61;">Here&rsquo;s our free step-by-step guide</a>
          &mdash; no purchase needed.
        </p>

        <!-- Anti-CTA: already filed -->
        <p style="margin:0;font-size:12px;color:#8A99A8;text-align:center;line-height:1.6;">
          Already filed your ${new Date().getFullYear()} annual return?
          <a href="${SITE_URL}/o/${ctx.token}?ack=filed" style="color:#8A99A8;text-decoration:underline;">Click here to let us know</a>
          &mdash; we&rsquo;ll stop the reminders for this corporation.
        </p>

      </td>
    </tr>`;

    const textBody = `${ctx.company.jurisdiction.toUpperCase()} ANNUAL RETURN REMINDER
${ctx.company.name}
Due: ${dueLabel}${days !== null ? ` (${daysLeftLabel.toLowerCase()})` : ""}

Hi ${firstName(ctx)}, here is what the ${registryName} currently has on record:
${ctx.customIntro?.trim() ? `\n${ctx.customIntro.trim()}\n` : ""}
  Legal name:              ${ctx.company.name}
  Registry / access no.:   ${ctx.company.registryId || "—"}${ctx.company.businessNumber ? `\n  Business number:         ${ctx.company.businessNumber}` : ""}
  Jurisdiction:            ${ctx.company.jurisdiction}
  Entity type:             ${ctx.company.entityType || "—"}
  Status:                  ${statusVal}
  Incorporated:            ${incorpLabel}
  Annual return due:       ${dueLabel}

Source: ${registryName} public record, retrieved ${lookupDate}.

An annual return is a mandatory registry filing that confirms your corporation's
directors, addresses, and continued existence — required every year even if the
business had no activity.

It is NOT your tax return — filing your T2 does not file your annual return.
Corporations that miss it can be dissolved by the registry, freezing bank
accounts, financing, and contracts.

Review & File Now — $99 + gst (government fee included, filed within 24 hours):
  ${url}

How it works:
  1. Confirm the information above — or tell us what changed
  2. Pay $99 + gst — no hidden fees, government fee included
  3. We file with the ${registryName} within 24 hours

Prefer to file it yourself? Our free step-by-step guide:
  ${SITE_URL}/articles/how-to-file-your-annual-return-in-${provinceSlug}?src=email-ar

Already filed your ${new Date().getFullYear()} annual return? Let us know and
we'll stop the reminders for this corporation:
  ${SITE_URL}/o/${ctx.token}?ack=filed`;

    return shell({ subject, innerHtml, textBody, ctx });
  },
};

/* ─────────────── Placeholder templates for the other four ─────────────── */

function genericTemplate(
  key:      OutreachService,
  label:    string,
  headline: string,
  ctaLabel: string,
): TemplateDef {
  return {
    key,
    label,
    render(ctx) {
      const url = orderUrl(ctx.token);
      const subject = `${ctx.company.name} — ${label}`;
      const intro = ctx.customIntro?.trim() || headline;
      const registryName = REGISTRY_NAME[ctx.company.provinceKey] ?? `${ctx.company.jurisdiction} Corporate Registry`;

      const innerHtml = `
      <tr>
        <td style="background-color:#0C3D61;padding:18px 32px;">
          <span style="font-size:18px;font-weight:bold;color:#FFFFFF;letter-spacing:0.5px;">CRS</span>
          <span style="font-size:12px;color:#CBE2EF;">&nbsp;|&nbsp; Corporate Registry Services</span>
        </td>
      </tr>
      <tr>
        <td style="padding:32px;">
          <h1 style="margin:0 0 6px;font-size:20px;line-height:1.3;color:#1A2B3A;font-family:Georgia,serif;">
            ${esc(label)} — ${esc(ctx.company.name)}
          </h1>
          <p style="margin:0 0 18px;font-size:14px;color:#5A6B7A;">Hi ${esc(firstName(ctx))},</p>
          <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#1A2B3A;">${esc(intro)}</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #DCE4EA;border-radius:6px;margin-bottom:24px;">
            <tr>
              <td colspan="2" style="background-color:#F1F5F8;padding:10px 16px;font-size:11px;font-weight:bold;color:#0C3D61;letter-spacing:1px;text-transform:uppercase;">Company Information</td>
            </tr>
            <tr>
              <td style="padding:10px 16px;font-size:13px;color:#5A6B7A;width:45%;">Legal name</td>
              <td style="padding:10px 16px;font-size:13px;color:#1A2B3A;font-weight:bold;">${esc(ctx.company.name)}</td>
            </tr>
            <tr>
              <td style="padding:10px 16px;font-size:13px;color:#5A6B7A;border-top:1px solid #ECF1F5;">Registry / access number</td>
              <td style="padding:10px 16px;font-size:13px;color:#1A2B3A;border-top:1px solid #ECF1F5;">${esc(ctx.company.registryId || "—")}</td>
            </tr>
            ${ctx.company.businessNumber ? `<tr>
              <td style="padding:10px 16px;font-size:13px;color:#5A6B7A;border-top:1px solid #ECF1F5;">Business number</td>
              <td style="padding:10px 16px;font-size:13px;color:#1A2B3A;border-top:1px solid #ECF1F5;">${esc(ctx.company.businessNumber)}</td>
            </tr>` : ""}
            <tr>
              <td style="padding:10px 16px;font-size:13px;color:#5A6B7A;border-top:1px solid #ECF1F5;">Jurisdiction</td>
              <td style="padding:10px 16px;font-size:13px;color:#1A2B3A;border-top:1px solid #ECF1F5;">${esc(ctx.company.jurisdiction)}</td>
            </tr>
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="padding:4px 0 8px;">
                <a href="${url}" style="display:inline-block;background-color:#0C3D61;color:#FFFFFF;font-size:16px;font-weight:bold;text-decoration:none;padding:14px 40px;border-radius:6px;">
                  ${esc(ctaLabel)}
                </a>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 0 20px;">
                <span style="font-size:12px;color:#8A99A8;">Filed by CRS within one business hour of your request.</span>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 6px;font-size:12px;color:#8A99A8;">
            Source: ${esc(registryName)} public record.
          </p>
        </td>
      </tr>`;

      const textBody = `${label} — ${ctx.company.name}

Hi ${firstName(ctx)},

${intro}

  Legal name:              ${ctx.company.name}
  Registry / access no.:   ${ctx.company.registryId || "—"}${ctx.company.businessNumber ? `\n  Business number:         ${ctx.company.businessNumber}` : ""}
  Jurisdiction:            ${ctx.company.jurisdiction}

${ctaLabel}:
  ${url}

Filed by CRS within one business hour of your request.
Source: ${registryName} public record.`;

      return shell({ subject, innerHtml, textBody, ctx });
    },
  };
}

/* ─────────────────────── General intro template ─────────────────────── */

/** Multi-CTA template used when we don't know the recipient's specific need.
 *  Each service tile links back through /o/<token>?s=<service> so we can see
 *  which service actually caught their attention.
 */
const generalTemplate: TemplateDef = {
  key:   "general",
  label: "General — introduction to CRS services",
  render(ctx) {
    const tokenUrl = (svc: string) => `${SITE_URL}/o/${ctx.token}?s=${svc}`;
    const registryName = REGISTRY_NAME[ctx.company.provinceKey] ?? `${ctx.company.jurisdiction} Corporate Registry`;

    const subject = `${ctx.company.name} — services from CRS Compliance`;
    const introDefault = `You may have come across CRS while looking up ${ctx.company.name} on the ${ctx.company.jurisdiction} registry — here's a quick summary of what we handle for Canadian corporations.`;
    const intro = ctx.customIntro?.trim() || introDefault;

    const serviceTile = ({
      href, title, price, blurb, cta,
    }: { href: string; title: string; price: string; blurb: string; cta: string }) => `
      <tr>
        <td style="padding:12px 16px;border:1px solid #DCE4EA;border-radius:6px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin:0 0 3px;font-size:14px;font-weight:bold;color:#1A2B3A;">${esc(title)}</p>
                <p style="margin:0 0 6px;font-size:12px;color:#B7791F;font-weight:bold;">${esc(price)}</p>
                <p style="margin:0 0 10px;font-size:13px;color:#5A6B7A;line-height:1.5;">${esc(blurb)}</p>
                <a href="${href}" style="display:inline-block;background-color:#0C3D61;color:#FFFFFF;font-size:13px;font-weight:bold;text-decoration:none;padding:8px 18px;border-radius:5px;">
                  ${esc(cta)} &rarr;
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr><td style="height:10px;"></td></tr>`;

    const services = [
      {
        href:  tokenUrl("annual-return"),
        title: "Annual Return Filing",
        price: "$99 all-in + gst",
        blurb: "Mandatory every year, even if the corporation had no activity. Miss it and the registry can dissolve you.",
        cta:   "File annual return",
      },
      {
        href:  tokenUrl("profile-report"),
        title: "Corporate Profile Report",
        price: "$49 all-in + gst",
        blurb: "Official registry snapshot: directors, addresses, status, incorporation history. Delivered by email within one business hour.",
        cta:   "Order profile report",
      },
      {
        href:  tokenUrl("good-standing"),
        title: "Certificate of Good Standing",
        price: "$79 all-in + gst",
        blurb: "Official certificate for financing, corporate transactions, or foreign registrations. Pulled directly from the registry.",
        cta:   "Order certificate",
      },
      {
        href:  tokenUrl("revival"),
        title: "Corporate Revival",
        price: "Custom quote — 1 hour response",
        blurb: "If your corporation has been struck for missed filings, we bring it back to active status — back-year annual returns included in the quote.",
        cta:   "Start revival",
      },
      {
        href:  tokenUrl("dissolution"),
        title: "Voluntary Dissolution",
        price: "Custom quote — 1 hour response",
        blurb: "Cleanly close a corporation that's no longer operating. Stops future annual return fees and ends the CRA filing obligation.",
        cta:   "Start dissolution",
      },
    ];

    const innerHtml = `
    <tr>
      <td style="background-color:#0C3D61;padding:18px 32px;">
        <span style="font-size:18px;font-weight:bold;color:#FFFFFF;letter-spacing:0.5px;">CRS</span>
        <span style="font-size:12px;color:#CBE2EF;">&nbsp;|&nbsp; Corporate Registry Services</span>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:#1A2B3A;font-family:Georgia,serif;">
          What CRS can handle for ${esc(ctx.company.name)}
        </h1>
        <p style="margin:0 0 22px;font-size:14px;color:#5A6B7A;">
          Hi ${esc(firstName(ctx))},
        </p>

        <p style="margin:0 0 20px;font-size:14px;line-height:1.65;color:#1A2B3A;">
          ${esc(intro)}
        </p>

        <!-- Company we looked up -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F1F5F8;border-radius:6px;margin-bottom:24px;">
          <tr>
            <td style="padding:12px 16px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:bold;color:#0C3D61;text-transform:uppercase;letter-spacing:1px;">On file</p>
              <p style="margin:0 0 2px;font-size:14px;font-weight:bold;color:#1A2B3A;">${esc(ctx.company.name)}</p>
              <p style="margin:0;font-size:12px;color:#5A6B7A;">
                ${esc(ctx.company.registryId || "—")} &middot; ${esc(ctx.company.jurisdiction)} &middot; ${esc(ctx.company.entityType || "—")}
              </p>
            </td>
          </tr>
        </table>

        <!-- Services grid -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
          ${services.map(serviceTile).join("")}
        </table>

        <p style="margin:24px 0 0;font-size:12px;color:#8A99A8;text-align:center;line-height:1.6;">
          All services filed within 24 hours &middot; Every price is all-in with the government fee included &middot; Custom quotes returned within one business hour.
        </p>

        <p style="margin:14px 0 0;font-size:12px;color:#5A6B7A;text-align:center;">
          Not sure which service you need? Reply directly to this email &mdash; ${esc(PERSONA_NAME)} responds within one business hour.
        </p>
      </td>
    </tr>`;

    const textBody = `What CRS can handle for ${ctx.company.name}

Hi ${firstName(ctx)},

${intro}

On file:
  ${ctx.company.name}
  ${ctx.company.registryId || "—"} · ${ctx.company.jurisdiction} · ${ctx.company.entityType || "—"}
  Source: ${registryName}

Services:

* Annual Return Filing — $99 all-in + gst
    Mandatory every year, even if inactive. Miss it → registry dissolution.
    File: ${tokenUrl("annual-return")}

* Corporate Profile Report — $49 all-in + gst
    Official registry snapshot delivered within one business hour.
    Order: ${tokenUrl("profile-report")}

* Certificate of Good Standing — $79 all-in + gst
    For financing, transactions, or foreign registrations.
    Order: ${tokenUrl("good-standing")}

* Corporate Revival — Custom quote (1 hour response)
    Bring a struck corporation back to active status.
    Start: ${tokenUrl("revival")}

* Voluntary Dissolution — Custom quote (1 hour response)
    Cleanly close a corporation that's no longer operating.
    Start: ${tokenUrl("dissolution")}

All services filed within 24 hours. Every price is all-in with the
government fee included.

Not sure which service you need? Reply directly to this email — ${PERSONA_NAME}
responds within one business hour.`;

    return shell({ subject, innerHtml, textBody, ctx });
  },
};

/* ────────────────────────── Registry ────────────────────────── */

export const TEMPLATES: Record<OutreachService, TemplateDef> = {
  "annual-return":  annualReturnTemplate,
  "general":        generalTemplate,
  "profile-report": genericTemplate(
    "profile-report",
    "Corporate Profile Report",
    "Need an official Corporate Profile Report for your company? We pull it directly from the registry and deliver a PDF within one business hour — $49 all-in + GST.",
    "Order Profile Report",
  ),
  "good-standing":  genericTemplate(
    "good-standing",
    "Certificate of Good Standing",
    "Need a Certificate of Good Standing for financing, a bid, or a corporate transaction? We order it directly from the registry — $79 all-in + GST, delivered within one business hour.",
    "Order Certificate",
  ),
  "dissolution":    genericTemplate(
    "dissolution",
    "Voluntary Dissolution",
    "If your corporation is no longer operating, filing a voluntary dissolution is the clean way to close it out with the registry — avoiding future annual return fees and potential CRA issues. We handle the filing end-to-end.",
    "Start Dissolution",
  ),
  "revival":        genericTemplate(
    "revival",
    "Corporate Revival",
    "If your corporation has been struck from the registry for missed filings, a revival brings it back to active status. We handle the paperwork and can quote the total cost (including any back-year annual returns) within one business hour.",
    "Start Revival",
  ),
};

export function listTemplates(): TemplateDef[] {
  return Object.values(TEMPLATES);
}
