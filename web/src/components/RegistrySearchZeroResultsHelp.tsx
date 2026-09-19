"use client";

import { useState } from "react";
import { Phone, MessageSquare, Mail, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { SITE_PHONE_DISPLAY, SITE_PHONE_HREF_CALL, SITE_PHONE_HREF_SMS } from "@/lib/contact";

/**
 * The combined "can't find your corporation?" offer for a zero-result
 * registry search — call/text, or leave an email and we follow up within
 * 24 hours. One implementation, rendered in two places:
 *   - RegistrySearchZeroResultsModal, the auto-opening popup
 *   - inline in CompanySearch's "no results" card, so the offer is still
 *     visible after the popup is dismissed
 *
 * Deliberately one combined offer rather than two competing CTAs (a phone
 * prompt and a separate "request a manual search" button) — a visitor who
 * just got zero results shouldn't have to choose which help mechanism to
 * trust.
 *
 * Posts to the same /api/notify/search-lead endpoint CompanySearch's
 * "save this search" form uses — it already stores resultCount, and 0 is a
 * valid value, so no backend change was needed. Self-contained (own
 * email/sending state) rather than lifting CompanySearch's leadEmail state,
 * so the existing results>0 "save search" form is untouched.
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
      const res = await fetch("/api/notify/search-lead", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          query,
          province,
          resultCount: 0,
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
        If you believe this corporation exists, we can take a closer look. Call or text us, or leave your
        email below — either way, we&rsquo;ll get back to you within 24 hours.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <a
          href={SITE_PHONE_HREF_CALL}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.4rem",
            padding: "0.55rem 0.9rem", borderRadius: "0.5rem",
            background: "var(--primary)", color: "#FFFFFF",
            fontSize: "0.85rem", fontWeight: 600, textDecoration: "none",
          }}
        >
          <Phone size={14} /> Call {SITE_PHONE_DISPLAY}
        </a>
        <a
          href={SITE_PHONE_HREF_SMS}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.4rem",
            padding: "0.55rem 0.9rem", borderRadius: "0.5rem",
            background: "transparent", color: "var(--text)",
            border: "1px solid var(--border)",
            fontSize: "0.85rem", fontWeight: 600, textDecoration: "none",
          }}
        >
          <MessageSquare size={14} /> Text us
        </a>
      </div>

      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.5rem" }}>
        Or send a message
      </div>

      {state === "sent" ? (
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", color: "var(--secondary)", fontWeight: 500 }}>
          <CheckCircle2 size={15} /> Thanks — we&rsquo;ll be in touch within 24 hours.
        </div>
      ) : (
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
      )}
      {state === "error" && (
        <span style={{ display: "block", fontSize: "0.76rem", color: "var(--gold)", marginTop: "0.4rem" }}>{message}</span>
      )}
    </div>
  );
}
