"use client";

import { useEffect, useRef } from "react";

/**
 * Cart-abandonment beacon. Drop into any order-form component. Debounces
 * updates and POSTs to /api/order/draft — the server upserts on
 * (sessionId, service) so multiple beacons from the same session for the
 * same service merge into one row.
 *
 * The beacon is deliberately anonymous of user-agent JS-side; the API
 * derives sessionId from the crs_session_id cookie (set by Analytics.tsx).
 * If the cookie isn't set yet the beacon short-circuits — we don't want a
 * flood of session-less rows.
 *
 * Only fires when there's something worth saving: a contact field typed
 * OR a company selected. Empty state doesn't beacon.
 */

type DraftContact = { name?: string; email?: string; phone?: string };
type DraftCompany = {
  name?: string; registryId?: string; businessNumber?: string;
  jurisdiction?: string; provinceKey?: string;
};

export function useOrderDraftBeacon(args: {
  service:  string;                 // "annual-return" | "profile-report" | ...
  path?:    string;                 // defaults to window.location.pathname
  contact?: DraftContact;
  company?: DraftCompany;
  /** Skip beacon while true — e.g. after the Stripe redirect fires so the
   *  cart-abandoned row isn't written for a session that actually paid. */
  disabled?: boolean;
}): void {
  const { service, contact, company, disabled } = args;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Serialise into a comparable string so React can bail out when nothing
     changed — avoids resetting the debounce on every render. */
  const stateSig = JSON.stringify({
    contact: contact ?? null,
    company: company ?? null,
  });

  useEffect(() => {
    if (disabled) return;
    if (!service) return;
    if (typeof window === "undefined") return;

    const anyContact = !!(contact?.name?.trim() || contact?.email?.trim() || contact?.phone?.trim());
    const anyCompany = !!(company?.name?.trim() || company?.registryId?.trim());
    if (!anyContact && !anyCompany) return;

    const sessionId = document.cookie.match(/(?:^|; )crs_session_id=([^;]+)/)?.[1];
    if (!sessionId) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const body = JSON.stringify({
        sessionId: decodeURIComponent(sessionId),
        service,
        path:      args.path ?? window.location.pathname,
        contact:   contact ?? undefined,
        company:   company ?? undefined,
      });
      try {
        /* Prefer sendBeacon so an unload / redirect doesn't kill the request.
         *  Falls back to fetch keepalive when the browser doesn't support it. */
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/order/draft", new Blob([body], { type: "application/json" }));
        } else {
          fetch("/api/order/draft", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
          }).catch(() => {});
        }
      } catch { /* beacons must never break the page */ }
    }, 700);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [stateSig, service, disabled]);
}
