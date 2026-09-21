"use client";

import { useEffect } from "react";
import { newCrispQueue } from "@/lib/crisp";

/**
 * Loads the Crisp chat widget script exactly once. Uses the Crisp website
 * id from NEXT_PUBLIC_CRISP_WEBSITE_ID with an inline fallback so the
 * widget works in local dev without needing to set env vars every time.
 *
 * Rendered from the root layout so the chat bubble appears in the bottom
 * corner of every page.
 *
 * The window.$crisp type lives in lib/crisp.ts, alongside the helpers that
 * read it — see there for why a loaded Crisp is not an array.
 */

const FALLBACK_WEBSITE_ID = "9a2afa69-0c6e-4a97-a610-f45a24259125";
const WEBSITE_ID = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID ?? FALLBACK_WEBSITE_ID;

export default function CrispLoader() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    /* Guard against double-injection. Checks for $crisp existing at all, not
       for it being an array: once Crisp boots it swaps the array out for its
       instance object, so an isArray() guard would read "not loaded" and
       re-run — wiping the live instance and injecting a second script. */
    if (window.$crisp) return;
    if (!WEBSITE_ID) return;

    window.$crisp = newCrispQueue();
    window.CRISP_WEBSITE_ID = WEBSITE_ID;

    const s = document.createElement("script");
    s.src   = "https://client.crisp.chat/l.js";
    s.async = true;
    document.head.appendChild(s);

    // No cleanup — the widget should persist across route changes.
  }, []);

  return null;
}
