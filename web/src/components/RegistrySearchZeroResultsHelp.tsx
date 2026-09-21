"use client";

import { useState } from "react";
import { Phone, Mail, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { SITE_PHONE_DISPLAY, SITE_PHONE_HREF_CALL } from "@/lib/contact";

/**
 * The combined "can't find your corporation?" offer for a zero-result
 * registry search — two ways to reach a human, both of which work with no
 * third-party script: call or text the number, or leave an email. Rendered
 * in two places:
 *   - RegistrySearchZeroResultsModal, the auto-opening popup
 *   - inline in CompanySearch's "no results" card, so the offer is still
 *     visible after the popup is dismissed
 *
 * Deliberately one combined offer rather than two competing CTAs (a phone
 * prompt and a separate "request a manual search" button) — a visitor who
 * just got zero results shouldn't have to choose which help mechanism to
 * trust.
 *
 * ── Why there's no "chat with us" button here ────────────────────────────
 * There were two, in turn, and both were dead ends. First an sms: link,
 * which silently does nothing on desktop (no SMS handler). Then a button
 * that opened Crisp — but Crisp frequently doesn't load at all (the site
 * has no NEXT_PUBLIC_CRISP_WEBSITE_ID set, and the widget script is a
 * common ad-blocker target), so that was dead too. The number is shown as
 * readable text, not only as a link, so it works even where tel: doesn't:
 * the visitor can dial or text it themselves.
 *
 * Posts to /api/notify/search-help, which mails support@ AND acknowledges
 * the visitor. It deliberately does NOT use /api/notify/search-lead (what
 * CompanySearch's "save this search" form uses): that route only mails the
 * visitor and is documented as "no ops notification", which left the
 * 24-hour promise below unbacked when this first shipped.
 *
 * Self-contained (own email/sending state) rather than lifting
 * CompanySearch's leadEmail state, so the results>0 "save search" form is
 * untouched.
 */

export default function RegistrySearchZeroResultsHelp({
  query,
  province,
}: {
  query:    string;
  province: string;
}) {
  const [email, setEmail]   = useState("");
  const [state, setState]   = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

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

  return (
    <div>
      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0 0 1rem", lineHeight: 1.6 }}>
        If you believe this corporation exists, we can take a closer look.
      </p>

      {/* Call or text. The number is plain readable text inside the link so
          it's usable on desktop, where tel: often has no handler. */}
      <a
        href={SITE_PHONE_HREF_CALL}
        style={{
          display: "flex", alignItems: "center", gap: "0.65rem",
          padding: "0.8rem 1rem", borderRadius: "var(--radius-card)",
          background: "var(--primary)", color: "#FFFFFF",
          textDecoration: "none", marginBottom: "1rem",
        }}
      >
        <Phone size={18} style={{ flexShrink: 0 }} />
        <span>
          <span style={{ display: "block", fontSize: "0.72rem", opacity: 0.85, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Call or text
          </span>
          <span style={{ display: "block", fontSize: "1.05rem", fontWeight: 700, letterSpacing: "0.01em" }}>
            {SITE_PHONE_DISPLAY}
          </span>
        </span>
      </a>

      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.5rem" }}>
        Or email us
      </div>

      {state === "sent" ? (
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", color: "var(--secondary)", fontWeight: 500 }}>
          <CheckCircle2 size={15} /> Thanks — check your inbox. We&rsquo;ll get back to you within the next 24 hours.
        </div>
      ) : (
        <>
          <form onSubmit={submit} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); if (state === "error") setState("idle"); }}
              placeholder="you@company.ca"
              className="field-input"
              style={{ flex: "1 1 200px", minWidth: "160px", height: "2.4rem", fontSize: "0.86rem" }}
              required
            />
            <button
              type="submit"
              disabled={state === "sending"}
              className="btn-primary"
              style={{
                height: "2.4rem", fontSize: "0.82rem",
                display: "inline-flex", alignItems: "center", gap: "0.35rem",
                opacity: state === "sending" ? 0.7 : 1,
              }}
            >
              {state === "sending"
                ? <><Loader2 size={13} className="crs-spin" /> Sending…</>
                : <><Mail size={13} /> Send <ArrowRight size={12} /></>}
            </button>
          </form>
          {state === "error" && (
            <span style={{ display: "block", fontSize: "0.76rem", color: "var(--gold)", marginTop: "0.4rem" }}>{message}</span>
          )}
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.7rem 0 0", lineHeight: 1.5 }}>
            We&rsquo;ll get back to you within the next 24 hours.
          </p>
        </>
      )}
    </div>
  );
}
