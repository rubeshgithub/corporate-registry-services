"use client";

import { useEffect } from "react";

/**
 * Auto-opens Crisp chat, maximized, the moment a visitor reaches the
 * payment/confirm step of an order flow — so a human is visibly reachable
 * right when card details are the next thing being asked for.
 *
 * Mounted directly above the pay button in every order flow's confirm step
 * (there is no shared /order layout, so this can't be wired once centrally).
 * Renders nothing itself; the Crisp widget opening is the visible signal.
 *
 * Fires once per browser session (sessionStorage), not on every step
 * re-render or every order-page revisit, so it stays a nudge, not a nag.
 */

const SESSION_KEY = "crs_chat_opened_at_payment";

declare global {
  interface Window {
    $crisp?: Array<unknown[]>;
  }
}

export default function PaymentStepChatNudge() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
    } catch {
      // sessionStorage blocked (private browsing, etc.) — fall through and
      // fire anyway; worst case it opens more than once per browser session.
    }

    const tryOpen = () => {
      if (Array.isArray(window.$crisp)) {
        window.$crisp.push(["do", "chat:open"]);
        try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* ignore */ }
        return true;
      }
      return false;
    };

    if (tryOpen()) return;

    // CrispLoader injects the widget script async from the root layout; if
    // it hasn't attached to window yet when this step renders, retry briefly.
    const interval = setInterval(() => {
      if (tryOpen()) clearInterval(interval);
    }, 400);
    const timeout = setTimeout(() => clearInterval(interval), 8000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  return null;
}
