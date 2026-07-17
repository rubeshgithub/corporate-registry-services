"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, CheckCircle2, X, AlertCircle, ArrowRight } from "lucide-react";

/**
 * Lead-capture widget for the /minute-books hub page.
 *
 * Flow:
 *   1. Visitor types corp name / number → debounced autocomplete against
 *      /api/registrar/search (Alberta corpus for now; Phase 3 broadens to
 *      other jurisdictions when their DBs come online).
 *   2. Visitor clicks a result → modal opens asking for email.
 *   3. Submit → POST /api/minute-book-pilot. Owner (CRS) gets notified,
 *      requester gets a confirmation email + "expect access within 24hr"
 *      screen.
 *
 * Deliberately narrower than the annual-return / good-standing widgets —
 * this doesn't take payment, doesn't need a phone number, doesn't need
 * jurisdiction selection. The pilot is free; friction stays as low as
 * possible so a page with 28 impr/day actually converts.
 */

type Hit = {
  registryId:      string;   // corp number for Alberta
  name:            string;
  entityType:      string;
  provinceKey:     string;
  jurisdiction:    string;
  status:          string;
  location?:       string;
};

type WidgetState =
  | { mode: "idle" }
  | { mode: "picked";     hit: Hit }
  | { mode: "submitting"; hit: Hit }
  | { mode: "success";    message: string }
  | { mode: "error";      message: string };

