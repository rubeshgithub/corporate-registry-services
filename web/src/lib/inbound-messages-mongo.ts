import { type Collection } from "mongodb";
import { db } from "./mongo";

/**
 * Unified inbound-message log — everything a visitor typed to us that
 * currently only lands in the operator inbox as an SES email.
 *
 * Sources today:
 *   - "contact"    → /api/contact (general enquiry form)
 *   - "wizard"     → /api/wizard-submit (custom-quote wizard)
 *
 * Consolidated so a single admin card can show all recent inbound messages
 * across surfaces, with dedup + search over time. Doesn't replace the SES
 * notification — the email still ships; this is the audit layer.
 */
export type InboundMessageDoc = {
  source:     "contact" | "wizard";
  name:       string;
  email:      string;      // lowercased
  phone?:     string;
  subject?:   string;
  message:    string;
  /** Free-form JSON of the original payload — captured verbatim so
   *  wizard structured data (jurisdiction, service, notes) remains
   *  recoverable without exploding the schema per source. */
  payload?:   Record<string, unknown>;
  ipHash?:    string;
  userAgent?: string;
  createdAt:  Date;
  ackedAt?:   Date;
  ackedBy?:   string;
};

export async function inboundMessages(): Promise<Collection<InboundMessageDoc>> {
  return (await db()).collection<InboundMessageDoc>("inbound_messages");
}

let indexesEnsured = false;
export async function ensureInboundMessageIndexes(): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    const col = await inboundMessages();
    await col.createIndex({ createdAt: -1 });
    await col.createIndex({ email: 1, createdAt: -1 });
    await col.createIndex({ source: 1, createdAt: -1 });
  } catch (e) {
    indexesEnsured = false;
    console.error("[inbound-messages] failed to ensure indexes:", e);
  }
}
