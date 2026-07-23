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

/**
 * Inbound minute-book pilot lead. Captured when a visitor searches their
 * corporation on the /minute-books hub page and clicks "Generate Free
 * Pilot", then enters their email. Owner (CRS) follows up manually
 * within 24 hours to grant MinuteBook subdomain access. Distinct from
 * paid orders (Stripe) — no charge, no auto-provisioning yet.
 */
export type MinuteBookPilotDoc = {
  email:          string;                   // lowercased
  companyName:    string;
  registryId:     string;                   // "" if unnumbered / name-only
  jurisdictionKey: string;                  // "ab" / "bc" / "on" / ... / "unknown"
  entityType:     string;
  status:         string;                   // registry status at time of request
  requesterName?: string;                   // optional — form doesn't require
  requesterPhone?: string;                  // optional
  ipHash?:        string;                   // for dedupe / abuse gating
  userAgent?:     string;
  path:           string;                   // where the pilot was requested from
  sessionId?:     string;                   // ties to analytics pageviews
  createdAt:      Date;
  ackedAt?:       Date;                     // owner marked "handed to MinuteBook" — Phase 2
  ackedBy?:       string;
  ackedNote?:     string;
};

/**
 * Inbound NFP consultation booking. Captured when a visitor completes the
 * multi-step form at /not-for-profit/book-free-consultation. Owner follows
 * up manually within one business day. No charge — this is a lead form,
 * not a paid order.
 *
 * The payload is intentionally denormalised: names, addresses, and roles
 * are stored as-typed so the specialist has the exact form data available
 * without stitching from other collections.
 */
export type NfpConsultationDoc = {
  contact: {
    fullName:      string;
    email:         string;
    phone:         string;
    contactMethod: string;
    timeWindow:    string;
  };
  /** True when the visitor ticked "I just want to talk first" — they
   *  haven't decided on names / board / activities yet. In that mode
   *  the organization, board, and activities fields are null. */
  explorationMode: boolean;
  organization: {
    jurisdictionKey:   string;
    jurisdictionLabel: string;
    name1:             string;
    name2:             string;
    name3:             string;
    office: {
      street: string; city: string; province: string; postal: string;
    };
    nature:      string;
    natureOther?: string;
    purpose:     string;
    serves:      string;
  } | null;
  board: Array<{
    fullName: string;
    role:     string;
    email:    string;
    phone?:   string;
    address:  { street: string; city: string; province: string; postal: string };
    ageOk:    boolean;
  }>;
  activities: {
    donations:     string;
    charity:       string;
    eventsPerYear: string;
    annualRevenue: string;
    grants:        string;
  } | null;
  notes?:      string;
  sourcePath:  string;
  ipHash?:     string;
  userAgent?:  string;
  createdAt:   Date;
  ackedAt?:    Date;
  ackedBy?:    string;
  ackedNote?:  string;
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

export async function minuteBookPilots(): Promise<Collection<MinuteBookPilotDoc>> {
  return (await db()).collection<MinuteBookPilotDoc>("minutebook_pilot_requests");
}

export async function nfpConsultations(): Promise<Collection<NfpConsultationDoc>> {
  return (await db()).collection<NfpConsultationDoc>("nfp_consultation_requests");
}

/**
 * Inbound for-profit incorporation consultation booking. Captured when a
 * visitor completes the multi-step form at /incorporation/book-free-consultation.
 * Owner follows up manually within one business day. No charge — this is a
 * lead form, not a paid order. Parallels NfpConsultationDoc but with
 * for-profit corporate-structure fields (share classes, named vs numbered,
 * director residency) instead of NFP board/activities.
 */
export type IncorporationConsultationDoc = {
  contact: {
    fullName:      string;
    email:         string;
    phone:         string;
    contactMethod: string;
    timeWindow:    string;
  };
  /** True when the visitor ticked "I just want to talk first" — they
   *  haven't decided on jurisdiction / name / directors / share structure
   *  yet. Corporation, directors, and shareStructure fields are null. */
  explorationMode: boolean;
  corporation: {
    jurisdictionKey:   string;
    jurisdictionLabel: string;
    nameType:          "named" | "numbered";
    name1?:            string;
    name2?:            string;
    name3?:            string;
    office: {
      street: string; city: string; province: string; postal: string;
    };
    nature:      string;
    natureOther?: string;
    activity:    string;
  } | null;
  directors: Array<{
    fullName:          string;
    email:             string;
    phone?:            string;
    address:           { street: string; city: string; province: string; postal: string };
    canadianResident:  boolean;
    ageOk:             boolean;
  }>;
  shareStructure: {
    structureType:  string;         // "simple" | "multiple" | "unsure"
    shareholders:   string;         // "1" | "2" | "3-5" | "6-10" | "10+"
    specialRights:  string;         // "yes" | "no" | "unsure"
  } | null;
  notes?:      string;
  sourcePath:  string;
  ipHash?:     string;
  userAgent?:  string;
  createdAt:   Date;
  ackedAt?:    Date;
  ackedBy?:    string;
  ackedNote?:  string;
};

export async function incorporationConsultations(): Promise<Collection<IncorporationConsultationDoc>> {
  return (await db()).collection<IncorporationConsultationDoc>("incorporation_consultation_requests");
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

    const mb = await minuteBookPilots();
    await mb.createIndex({ createdAt: -1 });
    await mb.createIndex({ email: 1, createdAt: -1 });
    await mb.createIndex({ registryId: 1 }, { sparse: true });

    const nfp = await nfpConsultations();
    await nfp.createIndex({ createdAt: -1 });
    await nfp.createIndex({ "contact.email": 1, createdAt: -1 });

    const inc = await incorporationConsultations();
    await inc.createIndex({ createdAt: -1 });
    await inc.createIndex({ "contact.email": 1, createdAt: -1 });
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
