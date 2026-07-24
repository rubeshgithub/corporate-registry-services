"use client";

import { useState } from "react";
import { Search, Loader2, ArrowRight, CheckCircle2, AlertTriangle, XOctagon } from "lucide-react";

/**
 * Client-side island for the Instant Availability Check page.
 *
 * Flow:
 *   1. User enters proposed name + picks scope
 *   2. POST /api/name-availability/check → results
 *   3. Show traffic light + match list + tailored NUANS CTA
 *
 * Green   → "Reserve fast" urgency + prominent CTA
 * Moderate → neutral framing, encourage the paid NUANS as the definitive answer
 * Weak     → warn about likely rejection, still allow ordering the paid NUANS
 *
 * The paid conversion is a link to /order/nuans-search?q=<name>&src=...
 * The name is pre-filled in the existing NUANS order wizard.
 */

type Scope = "all" | "federal" | "bc" | "ab";

type Match = {
  name:         string;
  jurisdiction: string;
  registryId:   string;
  status:       string;
};

type Result = {
  strength:      "strong" | "moderate" | "weak";
  matchCount:    number;
  matches:       Match[];
  scopeLabel:    string;
  coverageNote?: string;
};

const SCOPES: Array<{ key: Scope; label: string; help: string }> = [
  { key: "all",     label: "All Canada",         help: "Federal + BC + Alberta live registries" },
  { key: "federal", label: "Federal (CBCA)",     help: "Corporations Canada only" },
  { key: "bc",      label: "British Columbia",   help: "BC Registry Services" },
  { key: "ab",      label: "Alberta",            help: "Alberta Registry" },
];

