import { type Collection } from "mongodb";
import { db } from "./mongo";

/**
 * Cart-abandonment capture. Every partial fill on an order form (any
 * character typed in name / email / phone, or a company selection made
 * without proceeding to Stripe) upserts a row here keyed on sessionId +
 * service. When the visitor actually pays, the Stripe webhook completes
 * the loop; a draft whose sessionId doesn't match a Stripe session in the
 * same window is a warm lead worth reaching out to.
 *
 * Kept intentionally shallow — we don't try to store the full form state
 * across every order type, just the outreach-critical fields (contact +
 * company + jurisdiction). Deeper state can be recovered from the pageview
 * + click log by sessionId if the operator wants it.
 */
export type OrderDraftDoc = {
  sessionId:    string;              // client-generated crs_session_id cookie
  service:      string;              // "annual-return" | "profile-report" | ...
  path:         string;              // "/order/annual-return"
  contact: {
    name?:      string;
    email?:     string;
    phone?:     string;
  };
  company?: {
    name?:            string;
    registryId?:      string;
    businessNumber?:  string;
    jurisdiction?:    string;
    provinceKey?:     string;
  };
  ipHash?:      string;
  userAgent?:   string;
  createdAt:    Date;
  updatedAt:    Date;
};

export async function orderDrafts(): Promise<Collection<OrderDraftDoc>> {
  return (await db()).collection<OrderDraftDoc>("order_drafts");
}

let indexesEnsured = false;
export async function ensureOrderDraftIndexes(): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    const col = await orderDrafts();
    await col.createIndex({ sessionId: 1, service: 1 }, { unique: true });
    await col.createIndex({ updatedAt: -1 });
    await col.createIndex({ "contact.email": 1 }, { sparse: true });
  } catch (e) {
    indexesEnsured = false;
    console.error("[order-drafts] failed to ensure indexes:", e);
  }
}
