import { MAILING } from "@/lib/outreach-templates";
import { newToken, signUnsubscribe } from "@/lib/outreach-token";
import { SITE_PHONE_DISPLAY } from "@/lib/contact";

/**
 * The branded layout for the website's automated customer emails, matching
 * docu10's (email-parts.ts): a white card on a grey page, "Thank you & Best
 * Regards", the CRS | Corporate Registry Services signature block with T / E /
 * W, the disclaimer, and — on anything that mentions services or prices — the
 * sender's mailing address and a working unsubscribe link (CASL).
 * Tables and inline styles only, no images: renders the same in Outlook and
 * on a phone, and nothing is blocked or tracked.
 */

export const SITE_URL      = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.corporateregistryservices.ca";
export const SUPPORT_EMAIL = "support@corporateregistryservices.ca";
/* The automated emails sign as the outreach persona, like docu10 signs Rubesh's mail. */
const SIGNER = process.env.OUTREACH_PERSONA_NAME ?? "Alex Morgan";
const PHONE  = SITE_PHONE_DISPLAY.replace(/[()]/g, "").replace(/\s+/, "-");

export const DISCLAIMER =
  "This email and any attachments are confidential and intended solely for the addressee. If you have received this email in error, please notify the sender and delete it immediately. Corporate Registry Services provides administrative and document preparation support and does not provide legal, tax, or accounting advice. Please consult a qualified professional for advice specific to your situation.";

export const C = { navy: "#0C3D61", gold: "#F9AC00", goldText: "#B97F00", page: "#F1F5F8", text: "#1A2B3A", muted: "#5A6B7A", faint: "#8A99A8", rule: "#E3E9EE", box: "#F4F7FA" };
export const FONT = "Arial,Helvetica,sans-serif";
export const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const p = (html: string, extra = "") =>
  `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${C.text};${extra}">${html}</p>`;

export const button = (href: string, label: string, primary = true) =>
  `<a href="${esc(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 18px;border-radius:6px;font-family:${FONT};font-size:14px;font-weight:bold;text-decoration:none;${primary
    ? `background:${C.navy};color:#ffffff;`
    : `background:#ffffff;color:${C.navy};border:1px solid ${C.navy};`}">${esc(label)} &rarr;</a>`;

/**
 * `kind` names the automated email the link sits in ("saved-search",
 * "snapshot"…). It rides in the `t` token, which the unsubscribe handler
 * stores as the suppression's sourceToken — so docu10 can say which email
 * people unsubscribe from. Outreach sends keep their own 12-character tokens.
 */
export function unsubscribeUrl(email: string, kind = "auto"): string {
  return `${SITE_URL}/o/unsubscribe?e=${encodeURIComponent(email)}&s=${signUnsubscribe(email)}&t=${encodeURIComponent(`${kind}-${newToken()}`)}`;
}

function signatureHtml(): string {
  const site = SITE_URL.replace(/^https?:\/\//, "");
  return `
    <p style="margin:6px 0 16px;font-family:${FONT};font-size:15px;color:${C.text};">Thank you &amp; Best Regards,</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding:0 18px 0 0;vertical-align:middle;">
        <p style="margin:0;font-family:${FONT};font-size:22px;font-weight:bold;color:${C.navy};">CRS</p>
        <p style="margin:6px 0 0;font-family:${FONT};font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:${C.goldText};">Corporate Registry<br>Services</p>
      </td>
      <td style="padding:2px 0 2px 16px;border-left:2px solid ${C.navy};vertical-align:middle;">
        <p style="margin:0 0 4px;font-family:${FONT};font-size:16px;font-weight:bold;color:${C.navy};">${esc(SIGNER)}</p>
        <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.text};">T: <a href="tel:+17789492055" style="color:${C.text};text-decoration:none;">${esc(PHONE)}</a></p>
        <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.text};">E: <a href="mailto:${SUPPORT_EMAIL}" style="color:${C.text};text-decoration:none;">${SUPPORT_EMAIL}</a></p>
        <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.text};">W: <a href="${SITE_URL}" style="color:${C.text};text-decoration:none;">${esc(site)}</a></p>
      </td>
    </tr></table>
    <p style="margin:16px 0 0;padding-top:10px;border-top:1px solid ${C.rule};font-family:${FONT};font-size:11px;line-height:1.5;font-style:italic;color:${C.faint};">${esc(DISCLAIMER)}</p>`;
}

export function signatureText(): string[] {
  return ["Thank you & Best Regards,", "", SIGNER, "CRS | Corporate Registry Services", `T: ${PHONE}`, `E: ${SUPPORT_EMAIL}`, `W: ${SITE_URL.replace(/^https?:\/\//, "")}`, "", DISCLAIMER];
}

/** The whole document. `bodyHtml` must already be escaped. `why` says why they got it. */
export function brandedEmail(args: { subject: string; preheader: string; eyebrow: string; title: string; bodyHtml: string; to: string; why: string; kind?: string }): string {
  const unsub = unsubscribeUrl(args.to, args.kind);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(args.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(args.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};padding:24px 0;"><tr><td align="center">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #DDE5EC;">
  <tr><td style="height:4px;background:${C.navy};"></td></tr>
  <tr><td style="padding:26px 28px 6px;">
    <p style="margin:0 0 4px;font-family:${FONT};font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:${C.muted};">${esc(args.eyebrow)}</p>
    ${args.title ? `<p style="margin:0 0 20px;font-family:${FONT};font-size:20px;font-weight:bold;line-height:1.3;color:${C.navy};">${esc(args.title)}</p>` : ""}
    ${args.bodyHtml}
  </td></tr>
  <tr><td style="padding:8px 28px 26px;">${signatureHtml()}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="max-width:600px;margin:14px auto 0;padding:0 16px;font-family:${FONT};font-size:11px;line-height:1.6;color:${C.faint};text-align:center;">
  Corporate Registry Services &middot; ${esc(MAILING)}<br>
  ${esc(args.why)} <a href="${unsub}" style="color:${C.faint};">Unsubscribe</a> from these emails.
</p>
</td></tr></table>
</body></html>`;
}

export function footerText(to: string, why: string, kind?: string): string[] {
  return [`Corporate Registry Services · ${MAILING}`, `${why} Unsubscribe: ${unsubscribeUrl(to, kind)}`];
}
