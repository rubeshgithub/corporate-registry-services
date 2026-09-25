"use client";

import { useState } from "react";
import { Phone, Mail, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { SITE_PHONE_DISPLAY, SITE_PHONE_HREF_CALL } from "@/lib/contact";

/**
 * The "can't find your corporation?" offer for a zero-result registry
 * search. One implementation, rendered in two places:
 *   - RegistrySearchZeroResultsModal, the auto-opening popup on the
 *     standalone search page
 *   - inline under the search box in InlineLookupOrder (articles and the
 *     per-jurisdiction service pages) and in CompanySearch's no-results card
 *
 * ── Email first, phone second ────────────────────────────────────────────
 * A zero result here usually means our data can't answer, not that the
 * corporation doesn't exist: Newfoundland, Yukon, New Brunswick and the
 * territories aren't in the federal registry data at all, and their own
 * registries can't be queried by machine (terms of use, Cloudflare
 * challenges). What we can do is look the corporation up by hand and send
 * back what we find — and the output of that is information, which is
 * better delivered in writing than in a call. So the email form is the
 * primary action and the phone number is a quiet secondary line.
 *
 * No chat button, deliberately. Two earlier versions had one (an sms: link,
 * then a Crisp opener) and both were dead ends for a large share of
 * visitors. The number is shown as readable text inside the tel: link so it
 * works even where tel: has no handler.
 *
 * Posts to /api/notify/search-help, which mails support@ with the searched
 * name and jurisdiction AND sends the visitor a fixed acknowledgement — not
 * /api/notify/search-lead, which by design never notifies anyone and would
 * leave the promise below unbacked.
 */

/* Display-only. Names the registry a person will actually check, so the
   promise is concrete on the jurisdictions where this card does the real
   work. Anything not listed gets the generic wording. */
const MANUAL_REGISTRY: Record<string, string> = {
  nl: "Newfoundland and Labrador Registry of Companies",
  yt: "Yukon Corporate Online Registry",
  nb: "New Brunswick Corporate Registry",
  nt: "Northwest Territories Corporate Registry",
  nu: "Nunavut Corporate Registry",
  pe: "PEI Corporate Registry",
};

export default function RegistrySearchZeroResultsHelp({
  query,
  province,
}: {
  query:    string;
  province: string;
}) {
  const [email, setEmail]     = useState("");
  const [state, setState]     = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const registry = MANUAL_REGISTRY[province] ?? "registry";
  const registryPhrase = MANUAL_REGISTRY[province] ? `the ${registry}` : "the registry";
  /* No searchable index (PEI, NL, Yukon, NB, NWT, Nunavut): the offer is a
     free snapshot, looked up by hand, within a few business hours. */
  const manual = !!MANUAL_REGISTRY[province];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setState("error");
      setMessage("Enter a valid email.");
      return;
    }
    setState("sending");
    setMessage("");
    try {
      const sessionId = document.cookie.match(/(?:^|; )crs_session_id=([^;]+)/)?.[1] ?? "";
      const res = await fetch("/api/notify/search-help", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          query,
          province,
          path:      typeof window !== "undefined" ? window.location.pathname : "",
          sessionId: sessionId ? decodeURIComponent(sessionId) : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMessage(data.error || "Could not send — try again.");
        return;
      }
      setState("sent");
    } catch {
      setState("error");
      setMessage("Network error — try again.");
    }
  }

  if (state === "sent") {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontSize: "0.88rem", color: "var(--secondary)", fontWeight: 500, lineHeight: 1.55 }}>
          <CheckCircle2 size={17} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
          <span>
            {manual ? (
              <>Thanks — we&rsquo;ll look up &ldquo;{query}&rdquo; in {registryPhrase} by hand and email you a
              free snapshot within a few business hours.</>
            ) : (
              <>Thanks — a confirmation is on its way to your inbox. We&rsquo;ll search {registryPhrase} for
              &ldquo;{query}&rdquo; by hand and email you what we find within 24 hours.</>
            )}
          </span>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.7rem 0 0", lineHeight: 1.5 }}>
          Need it sooner? Call or text{" "}
          <a href={SITE_PHONE_HREF_CALL} style={{ color: "var(--text)", fontWeight: 600, textDecoration: "none" }}>{SITE_PHONE_DISPLAY}</a>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p style={{ fontSize: "0.88rem", color: "var(--text)", margin: "0 0 0.85rem", lineHeight: 1.6 }}>
        {manual ? (
          <>The {registry} doesn&rsquo;t offer a database we can search instantly. Enter your email and
          we&rsquo;ll look up &ldquo;{query}&rdquo; by hand and send you a <strong>free snapshot</strong> of the
          corporation within a few business hours.</>
        ) : (
          <>If you believe this corporation exists, leave your email and we&rsquo;ll look it up in {registryPhrase} by
          hand — and send you what we find within 24 hours.</>
        )}
      </p>

      <form onSubmit={submit} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
          placeholder="you@company.ca"
          className="field-input"
          style={{ flex: "1 1 220px", minWidth: "180px", height: "2.6rem", fontSize: "0.9rem" }}
          required
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="btn-primary"
          style={{
            height: "2.6rem", fontSize: "0.86rem", padding: "0 1rem",
            display: "inline-flex", alignItems: "center", gap: "0.4rem",
            opacity: state === "sending" ? 0.7 : 1,
          }}
        >
          {state === "sending"
            ? <><Loader2 size={14} className="crs-spin" /> Sending…</>
            : <><Mail size={14} /> {manual ? "Email me the free snapshot" : "Email me what you find"} <ArrowRight size={13} /></>}
        </button>
      </form>
      {state === "error" && (
        <span style={{ display: "block", fontSize: "0.76rem", color: "var(--gold)", marginTop: "0.4rem" }}>{message}</span>
      )}

      {/* Secondary on purpose: one quiet line, number readable as text. */}
      <p style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.85rem 0 0", lineHeight: 1.5 }}>
        <Phone size={12} style={{ flexShrink: 0 }} />
        <span>
          Prefer to talk? Call or text{" "}
          <a href={SITE_PHONE_HREF_CALL} style={{ color: "var(--text)", fontWeight: 600, textDecoration: "none" }}>{SITE_PHONE_DISPLAY}</a>.
        </span>
      </p>
    </div>
  );
}
