"use client";

import { useState } from "react";
import { Mail, CheckCircle2, Loader2 } from "lucide-react";
import { SNAPSHOT_CONSENT_TEXT } from "@/lib/snapshot";

/**
 * Optional "email me a free snapshot of this corporation" capture.
 *
 * Never a gate: the visitor can always view the free details (detailsHref)
 * without giving an email. The marketing opt-in is an UNTICKED checkbox —
 * express consent under CASL only counts when the visitor actively gives it.
 *
 *   variant="inline" — collapsed link on a search result card; expands in place
 *   variant="card"   — always-open box, for /corporation/[slug]
 *   variant="strip"  — always-open single row for the band at the foot of a
 *                      search result card; the opt-in appears once typing starts
 */
export default function SnapshotCapture({
  registryId,
  provinceKey,
  name,
  src,
  detailsHref,
  variant = "inline",
}: {
  registryId:   string;
  provinceKey:  string;
  name:         string;
  src:          string;
  detailsHref?: string;
  variant?:     "inline" | "card" | "strip";
}) {
  const [open, setOpen]       = useState(variant !== "inline");
  const [email, setEmail]     = useState("");
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone]       = useState(false);
  const [err, setErr]         = useState("");

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function send() {
    if (!valid || sending) return;
    setSending(true); setErr("");
    try {
      const sessionId = document.cookie.match(/(?:^|; )crs_session_id=([^;]+)/)?.[1] ?? "";
      const res = await fetch("/api/notify/snapshot", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(), registryId, provinceKey, name, consent, src,
          path: window.location.pathname, sessionId: decodeURIComponent(sessionId),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Couldn't send the snapshot — please try again.");
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't send the snapshot — please try again.");
    } finally {
      setSending(false);
    }
  }

  const detailsLink = detailsHref ? (
    <a href={detailsHref} style={{ fontSize: "0.74rem", color: "var(--text-muted)", textDecoration: "underline" }}>
      {variant === "inline" ? "or just view the details now" : "View the details"}
    </a>
  ) : null;

  if (done) {
    return (
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.78rem", color: "var(--text)", ...(variant === "card" ? cardStyle : {}) }}>
        <CheckCircle2 size={15} style={{ color: "var(--secondary)", flexShrink: 0 }} />
        <span>Snapshot on its way to <strong>{email.trim()}</strong> — check your inbox in a minute.</span>
        {detailsLink && <span style={{ marginLeft: "0.3rem" }}>{detailsLink}</span>}
      </div>
    );
  }

  if (!open) {
    return (
      <span style={{ display: "inline-flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={() => setOpen(true)} style={linkBtn}>
          <Mail size={12} /> Email me a free snapshot
        </button>
        {detailsLink}
      </span>
    );
  }

  if (variant === "strip") {
    return (
      <div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.6rem 1rem" }}>
          <div style={{ display: "flex", gap: "0.55rem", alignItems: "flex-start", flex: "1 1 14rem", minWidth: 0 }}>
            <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--card)", border: "1px solid var(--border)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Mail size={14} style={{ color: "var(--primary)" }} />
            </span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: "0.86rem", fontWeight: 700, color: "var(--text)" }}>Free snapshot by email</span>
              <span style={{ display: "block", fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                Status, registry number and filing dates, sent to your inbox to keep on file.
              </span>
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flex: "2 1 18rem" }}>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(); } }}
              placeholder="you@company.ca"
              aria-label="Email address for the free snapshot"
              style={{ flex: "1 1 auto", minWidth: 0, padding: "0.55rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.45rem", fontSize: "0.86rem", background: "var(--card)", color: "var(--text)" }}
            />
            <button
              type="button"
              onClick={() => { void send(); }}
              disabled={!valid || sending}
              style={{
                padding: "0.55rem 0.95rem", borderRadius: "0.45rem", fontWeight: 700, fontSize: "0.82rem",
                border: "1.5px solid var(--primary)", whiteSpace: "nowrap",
                background: valid ? "var(--primary)" : "transparent",
                color: valid ? "#FFFFFF" : "var(--primary)",
                cursor: valid && !sending ? "pointer" : "default",
                display: "inline-flex", alignItems: "center", gap: "0.35rem",
              }}
            >
              {sending && <Loader2 size={13} className="crs-spin" />} Email it to me
            </button>
          </div>
          {detailsHref && (
            <a href={detailsHref} style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", textDecoration: "underline", textUnderlineOffset: "3px", whiteSpace: "nowrap" }}>
              View free details
            </a>
          )}
        </div>
        {email.length > 0 && (
          <label style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start", marginTop: "0.55rem", paddingLeft: "2.4rem", fontSize: "0.72rem", color: "var(--text-muted)", cursor: "pointer", lineHeight: 1.45 }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: "0.15rem" }} />
            <span>{SNAPSHOT_CONSENT_TEXT}</span>
          </label>
        )}
        {err && <div style={{ color: "#B45309", fontSize: "0.76rem", marginTop: "0.45rem", paddingLeft: "2.4rem" }}>{err}</div>}
      </div>
    );
  }

  return (
    <div style={variant === "card" ? cardStyle : { width: "100%", marginTop: "0.2rem" }}>
      <div style={{ fontWeight: 700, fontSize: variant === "card" ? "0.95rem" : "0.8rem", color: "var(--text)", marginBottom: "0.2rem" }}>
        Get a free snapshot of this corporation by email
      </div>
      <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginBottom: "0.5rem", lineHeight: 1.5 }}>
        Status, registry number, incorporation date and next filing due date — handy to keep on file.
      </div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(); } }}
          placeholder="you@company.ca"
          aria-label="Your email"
          style={{ flex: "1 1 12rem", padding: "0.5rem 0.7rem", border: "1px solid var(--border)", borderRadius: "0.4rem", fontSize: "0.85rem", background: "var(--bg)", color: "var(--text)" }}
        />
        <button
          type="button"
          onClick={() => { void send(); }}
          disabled={!valid || sending}
          style={{
            padding: "0.5rem 0.9rem", border: "none", borderRadius: "0.4rem", fontWeight: 700, fontSize: "0.8rem",
            background: valid ? "var(--primary)" : "var(--border)", color: "#FFFFFF",
            cursor: valid && !sending ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", gap: "0.35rem",
          }}
        >
          {sending ? <Loader2 size={13} className="crs-spin" /> : <Mail size={13} />} Send me the snapshot
        </button>
      </div>
      <label style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start", marginTop: "0.5rem", fontSize: "0.7rem", color: "var(--text-muted)", cursor: "pointer", lineHeight: 1.45 }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: "0.15rem" }} />
        <span>{SNAPSHOT_CONSENT_TEXT}</span>
      </label>
      {err && <div style={{ color: "#B45309", fontSize: "0.74rem", marginTop: "0.4rem" }}>{err}</div>}
      {detailsLink && <div style={{ marginTop: "0.45rem" }}>{detailsLink}</div>}
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  background: "none", border: "none", padding: 0, cursor: "pointer",
  color: "var(--text)", fontSize: "0.74rem", fontWeight: 600, textDecoration: "underline",
  display: "inline-flex", alignItems: "center", gap: "0.3rem",
};

const cardStyle: React.CSSProperties = {
  padding: "1rem 1.1rem", border: "1px solid var(--border)", borderLeft: "3px solid var(--gold)",
  borderRadius: "var(--radius-card)", background: "var(--card)", marginBottom: "1.25rem",
};
