"use client";

import { useEffect } from "react";

/**
 * Loads the Tawk.to widget script exactly once per page-load, only when
 * NEXT_PUBLIC_TAWK_TO_PROPERTY_ID is set. Kept as a separate component so
 * we can drop it into the root layout without a bunch of conditionals
 * in server component code.
 *
 * How to activate (no code change):
 *   1. Sign up at tawk.to (free)
 *   2. Dashboard → Administration → Property → Chat Widget → copy your
 *      Property ID (Direct Chat Link) — the "xxxxxxxxxxxx/yyyyyyyyy" bit.
 *   3. Render env: NEXT_PUBLIC_TAWK_TO_PROPERTY_ID=xxxxxxxxxxxx/yyyyyyyyy
 *   4. Redeploy. Widget appears in the bottom-right corner sitewide.
 *
 * The property id contains BOTH the account id and the widget id
 * separated by a slash — do not URL-encode it.
 */

export default function TawkLoader() {
  useEffect(() => {
    const propertyId = process.env.NEXT_PUBLIC_TAWK_TO_PROPERTY_ID;
    if (!propertyId) return;
    if (typeof window === "undefined") return;
    // Bail out if the script has already loaded (SPA route changes shouldn't
    // reinject).
    if ((window as unknown as { Tawk_API?: unknown }).Tawk_API) return;

    const s = document.createElement("script");
    s.src   = `https://embed.tawk.to/${propertyId}`;
    s.async = true;
    s.setAttribute("crossorigin", "*");
    document.head.appendChild(s);

    // No cleanup — we want the widget to persist across route changes.
  }, []);

  return null;
}
