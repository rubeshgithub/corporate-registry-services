/**
 * Corporate documents pricing, shared by the order flow (to show the total)
 * and the checkout API (to charge it) so the two can never disagree.
 *
 *   - Individual documents: one price each, government fee included.
 *   - Full set on file (incorporation to date): its own bundle price.
 *   - If the individual picks would cost as much as the full set, the
 *     customer gets the full set at the full-set price instead.
 */

export const SINGLE_DOC_KEYS = ["original", "articles", "proof-filings"] as const;

export type DocsQuote = {
  mode:       "per-document" | "full-set";
  count:      number;   // individual documents picked (0 when full set chosen outright)
  unitCents:  number;   // per-line charge
  quantity:   number;   // Stripe line quantity
  totalCents: number;
};

export function quoteDocuments(selected: string[], perDocCents: number, fullSetCents: number): DocsQuote {
  const count = selected.filter((k) => (SINGLE_DOC_KEYS as readonly string[]).includes(k)).length;
  const wantsFull = selected.includes("full-set") || count === 0;
  if (wantsFull || count * perDocCents >= fullSetCents) {
    return { mode: "full-set", count, unitCents: fullSetCents, quantity: 1, totalCents: fullSetCents };
  }
  return { mode: "per-document", count, unitCents: perDocCents, quantity: count, totalCents: count * perDocCents };
}
