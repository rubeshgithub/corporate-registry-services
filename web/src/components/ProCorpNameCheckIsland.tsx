"use client";

import { useState } from "react";
import { Search, Loader2, CheckCircle2, AlertTriangle, ArrowRight, Mail } from "lucide-react";

type Scope = "all" | "ab" | "bc" | "mb" | "on" | "sk" | "ns" | "federal";
type Match = { name: string; jurisdiction?: string; status?: string };
type Result = {
  strength:      "strong" | "moderate" | "weak";
  matchCount:    number;
  matches:       Match[];
  scopeLabel:    string;
  coverageNote?: string;
};

const SCOPES: { key: Scope; label: string }[] = [
  { key: "ab",      label: "Alberta" },
  { key: "bc",      label: "British Columbia" },
  { key: "mb",      label: "Manitoba" },
  { key: "on",      label: "Ontario" },
  { key: "sk",      label: "Saskatchewan" },
  { key: "ns",      label: "Nova Scotia" },
  { key: "federal", label: "Federal" },
  { key: "all",     label: "All we cover" },
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.7rem",
  border: "1px solid var(--border)",
  borderRadius: "0.4rem",
  fontSize: "0.88rem",
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "inherit",
};

export default function ProCorpNameCheckIsland({
  src,
  defaultScope = "ab",
  profession = "physician",
}: {
  src: string;
  defaultScope?: Scope;
  profession?: string;
}) {
  const [title, setTitle]   = useState("Dr.");
  const [first, setFirst]   = useState("");
  const [middle, setMiddle] = useState("");
  const [last, setLast]     = useState("");
  const [scope, setScope]   = useState<Scope>(defaultScope);

  const [checking, setChecking] = useState(false);
  const [result, setResult]     = useState<Result | null>(null);
  const [err, setErr]           = useState("");

  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);

  /* Ontario (O. Reg. 665/05): surname with optional given names/initials,
     then "Medicine Professional Corporation" for physicians — no "Dr.", which
     CPSO says takes the name offside. Alberta (CPSA Bylaw 42.1) allows
     "Dr. Jane A. Smith Professional Corporation". */
  const ontario = scope === "on";
  const suffix  = ontario && profession === "physician"
    ? " Medicine Professional Corporation"
    : " Professional Corporation";
  const proposedName =
    [ontario ? "" : title.trim(), first.trim(), middle.trim(), last.trim()].filter(Boolean).join(" ") +
    (last.trim() ? suffix : "");

  const canCheck = first.trim().length > 0 && last.trim().length > 0 && !checking;
  const canSend =
    !!contact.name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) &&
    !!contact.phone.trim() &&
    !sending;

  async function runCheck() {
    if (!canCheck) return;
    setChecking(true); setErr(""); setResult(null); setSent(false);
    try {
      const res  = await fetch("/api/name-availability/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: proposedName, scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check failed.");
      setResult(data.result as Result);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Check failed. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  async function sendReport() {
    if (!canSend) return;
    setSending(true); setErr("");
    try {
      const sessionId = document.cookie.match(/(?:^|; )crs_session_id=([^;]+)/)?.[1] ?? "";
      const res  = await fetch("/api/pc-name-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposedName, scope, contact, profession, src,
          path: typeof window !== "undefined" ? window.location.pathname : "",
          sessionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send the report.");
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send the report. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const clean = result?.matchCount === 0;

  return (
    <div style={{
      margin: "0 0 2rem",
      padding: "1.75rem",
      borderRadius: "var(--radius-card)",
      border: "1px solid var(--border)",
      borderTop: "3px solid var(--gold)",
      background: "var(--card)",
      boxShadow: "var(--shadow-card)",
    }}>
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)", marginBottom: "0.4rem" }}>
        Free preliminary name check
      </div>
      <h2 className="card-heading" style={{ fontSize: "1.2rem", marginBottom: "0.35rem" }}>
        Is your professional corporation name already taken?
      </h2>
      <p style={{ fontSize: "0.86rem", color: "var(--text-muted)", marginBottom: "1.1rem", lineHeight: 1.55 }}>
        Your college expects the corporation to carry your own name. Enter it as it appears on your
        registration and we&rsquo;ll check the registry for conflicts &mdash; then email you the result.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: ontario ? "1fr 5rem 1fr" : "5rem 1fr 5rem 1fr", gap: "0.5rem", marginBottom: "0.6rem" }}>
        {!ontario && (
          <input value={title}  onChange={(e) => setTitle(e.target.value)}  placeholder="Dr."     aria-label="Title"          style={inputStyle} />
        )}
        <input value={first}  onChange={(e) => setFirst(e.target.value)}  placeholder="First"   aria-label="First name"     style={inputStyle} />
        <input value={middle} onChange={(e) => setMiddle(e.target.value)} placeholder="Initial" aria-label="Middle initial" style={inputStyle} />
        <input value={last}   onChange={(e) => setLast(e.target.value)}   placeholder="Surname" aria-label="Surname"        style={inputStyle} />
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} aria-label="Where to check" style={{ ...inputStyle, flex: "0 0 auto", width: "auto" }}>
          {SCOPES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button onClick={runCheck} disabled={!canCheck} style={{
          flex: "1 1 12rem", padding: "0.7rem 1rem",
          background: canCheck ? "var(--primary)" : "var(--border)",
          color: "#FFFFFF", fontWeight: 700, fontSize: "0.92rem",
          border: "none", borderRadius: "0.5rem",
          cursor: canCheck ? "pointer" : "not-allowed",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.45rem",
        }}>
          {checking ? <><Loader2 size={15} className="crs-spin" /> Checking&hellip;</> : <><Search size={15} /> Check this name</>}
        </button>
      </div>

      {last.trim() && (
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 0.75rem", fontFamily: "var(--font-mono), monospace" }}>
          Checking: <span style={{ color: "var(--text)" }}>{proposedName}</span>
        </p>
      )}

      {err && (
        <div style={{ padding: "0.55rem 0.8rem", background: "rgba(180,83,9,0.08)", color: "#B45309", fontSize: "0.82rem", borderRadius: "0.4rem", marginBottom: "0.75rem" }}>
          {err}
        </div>
      )}

      {result && (
        <div style={{
          padding: "0.9rem 1rem", borderRadius: "0.5rem",
          border: `1px solid ${clean ? "rgba(22,101,52,0.35)" : "rgba(180,83,9,0.35)"}`,
          background: clean ? "rgba(22,101,52,0.06)" : "rgba(180,83,9,0.06)",
          marginBottom: "1rem",
        }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
            {clean
              ? <CheckCircle2 size={17} style={{ color: "#166534", flexShrink: 0, marginTop: "0.1rem" }} />
              : <AlertTriangle size={17} style={{ color: "#B45309", flexShrink: 0, marginTop: "0.1rem" }} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)", marginBottom: "0.2rem" }}>
                {clean
                  ? `No conflicting registration found in ${result.scopeLabel}`
                  : `${result.matchCount} similar name${result.matchCount === 1 ? "" : "s"} found in ${result.scopeLabel}`}
              </div>
              {result.matches.length > 0 && (
                <ul style={{ margin: "0.35rem 0 0", paddingLeft: "1.1rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  {result.matches.slice(0, 5).map((m) => <li key={m.name}>{m.name}</li>)}
                </ul>
              )}
              <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: "0.5rem 0 0", lineHeight: 1.5 }}>
                This is a preliminary check of registry records &mdash; not a NUANS and not your
                college&rsquo;s approval. A clean result means the obvious blockers aren&rsquo;t there.
              </p>
            </div>
          </div>
        </div>
      )}

      {result && !sent && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.9rem" }}>
          <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text)", marginBottom: "0.15rem" }}>
            Email me the full preliminary report
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 0.6rem" }}>
            Every similar name we found, what it means for your application, and the next step. No charge.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))", gap: "0.5rem", marginBottom: "0.6rem" }}>
            <input value={contact.name}  onChange={(e) => setContact({ ...contact, name: e.target.value })}  placeholder="Your name" aria-label="Your name" style={inputStyle} />
            <input value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="Email"     aria-label="Email" type="email" style={inputStyle} />
            <input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="Phone"     aria-label="Phone" type="tel"   style={inputStyle} />
          </div>
          <button onClick={sendReport} disabled={!canSend} style={{
            width: "100%", padding: "0.72rem 1rem",
            background: canSend ? "var(--gold)" : "var(--border)",
            color: canSend ? "var(--primary)" : "#FFFFFF",
            fontWeight: 700, fontSize: "0.92rem", border: "none", borderRadius: "0.5rem",
            cursor: canSend ? "pointer" : "not-allowed",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.45rem",
          }}>
            {sending ? <><Loader2 size={15} className="crs-spin" /> Sending&hellip;</> : <><Mail size={15} /> Send my free report</>}
          </button>
        </div>
      )}

      {sent && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.9rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
          <CheckCircle2 size={17} style={{ color: "#166534", flexShrink: 0, marginTop: "0.1rem" }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)" }}>Report on its way</div>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0.2rem 0 0.6rem", lineHeight: 1.5 }}>
              Check your inbox &mdash; and your spam folder if it isn&rsquo;t there in a few minutes.
            </p>
            <a href="/order/professional-corporation" style={{
              display: "inline-flex", alignItems: "center", gap: "0.35rem",
              fontSize: "0.85rem", fontWeight: 600, color: "var(--primary)", textDecoration: "none",
              borderBottom: "1px solid var(--gold)",
            }}>
              Set up my professional corporation <ArrowRight size={14} />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