export default function MinuteBookPilotWidget() {
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const [state, setState]         = useState<WidgetState>({ mode: "idle" });
  const [email, setEmail]         = useState("");

  const lastFiredRef = useRef("");
  const inputWrapRef = useRef<HTMLDivElement>(null);

  const canSearch = useMemo(() => query.trim().length >= 2, [query]);

  /* Debounced search matching the pattern on annual-return + good-standing
     widgets — 450ms after the visitor stops typing, at ≥2 chars. */
  useEffect(() => {
    if (!canSearch) { setResults([]); setSearchErr(""); return; }
    const q = query.trim();
    if (q === lastFiredRef.current) return;
    const t = setTimeout(async () => {
      lastFiredRef.current = q;
      setSearching(true);
      setSearchErr("");
      try {
        const res = await fetch(`/api/registrar/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // /api/registrar/search returns { corpNumber, name, entityType,
        // status, city, ... } — all Alberta corps for now. Map to the
        // widget's Hit shape and skip name-only shell docs (no corpNumber
        // means no reliable identity).
        const hits: Hit[] = (data.results ?? [])
          .filter((r: { isNameShell?: boolean; corpNumber?: string }) => !r.isNameShell && r.corpNumber)
          .map((r: { corpNumber?: string; name?: string; entityType?: string; status?: string; city?: string }) => ({
            registryId:  r.corpNumber ?? "",
            name:        r.name ?? "",
            entityType:  r.entityType ?? "",
            provinceKey: "ab",
            jurisdiction: "Alberta",
            status:      r.status ?? "",
            location:    r.city ?? "",
          }));
        setResults(hits);
        setShowDropdown(true);
        if (!hits.length) setSearchErr("No matching Alberta corporations. Try the exact registered name.");
      } catch {
        setSearchErr("Search is temporarily unavailable. Please try again.");
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [query, canSearch]);

  /* Close dropdown on click-outside. */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = inputWrapRef.current;
      if (el && !el.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pick = (hit: Hit) => {
    setState({ mode: "picked", hit });
    setShowDropdown(false);
  };

  const cancel = () => {
    setState({ mode: "idle" });
    setEmail("");
  };

  const submit = async () => {
    if (state.mode !== "picked") return;
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setState({ mode: "error", message: "Please enter a valid email address." });
      return;
    }
    const hit = state.hit;
    setState({ mode: "submitting", hit });
    try {
      const sessionId = getSessionId();
      const res = await fetch("/api/minute-book-pilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email:           em,
          companyName:     hit.name,
          registryId:      hit.registryId,
          jurisdictionKey: hit.provinceKey,
          entityType:      hit.entityType,
          status:          hit.status,
          path:            typeof window !== "undefined" ? window.location.pathname : "/minute-books",
          sessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setState({ mode: "success", message: data.message ?? "Request received." });
    } catch (e) {
      setState({ mode: "error", message: e instanceof Error ? e.message : "Submission failed." });
    }
  };

  return (
    <div
      style={{
        border:       "1px solid var(--border)",
        borderLeft:   "4px solid var(--gold)",
        background:   "var(--card)",
        borderRadius: "var(--radius-card, 0.75rem)",
        padding:      "1.5rem 1.75rem",
        boxShadow:    "var(--shadow-card, 0 4px 12px rgba(0,61,91,0.05))",
        margin:       "0 0 2rem",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
        Free 30-day pilot · No credit card
      </div>
      <div className="card-heading" style={{ fontSize: "1.25rem", margin: "0.35rem 0 0.5rem" }}>
        Generate your corporate minute book with AI
      </div>
      <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", margin: "0 0 1rem", lineHeight: 1.55 }}>
        Search your Canadian corporation and start your free 30-day pilot. We prepare a complete, jurisdiction-specific minute book — articles, by-laws, resolutions, registers, share certificates — ready to sign, store, and present to your bank or lawyer.
      </p>

      {(state.mode === "idle" || state.mode === "picked") && (
        <div ref={inputWrapRef} style={{ position: "relative" }}>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => { if (results.length) setShowDropdown(true); }}
              placeholder="Company name or corporation number (Alberta)"
              disabled={state.mode === "picked"}
              style={{
                flex: "3 1 260px",
                padding: "0.7rem 0.9rem",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                fontSize: "0.95rem",
                background: state.mode === "picked" ? "var(--bg-deep)" : "var(--bg)",
                color: "var(--text)",
              }}
            />
            {state.mode === "picked" && (
              <button
                onClick={cancel}
                title="Search a different corporation"
                style={{
                  padding: "0.7rem 0.9rem",
                  background: "var(--card)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.5rem",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Change
              </button>
            )}
          </div>
          {searchErr && !showDropdown && (
            <p style={{ color: "#B45309", fontSize: "0.8rem", margin: "0.4rem 0 0" }}>{searchErr}</p>
          )}
          {searching && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
              <Loader2 size={13} className="crs-spin" /> searching…
            </div>
          )}

          {/* Autocomplete dropdown */}
          {showDropdown && results.length > 0 && state.mode === "idle" && (
            <div
              role="listbox"
              style={{
                position: "absolute",
                top: "calc(100% + 0.35rem)",
                left: 0, right: 0,
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "0.6rem",
                boxShadow: "0 12px 40px rgba(0,61,91,0.18), 0 2px 8px rgba(0,61,91,0.1)",
                overflow: "hidden",
                zIndex: 20,
                maxHeight: 320,
                overflowY: "auto",
              }}
            >
              {results.slice(0, 8).map((hit) => (
                <button
                  key={hit.registryId + hit.name}
                  onClick={() => pick(hit)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "0.65rem 0.85rem",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    color: "var(--text)",
                    fontFamily: "inherit",
                    fontSize: "0.88rem",
                  }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = "var(--bg-deep)"}
                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                >
                  <div style={{ fontWeight: 700 }}>{hit.name}</div>
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                    {hit.registryId ? `${hit.registryId} · ` : ""}{hit.entityType} · {hit.jurisdiction} · {hit.status}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Picked-corp panel + email capture */}
      {state.mode === "picked" && (
        <PickedPanel hit={state.hit} email={email} setEmail={setEmail} onSubmit={submit} />
      )}
      {state.mode === "submitting" && (
        <PickedPanel hit={state.hit} email={email} setEmail={setEmail} onSubmit={submit} submitting />
      )}

      {state.mode === "success" && <SuccessPanel message={state.message} />}
      {state.mode === "error"   && (
        <>
          <div style={{ padding: "0.7rem 0.9rem", marginTop: "0.85rem", background: "rgba(220,38,38,0.08)", color: "#B91C1C", fontSize: "0.85rem", borderRadius: "0.4rem", display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
            <AlertCircle size={14} style={{ marginTop: "0.15rem", flexShrink: 0 }} />
            <span>{state.message}</span>
          </div>
          <button onClick={cancel} style={{ marginTop: "0.85rem", background: "transparent", border: "1px solid var(--border)", padding: "0.55rem 1rem", borderRadius: "0.4rem", cursor: "pointer", color: "var(--text)", fontSize: "0.85rem" }}>
            Start over
          </button>
        </>
      )}

      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "1rem", lineHeight: 1.5 }}>
        Alberta corporations searchable from our registry corpus (1M+ records).
        Other provinces coming soon — <a href="/contact" style={{ color: "var(--secondary)" }}>contact us</a> to request early access.
      </p>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────── */

function PickedPanel({ hit, email, setEmail, onSubmit, submitting }: {
  hit: Hit; email: string; setEmail: (v: string) => void; onSubmit: () => void; submitting?: boolean;
}) {
  return (
    <div style={{ marginTop: "1rem", padding: "1rem 1.15rem", background: "var(--bg-deep)", border: "1px solid var(--gold)", borderRadius: "0.5rem" }}>
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
        <CheckCircle2 size={18} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.15rem" }} />
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "1rem" }}>{hit.name}</div>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            {hit.registryId ? `${hit.registryId} · ` : ""}{hit.entityType} · {hit.jurisdiction} · Status: {hit.status}
          </div>
        </div>
      </div>

      <div style={{ marginTop: "0.85rem" }}>
        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.25rem" }}>
          Enter your email to start your free 30-day pilot
        </label>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
            disabled={submitting}
            placeholder="you@yourcompany.ca"
            style={{
              flex: "3 1 240px",
              padding: "0.6rem 0.85rem",
              border: "1px solid var(--border)",
              borderRadius: "0.4rem",
              fontSize: "0.92rem",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />
          <button
            onClick={onSubmit}
            disabled={submitting}
            style={{
              flex: "0 0 auto",
              padding: "0.6rem 1.1rem",
              background: "var(--primary)",
              color: "#FFFFFF",
              fontWeight: 700,
              fontSize: "0.9rem",
              border: "none",
              borderRadius: "0.4rem",
              cursor: submitting ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            {submitting ? (
              <><Loader2 size={14} className="crs-spin" /> Sending…</>
            ) : (
              <>Generate MinuteBook <ArrowRight size={14} /></>
            )}
          </button>
        </div>
        <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.5rem", lineHeight: 1.5 }}>
          We'll email you a login link to your MinuteBook workspace within one business day. No credit card required. Cancel any time during the 30-day pilot.
        </p>
      </div>
    </div>
  );
}

function SuccessPanel({ message }: { message: string }) {
  return (
    <div
      style={{
        marginTop: "1rem", padding: "1.25rem 1.5rem",
        background: "rgba(22,163,74,0.08)",
        border: "1px solid rgba(22,163,74,0.35)",
        borderRadius: "0.5rem",
        display: "flex", gap: "0.75rem", alignItems: "flex-start",
      }}
    >
      <CheckCircle2 size={24} style={{ color: "#16A34A", flexShrink: 0, marginTop: "0.15rem" }} />
      <div>
        <div style={{ fontWeight: 700, color: "#166534", fontSize: "1.05rem", marginBottom: "0.35rem" }}>
          You're in.
        </div>
        <p style={{ fontSize: "0.9rem", color: "var(--text)", margin: 0, lineHeight: 1.6 }}>
          {message}
        </p>
      </div>
      <button
        onClick={() => window.location.reload()}
        title="Submit another"
        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
      >
        <X size={16} />
      </button>
    </div>
  );
}

function getSessionId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const m = document.cookie.match(/(?:^|; )crs_session_id=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}
