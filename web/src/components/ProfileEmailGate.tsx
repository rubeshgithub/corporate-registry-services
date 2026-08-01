"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle2, Loader2, MapPin, Activity, Clock, Users } from "lucide-react";

/**
 * Email gate modal shown when a visitor clicks "View full profile" on a
 * search result. Delivers the classic value-first-then-commit pattern:
 * we've shown them the tease (basic search result), now we ask for email
 * to unlock the full profile (address, live status, timeline, public info).
 *
 * Once submitted, we POST to /api/notify/search-lead (existing) with the
 * captured company + email, then forward the visitor to the profile URL.
 *
 * Uses sessionStorage to avoid re-prompting within the same session — if a
 * visitor has already unlocked one company profile, they don't hit the wall
 * again on other clicks in the same visit.
 */

const UNLOCK_KEY = "crs.profileUnlocked";

export type GateCompany = {
  name:         string;
  registryId:   string;
  provinceKey:  string;
  jurisdiction: string;
};

export function isProfileUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  try { return sessionStorage.getItem(UNLOCK_KEY) === "1"; } catch { return false; }
}

export function markProfileUnlocked() {
  try { sessionStorage.setItem(UNLOCK_KEY, "1"); } catch { /* ignore */ }
}

export default function ProfileEmailGate({
  company,
  profileHref,
  onClose,
}: {
  company:     GateCompany;
  profileHref: string;
  onClose:     () => void;
}) {
  const [email,   setEmail]   = useState("");
  const [sending, setSending] = useState(false);
  const [err,     setErr]     = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const canSubmit = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || sending) return;
    setSending(true);
    setErr("");
    try {
      await fetch("/api/notify/search-lead", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:        email.trim().toLowerCase(),
          query:        company.name,
          province:     company.provinceKey,
          resultCount:  1,
          intent:       "unlock-profile",
          registryId:   company.registryId,
          jurisdiction: company.jurisdiction,
        }),
      });
    } catch {
      /* Non-blocking — if the beacon fails, still let them through.
       *  The point is to not gate on a network hiccup. */
    } finally {
      markProfileUnlocked();
      window.open(profileHref, "_blank", "noreferrer");
      onClose();
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "var(--card)",
          borderRadius: "0.75rem",
          maxWidth: 480, width: "100%",
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: 12, right: 12,
            background: "transparent", border: "none",
            cursor: "pointer", color: "var(--text-muted)",
            padding: "0.35rem",
          }}
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ padding: "1.75rem 1.75rem 1rem" }}>
          <div style={{
            fontFamily: "var(--font-mono), monospace",
            fontSize: "0.7rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--gold)",
            fontWeight: 700,
            marginBottom: "0.5rem",
          }}>
            Free · No credit card
          </div>
          <h2 style={{
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: "1.4rem", fontWeight: 700,
            color: "var(--text)",
            margin: "0 0 0.4rem",
            lineHeight: 1.25,
          }}>
            Unlock the full profile for {company.name}
          </h2>
          <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
            Enter your email to view the full company profile.
          </p>
        </div>

        {/* Value bullets */}
        <div style={{ padding: "0 1.75rem 1.25rem" }}>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.55rem" }}>
            <ValueRow icon={<MapPin size={14} />}   text="Registered office address" />
            <ValueRow icon={<Activity size={14} />} text="Live status from the government registry" />
            <ValueRow icon={<Clock size={14} />}    text="Filing timeline — anniversaries, changes, history" />
            <ValueRow icon={<Users size={14} />}    text="Public information · directors / representatives (where available)" />
          </ul>
        </div>

        {/* Form */}
        <form onSubmit={submit} style={{ padding: "0 1.75rem 1.5rem" }}>
          <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.35rem" }}>
            Your email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoFocus
            style={{
              width: "100%",
              padding: "0.75rem 0.9rem",
              border: "1px solid var(--border)",
              borderRadius: "0.4rem",
              fontSize: "0.95rem",
              background: "var(--bg)",
              color: "var(--text)",
              fontFamily: "inherit",
            }}
          />

          {err && (
            <p style={{ fontSize: "0.82rem", color: "#B91C1C", margin: "0.5rem 0 0" }}>{err}</p>
          )}

          <button
            type="submit"
            disabled={!canSubmit || sending}
            style={{
              marginTop: "0.9rem",
              width: "100%",
              padding: "0.85rem",
              borderRadius: "0.5rem",
              background: canSubmit ? "var(--primary)" : "var(--border)",
              color: canSubmit ? "#FFFFFF" : "var(--text-muted)",
              fontSize: "0.95rem",
              fontWeight: 700,
              border: "none",
              cursor: canSubmit && !sending ? "pointer" : "not-allowed",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
            }}
          >
            {sending ? <Loader2 size={16} className="crs-spin" /> : null}
            {sending ? "Unlocking…" : "Show me the profile"}
          </button>

          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: "0.75rem 0 0", lineHeight: 1.5, textAlign: "center" }}>
            We&apos;ll email you updates about this company&apos;s registry status.
            Unsubscribe anytime.
          </p>
        </form>
      </div>
    </div>
  );
}

function ValueRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li style={{ display: "flex", gap: "0.55rem", alignItems: "center", fontSize: "0.88rem", color: "var(--text)" }}>
      <span style={{
        width: "1.5rem", height: "1.5rem",
        borderRadius: "0.35rem",
        background: "rgba(42,125,143,0.10)",
        color: "var(--secondary)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <CheckCircle2 size={12} />
      </span>
      <span style={{ lineHeight: 1.4 }}>{text}</span>
    </li>
  );
}
