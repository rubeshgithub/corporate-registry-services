import { type Collection } from "mongodb";
import { db } from "./mongo";

/**
 * Soft top-of-funnel capture from the /canada-corporations-search results.
 * A visitor who found their corporation but isn't ready to order can drop
 * their email to "save this search" — they get one SES confirmation with
 * the re-run link and current pricing; ops sees the row in Mongo.
 *
 * Distinct from the outreach lead flows (incorporation_consultation_requests,
 * minutebook_pilot_requests, nfp_consultation_requests) — those are booked
 * consultations. This is passive interest capture, no follow-up promised.
 */
export type SearchLeadDoc = {
  email:       string;   // lowercased
  query:       string;   // what they typed
  province:    string;   // registry key ("ab", "all", ...) at time of submit
  resultCount: number;   // how many hits their query returned
  path:        string;   // page they were on
  sessionId?:  string;   // ties to analytics if the anon cookie is set
  ipHash?:     string;   // abuse gating
  userAgent?:  string;
  createdAt:   Date;
  ackedAt?:    Date;     // ops marked "reached out"
  ackedBy?:    string;
  /* Optional context — populated when we know what the visitor was doing:
     "save-search"    — bottom-of-results soft capture (legacy)
     "unlock-profile" — clicked "View full profile" on a search result and
                        gave email to unlock the /corporation/:id page. */
  intent?:      "save-search" | "unlock-profile";
  registryId?:  string;  // corp # if they identified a specific corp
  jurisdiction?: string; // human-readable ("Alberta", "Federal", …)
};

export async function searchLeads(): Promise<Collection<SearchLeadDoc>> {
  return (await db()).collection<SearchLeadDoc>("search_leads");
}

let indexesEnsured = false;
export async function ensureSearchLeadIndexes(): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    const col = await searchLeads();
    await col.createIndex({ createdAt: -1 });
    await col.createIndex({ email: 1, createdAt: -1 });
  } catch (e) {
    indexesEnsured = false;
    console.error("[search-leads] failed to ensure indexes:", e);
  }
}
