"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Fire-and-forget client analytics. Sits in the root layout so every page
 * gets a pageview event, and every click on a first-party CTA (link into
 * /order/* or the wizard's #incorporate anchor) fires a click event.
 *
 * Uses navigator.sendBeacon when available — it's queued by the browser and
 * survives page unload, so no lost tail-end events.
 *
 * Sessions: a random UUID stored in the crs_session_id cookie for 30 days.
 * Not tied to any identity — just lets us group a single browsing session
 * across pageviews and clicks so funnels stop double-counting.
 */

const SESSION_COOKIE = "crs_session_id";
const SESSION_TTL_DAYS = 30;

function getOrCreateSessionId(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]+)`));
  if (m) return decodeURIComponent(m[1]);
  const id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(id)}; Max-Age=${SESSION_TTL_DAYS * 24 * 3600}; Path=/; SameSite=Lax${secure}`;
  return id;
}

function send(payload: Record<string, unknown>) {
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    }
  } catch {
    // Analytics failures never break the page.
  }
}

/** Anchors we want to log click-throughs on. Kept explicit so we don't spam
 *  the click table with random header/nav clicks. */
function isTrackedTarget(href: string): boolean {
  if (!href) return false;
  if (href.startsWith("/order/")) return true;
  if (href.includes("#incorporate")) return true;
  if (href.startsWith("https://minutebook.corporateregistryservices.ca")) return true;
  return false;
}

export default function Analytics() {
  const pathname = usePathname();
  const search   = useSearchParams();

  /* Fire pageview on route change. Path is deliberately query-stripped
     so /?fbclid=... rolls up with / instead of fragmenting the metric.
     Attribution (utm_*, fbclid, gclid, msclkid) is captured as
     dedicated fields so the "came from Facebook/Google/Bing" signal
     survives without polluting the path dimension. */
  useEffect(() => {
    if (!pathname) return;
    if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return;
    const sessionId = getOrCreateSessionId();
    if (!sessionId) return;
    send({
      type:         "pageview",
      path:         pathname,
      referrer:     typeof document !== "undefined" ? document.referrer : "",
      sessionId,
      userAgent:    typeof navigator !== "undefined" ? navigator.userAgent : "",
      utmSource:    search.get("utm_source")   ?? undefined,
      utmMedium:    search.get("utm_medium")   ?? undefined,
      utmCampaign:  search.get("utm_campaign") ?? undefined,
      fbclid:       search.get("fbclid")       ?? undefined,
      gclid:        search.get("gclid")        ?? undefined,
      msclkid:      search.get("msclkid")      ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search.toString()]);

  /* Global click listener for tracked CTAs. Only mounts once. */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href") ?? "";
      if (!isTrackedTarget(href)) return;
      const sessionId = getOrCreateSessionId();
      if (!sessionId) return;
      send({
        type:      "click",
        path:      window.location.pathname,
        target:    href,
        label:     (anchor.innerText || anchor.getAttribute("aria-label") || "").trim().slice(0, 120),
        sessionId,
      });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
