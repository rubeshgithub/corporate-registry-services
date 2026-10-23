import { outreachSuppression, outreachTokens, ensureOutreachIndexes } from "@/lib/outreach-mongo";
import { companies } from "@/lib/registrar-mongo";
import { sendOutreach } from "@/lib/outreach-ses";

/**
 * Unsubscribing (owner, Oct 2026: "unsubscribe people as soon as they open the page" — people who opened the
 * confirmation page and left believed they had unsubscribed, which under CASL is the side to err on).
 *
 * /o/unsubscribe now unsubscribes a REAL PERSON on opening and offers an undo. A link scanner (corporate mail
 * security that opens every link on delivery) still gets the old confirm button and changes nothing — that is
 * why the page was two-click to begin with. `isLinkScanner` is the same test the tracker uses for its visitor
 * texts, plus "opened within two minutes of the send" (scanners open on delivery; people do not).
 */

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|puppeteer|playwright|selenium|python|curl|wget|scan|safelinks|proofpoint|mimecast|barracuda|gptbot|chatgpt|openai|perplexity|claude|anthropic|bytespider|ccbot|applebot|amazonbot|meta-externalagent|cohere|go-http-client|okhttp|java\//i;

export async function isLinkScanner(userAgent: string, token: string): Promise<boolean> {
  const ua = userAgent.trim();
  if (!ua) return true;
  if (BOT.test(ua)) return true;
  /* Scanners that run a browser report versions no customer runs in 2026. */
  const chromeMajor = Number(/(?:Chrome|CriOS)\/(\d+)/.exec(ua)?.[1] ?? "999");
  if (/Firefox\/109\.0/.test(ua) || /Edge\/1[2-8]\./.test(ua) || chromeMajor < 135) return true;
  /* Opened within two minutes of an outreach send: the scanner on delivery, not a person. */
  if (/^[A-Za-z0-9]{12}$/.test(token)) {
    try {
      const t = await (await outreachTokens()).findOne({ token }, { projection: { sentAt: 1, createdAt: 1 } });
      const sent = t?.sentAt ?? t?.createdAt;
      if (sent && Date.now() - new Date(sent).getTime() < 2 * 60_000) return true;
    } catch { /* unknown → judge by the browser alone */ }
  }
  return false;
}

/** Add the address to the suppression list (source of truth for every send), once. True when this call added it. */
export async function suppressEmail(email: string, token: string, note: string): Promise<boolean> {
  await ensureOutreachIndexes();
  const r = await (await outreachSuppression()).updateOne(
    { email },
    { $setOnInsert: { email, reason: "unsubscribed", addedAt: new Date(), sourceToken: token || undefined, note } },
    { upsert: true },
  );
  const added = r.upsertedCount > 0;
  if (added) await Promise.allSettled([denormalize(email, true), sendConfirmationEmail(email)]);
  return added;
}

/** Undo: only an "unsubscribed" row (never a bounce, complaint or a manual block). */
export async function resubscribeEmail(email: string): Promise<boolean> {
  const r = await (await outreachSuppression()).deleteOne({ email, reason: "unsubscribed" });
  if (r.deletedCount) await denormalize(email, false).catch(() => {});
  return r.deletedCount > 0;
}

/** Mirror onto crs.companies so /admin/outreach can badge without a join (one address can sit on many corporations). */
async function denormalize(email: string, suppressed: boolean) {
  try {
    const c = await companies();
    await c.createIndex({ "contact.email": 1 }, { sparse: true, name: "contact_email_sparse" });
    await c.updateMany(
      { "contact.email": email },
      suppressed
        ? { $set: { "contact.suppressed": true, "contact.suppressedAt": new Date() } }
        : { $unset: { "contact.suppressed": "", "contact.suppressedAt": "" } },
    );
  } catch (e) {
    console.error("[unsubscribe] companies mirror failed:", e);
  }
}

/** Best-effort confirmation — also how someone a scanner slipped past would find out, and reply. */
async function sendConfirmationEmail(email: string) {
  const subject = "You've been unsubscribed — Corporate Registry Services";
  const text = [
    `Hi,`, ``,
    `This confirms that ${email} has been unsubscribed from Corporate Registry Services outreach emails.`, ``,
    `You will not receive any further filing-reminder or outreach emails from us.`, ``,
    `If this was a mistake, or you need to reach us about an existing order, reply to this email or write to support@corporateregistryservices.ca.`, ``,
    `— Corporate Registry Services`,
  ].join("\n");
  const safe = email.replace(/[<>&"]/g, "");
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1D2A35;">
    <p>Hi,</p>
    <p>This confirms that <strong>${safe}</strong> has been unsubscribed from Corporate Registry Services outreach emails.</p>
    <p>You will not receive any further filing-reminder or outreach emails from us.</p>
    <p>If this was a mistake, or you need to reach us about an existing order, reply to this email or write to <a href="mailto:support@corporateregistryservices.ca">support@corporateregistryservices.ca</a>.</p>
    <p style="color:#8A99A8;">— Corporate Registry Services</p>
  </body></html>`;
  try {
    const res = await sendOutreach({ to: [email], cc: [], bcc: [], subject, html, text });
    if (!res.ok) console.warn("[unsubscribe] confirmation email failed:", res.error);
  } catch (e) {
    console.warn("[unsubscribe] confirmation email threw:", e);
  }
}
