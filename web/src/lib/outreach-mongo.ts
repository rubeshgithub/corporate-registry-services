import { type Collection } from "mongodb";
import { db } from "./mongo";

/**
 * Outreach data model. Lives alongside analytics in the crs_analytics DB.
 *
 * Three collections:
 *   - outreach_tokens        — one per email sent, powers the /o/<token> deep-link
 *   - outreach_sends         — full CASL audit log (who/what/when/what was sent)
 *   - outreach_suppression   — unsubscribes + bounces + complaints, checked before every send
 *
 * The audit log and suppression list are the parts CASL compliance actually
 * depends on. Don't skip logging even if a send fails partway — we want the
 * record either way.
 */

export type OutreachService =
  | "annual-return"
  | "profile-report"
  | "dissolution"
  | "revival"
  | "good-standing"
  | "general";        // service-agnostic intro — has multi-CTA grid

export type OutreachCompany = {
  name:           string;
  registryId:     string;
  businessNumber: string;
  jurisdiction:   string;   // human label, e.g. "Alberta"
  provinceKey:    string;   // key, e.g. "ab"
  incorpDate?:    string;   // ISO or "" — used for deadline computation
  location?:      string;   // registered office one-liner
  entityType?:    string;
  status?:        string;
};

export type OutreachTokenDoc = {
  token:            string;                 // 12-char base62, unique
  service:          OutreachService;
  company:          OutreachCompany;
  recipientEmail:   string;
  recipientName?:   string;
  campaignId?:      string;                 // free-form, e.g. "gsc-ab-annual-2026-07"
  createdAt:        Date;
  sentAt:           Date;
  firstClickedAt?:  Date;
  clickCount:       number;
  /** Which services the recipient actually clicked on. Only populated by
   *  general-template emails where the CTA carries a ?s=<service> param;
   *  single-service templates don't need this. Stored as unique array. */
  clickedServices?: string[];
  /** Timestamp when the recipient clicked an "already handled this" anti-CTA
   *  (e.g. "I've already filed my annual return"). Signals the recipient is
   *  not a filing prospect on this service anymore — future outreach on the
   *  same service should be skipped. */
  ackFiled?:        Date;
  convertedAt?:     Date;
  convertedSessionId?: string;              // Stripe cs_… once/if the recipient pays
};

export type OutreachSendDoc = {
  tokenId:        string;                   // matches OutreachTokenDoc.token
  service:        OutreachService;
  companyName:    string;
  registryId:     string;
  campaignId?:    string;
  from:           string;
  to:             string[];
  cc:             string[];
  bcc:            string[];
  subject:        string;
  bodyHtml:       string;
  bodyText:       string;
  sesMessageId?:  string;
  sentBy:         string;                   // "admin" for v1 — placeholder for per-user later
  sentAt:         Date;
  bouncedAt?:     Date;
  complainedAt?:  Date;
};

export type OutreachSuppressionDoc = {
  email:      string;                       // lowercased
  reason:     "unsubscribed" | "bounced" | "complained" | "manual";
  addedAt:    Date;
  sourceToken?: string;                     // which send triggered the unsubscribe
  note?:      string;
};

export async function outreachTokens(): Promise<Collection<OutreachTokenDoc>> {
  return (await db()).collection<OutreachTokenDoc>("outreach_tokens");
}

export async function outreachSends(): Promise<Collection<OutreachSendDoc>> {
  return (await db()).collection<OutreachSendDoc>("outreach_sends");
}

export async function outreachSuppression(): Promise<Collection<OutreachSuppressionDoc>> {
  return (await db()).collection<OutreachSuppressionDoc>("outreach_suppression");
}

let indexesEnsured = false;
export async function ensureOutreachIndexes(): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    const t = await outreachTokens();
    await t.createIndex({ token: 1 }, { unique: true });
    await t.createIndex({ recipientEmail: 1, sentAt: -1 });
    await t.createIndex({ "company.registryId": 1, sentAt: -1 });
    await t.createIndex({ sentAt: -1 });

    const s = await outreachSends();
    await s.createIndex({ sentAt: -1 });
    await s.createIndex({ tokenId: 1 });

    const sup = await outreachSuppression();
    await sup.createIndex({ email: 1 }, { unique: true });
    await sup.createIndex({ addedAt: -1 });
  } catch (e) {
    indexesEnsured = false;
    console.error("[outreach] failed to ensure indexes:", e);
  }
}

/** True if the email is on the suppression list — always check before sending. */
export async function isSuppressed(email: string): Promise<boolean> {
  const sup = await outreachSuppression();
  const hit = await sup.findOne({ email: email.trim().toLowerCase() });
  return !!hit;
}

/** Mark a token as converted (paid) — called from the Stripe webhook. Safe to
 *  no-op on unknown tokens. Only updates if not already marked (idempotent
 *  across webhook retries). */
export async function markTokenConverted(token: string, sessionId: string): Promise<void> {
  if (!token || !/^[A-Za-z0-9]{8,32}$/.test(token)) return;
  try {
    await (await outreachTokens()).updateOne(
      { token, convertedAt: { $exists: false } },
      { $set: { convertedAt: new Date(), convertedSessionId: sessionId } },
    );
  } catch (e) {
    console.error("[outreach] failed to mark token converted:", e);
  }
}