export default function AvailabilityCheckIsland() {
  const [name, setName]       = useState("");
  const [scope, setScope]     = useState<Scope>("all");
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState("");
  const [result, setResult]   = useState<Result | null>(null);
  const [checkedName, setCheckedName] = useState("");

  const canCheck = name.trim().length >= 2 && !loading;

  const submit = async () => {
    if (!canCheck) return;
    setLoading(true);
    setErr("");
    setResult(null);
    try {
      const res = await fetch("/api/name-availability/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scope }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setResult(json.result as Result);
      setCheckedName(name.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Check failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 1.5rem 2rem" }}>
      {/* Form card */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.6rem", padding: "1.5rem 1.75rem", marginBottom: "1.5rem" }}>
        <label style={{ display: "block", marginBottom: "1rem" }}>
          <span style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.3rem" }}>
            Proposed corporation name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onKey}
            placeholder="e.g. Maple Holdings Inc."
            style={inputStyle}
            autoFocus
          />
          <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Include the legal element (Inc., Ltd., Corp., ULC) as you would file it.
          </span>
        </label>

        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.4rem" }}>
            Search scope
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem" }}>
            {SCOPES.map((s) => (
              <label
                key={s.key}
                style={{
                  padding: "0.65rem 0.85rem",
                  border: scope === s.key ? "1px solid var(--primary)" : "1px solid var(--border)",
                  background: scope === s.key ? "rgba(0,61,91,0.05)" : "var(--bg)",
                  borderRadius: "0.4rem",
                  cursor: "pointer",
                  display: "flex",
                  gap: "0.4rem",
                  alignItems: "flex-start",
                }}
              >
                <input
                  type="radio"
                  checked={scope === s.key}
                  onChange={() => setScope(s.key)}
                  style={{ marginTop: "0.15rem" }}
                />
                <span>
                  <span style={{ display: "block", fontWeight: 700, fontSize: "0.85rem", color: "var(--text)" }}>{s.label}</span>
                  <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>{s.help}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={submit}
          disabled={!canCheck}
          style={{
            padding: "0.75rem 1.5rem",
            background: canCheck ? "var(--primary)" : "var(--border)",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "0.4rem",
            fontSize: "0.95rem",
            fontWeight: 700,
            cursor: canCheck ? "pointer" : "not-allowed",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {loading ? <><Loader2 size={16} className="crs-spin" /> Checking…</> : <><Search size={16} /> Check availability</>}
        </button>

        {err && (
          <div style={{ marginTop: "1rem", padding: "0.7rem 0.9rem", background: "rgba(220,38,38,0.08)", color: "#B91C1C", fontSize: "0.85rem", borderRadius: "0.4rem" }}>
            {err}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <ResultsCard result={result} name={checkedName} />
      )}
    </div>
  );
}

/* ═══════════════════════════ Results ═══════════════════════════ */

function ResultsCard({ result, name }: { result: Result; name: string }) {
  const { strength, matchCount, matches, scopeLabel, coverageNote } = result;
  const tone = TONE[strength];

  return (
    <div style={{
      background: "var(--card)",
      border: `2px solid ${tone.border}`,
      borderLeft: `6px solid ${tone.border}`,
      borderRadius: "0.6rem",
      padding: "1.5rem 1.75rem",
      marginBottom: "1.5rem",
    }}>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", marginBottom: "1rem" }}>
        <tone.Icon size={26} style={{ color: tone.border, flexShrink: 0, marginTop: "0.15rem" }} />
        <div>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: tone.border, fontWeight: 700, marginBottom: "0.25rem" }}>
            {tone.badge}
          </div>
          <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.4rem", fontWeight: 700, color: "var(--text)", margin: 0, lineHeight: 1.3 }}>
            {tone.headline(matchCount, name)}
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.35rem", marginBottom: 0, lineHeight: 1.5 }}>
            Scope: <strong style={{ color: "var(--text)" }}>{scopeLabel}</strong>
          </p>
        </div>
      </div>

      <p style={{ fontSize: "0.92rem", color: "var(--text)", lineHeight: 1.6, marginTop: 0, marginBottom: "1rem" }}>
        {tone.body}
      </p>

      {coverageNote && (
        <div style={{
          padding: "0.65rem 0.85rem",
          background: "var(--bg-deep)",
          borderLeft: "3px solid var(--gold)",
          borderRadius: "0.3rem",
          fontSize: "0.8rem",
          color: "var(--text-muted)",
          lineHeight: 1.55,
          marginBottom: "1rem",
        }}>
          {coverageNote}
        </div>
      )}

      {matches.length > 0 && (
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", fontWeight: 700, marginBottom: "0.5rem" }}>
            Similar corporations found {matchCount > matches.length ? `(showing ${matches.length} of ${matchCount})` : ""}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            {matches.map((m, i) => (
              <div key={`${m.name}-${i}`} style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                background: "var(--bg-deep)",
                border: "1px solid var(--border)",
                borderRadius: "0.35rem",
                alignItems: "baseline",
              }}>
                <span style={{ fontSize: "0.88rem", color: "var(--text)", fontWeight: 500 }}>{m.name}</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", whiteSpace: "nowrap" }}>
                  {m.jurisdiction}{m.status ? ` · ${m.status.toLowerCase()}` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NUANS order CTA — always show, but framing differs by strength */}
      <div style={{
        marginTop: "1.5rem",
        padding: "1.25rem",
        background: strength === "strong" ? "rgba(22,163,74,0.08)" : "var(--bg-deep)",
        border: `1px solid ${strength === "strong" ? "rgba(22,163,74,0.35)" : "var(--border)"}`,
        borderRadius: "0.5rem",
      }}>
        <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text)", marginBottom: "0.35rem" }}>
          {tone.ctaHeadline}
        </div>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.55, marginTop: 0, marginBottom: "0.85rem" }}>
          {tone.ctaBody}
        </p>
        <a
          href={`/order/nuans-search?q=${encodeURIComponent(name)}&src=instant-check-${strength}`}
          style={{
            padding: "0.75rem 1.5rem",
            background: strength === "strong" ? "#16A34A" : "var(--primary)",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "0.4rem",
            fontSize: "0.92rem",
            fontWeight: 700,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            textDecoration: "none",
          }}
        >
          Order Full NUANS Report — $79 all-in <ArrowRight size={15} />
        </a>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.6rem", fontStyle: "italic" }}>
          Delivered by email within one business hour. Required for federal incorporation and cross-provincial name protection.
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════ Tone config ═══════════════════════════ */

const TONE = {
  strong: {
    border:   "#16A34A",
    badge:    "Strong candidate",
    Icon:     CheckCircle2,
    headline: (_n: number, name: string) => `"${name}" looks clean.`,
    body:     "No corporations with a similar distinctive name were found in the registries we checked. This is a strong signal that the paid NUANS report will come back clean — but you should still order it to lock in the name officially and file your incorporation.",
    ctaHeadline: "Reserve this name fast.",
    ctaBody:     "A clean instant check is a green light. Names get taken quickly, and the paid NUANS report is the only search accepted by federal and provincial registries. Order it now and lock in your name before someone else does.",
  },
  moderate: {
    border:   "#D4A017",
    badge:    "Some overlap",
    Icon:     AlertTriangle,
    headline: (n: number, name: string) => `${n} similar name${n === 1 ? "" : "s"} found for "${name}".`,
    body:     "Some corporations share distinctive elements with your proposed name. This doesn't necessarily mean the registrar will reject it — that depends on which fields overlap, whether the industries are related, and other factors that only the paid NUANS assesses.",
    ctaHeadline: "Get a definitive answer with the paid NUANS.",
    ctaBody:     "The paid NUANS runs full phonetic + trademark + national-registry matching (which the instant check doesn't do) and produces the official report that registrars require to accept your incorporation filing.",
  },
  weak: {
    border:   "#B45309",
    badge:    "Weak — high rejection risk",
    Icon:     XOctagon,
    headline: (n: number, name: string) => `${n} similar names found for "${name}".`,
    body:     "This many overlaps is a strong signal that a proper NUANS report will surface conflicts and that your incorporation filing may be refused. Consider revising your proposed name before ordering the paid NUANS — or add a more distinctive element to make it stand out from the corporations listed above.",
    ctaHeadline: "Still want to try the paid NUANS?",
    ctaBody:     "You can still order the full NUANS report — its official verdict is what registrars accept, and there's a chance the phonetic/exact-match rules land in your favour. But budget for the possibility that you'll need to revise the name and pay for a second NUANS.",
  },
} as const;

/* ═══════════════════════════ Shared styles ═══════════════════════════ */

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.7rem 0.9rem",
  border: "1px solid var(--border)",
  borderRadius: "0.4rem",
  fontSize: "0.95rem",
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "inherit",
};
