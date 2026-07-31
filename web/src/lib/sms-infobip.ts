/**
 * Small Infobip Advanced SMS client. Server-only.
 *
 * Env:
 *   INFOBIP_API_KEY       — required. From Infobip → API Keys.
 *   INFOBIP_NUMBER        — the "From" sender ID / number (E.164, e.g. +13436849898).
 *   INFOBIP_BASE_URL      — optional. Defaults to https://api.infobip.com.
 *                           Personalised accounts use a subdomain like
 *                           https://xyz123.api.infobip.com — check your Infobip
 *                           dashboard if the default returns 401 / 404.
 *   SMS_ALERT_TO_NUMBER   — optional. Where CRS alerts (paid order, order-page
 *                           arrival) go. Defaults to +15878396909.
 *   SMS_ENABLED           — optional. Set to "0" or "false" to short-circuit
 *                           every send (useful during testing).
 *
 * Never throws — every call returns { ok, error? } so callers can fire-and-
 * forget without wrapping in try/catch. SMS delivery is never allowed to
 * block Stripe fulfillment or a page load.
 */

const DEFAULT_BASE  = "https://api.infobip.com";
const DEFAULT_TO    = "+15878396909";

export type SmsResult = { ok: true; messageId?: string } | { ok: false; error: string };

export async function sendAlertSms(text: string, opts?: { to?: string }): Promise<SmsResult> {
  if (process.env.SMS_ENABLED === "0" || process.env.SMS_ENABLED === "false") {
    return { ok: false, error: "SMS disabled via SMS_ENABLED env." };
  }
  const apiKey = process.env.INFOBIP_API_KEY?.trim();
  const from   = process.env.INFOBIP_NUMBER?.trim();
  const base   = (process.env.INFOBIP_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/+$/, "");
  const to     = (opts?.to ?? process.env.SMS_ALERT_TO_NUMBER ?? DEFAULT_TO).trim();

  if (!apiKey) return { ok: false, error: "INFOBIP_API_KEY not set." };
  if (!from)   return { ok: false, error: "INFOBIP_NUMBER not set." };
  if (!to)     return { ok: false, error: "SMS_ALERT_TO_NUMBER not set." };

  /* SMS bodies are billed per segment (160 GSM-7 chars or 70 UCS-2 for
   *  non-Latin). Alert bodies stay well under one segment; hard-cap at
   *  480 chars so a stray long value can't blow up the cost. */
  const body = text.length > 480 ? text.slice(0, 477) + "..." : text;

  try {
    const res = await fetch(`${base}/sms/2/text/advanced`, {
      method: "POST",
      headers: {
        "Authorization": `App ${apiKey}`,
        "Content-Type":  "application/json",
        "Accept":        "application/json",
      },
      body: JSON.stringify({
        messages: [{
          from,
          destinations: [{ to }],
          text: body,
        }],
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, error: `Infobip ${res.status}: ${errText.slice(0, 200)}` };
    }
    const json = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ messageId?: string; status?: { name?: string; description?: string } }>;
    };
    const first = json.messages?.[0];
    return { ok: true, messageId: first?.messageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return { ok: false, error: msg };
  }
}
