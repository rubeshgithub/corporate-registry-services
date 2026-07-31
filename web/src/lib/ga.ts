/**
 * Minimal client-side helper for sending GA4 events through the gtag
 * snippet loaded in app/layout.tsx. Safe to call anywhere — no-ops on
 * the server and when GA hasn't loaded (ad blockers, GA disabled).
 */

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: GtagFn;
  }
}

export function gaEvent(name: string, params: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}

/**
 * Fire a GA4 `purchase` at most once per Stripe Checkout session, using
 * sessionStorage to survive refreshes of the thanks page. GA also
 * deduplicates by transaction_id, so this is belt and braces.
 */
export function gaPurchaseOnce(input: {
  sessionId: string;
  value: number;
  currency: string;
  service: string;
}): void {
  if (typeof window === "undefined") return;
  const key = `ga_purchase_${input.sessionId}`;
  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
  } catch {
    // sessionStorage unavailable (private mode) — still send; GA dedupes by transaction_id
  }
  gaEvent("purchase", {
    transaction_id: input.sessionId,
    value: input.value,
    currency: input.currency || "CAD",
    items: [
      {
        item_id: input.service || "order",
        item_name: input.service || "order",
        price: input.value,
        quantity: 1,
      },
    ],
  });
}
