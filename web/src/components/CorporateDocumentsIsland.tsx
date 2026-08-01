"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ArrowRight, Files, CheckCircle2 } from "lucide-react";

/**
 * Inline corporation search + quote-request island for the
 * how-to-get-corporate-documents-in-canada article page.
 *
 * Trust-first, professional styling (navy secondary vs the amber-urgency
 * palette used on annual-return articles) — the visitor here isn't
 * deadline-panicking, they're compliance-shopping. Emphasis is on:
 * one quote, one delivery, 24h, all 13 jurisdictions.
 *
 * User types corp name / number → picks a match → redirected to
 * /order/corporate-documents with the name pre-filled and the corporation
 * card auto-verified on arrival.
 */

const DEBOUNCE_MS = 400;
const MIN_QUERY   = 2;

type RegistryHit = {
  name:             string;
  businessNumber:   string;
  registryId:       string;
  location:         string;
  status:           "Active" | "Inactive";
  statusNotes:      string;
  entityType:       string;
  registrationDate: string;
  jurisdiction:     string;
  provinceKey:      string;
};

export default function CorporateDocumentsIsland({
  src = "article-how-to-get-corporate-documents-in-canada",
}: { src?: string }) {
  const [q, setQ]                       = useState("");
  const [province, setProvince]         = useState("all");
  const [results, setResults]           = useState<RegistryHit[]>([]);
  const [searching, setSearching]       = useState(false);
  const [searchErr, setSearchErr]       = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [redirecting, setRedirecting]   = useState(false);

  const searchToken = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < MIN_QUERY) {
      setResults([]);
      setSearchErr("");
      setDropdownOpen(false);
      return;
    }
    const myToken = ++searchToken.current;
    const t = setTimeout(async () => {
      setSearching(true);
      setSearchErr("");
      try {
        const res  = await fetch(`/api/company-search?q=${encodeURIComponent(query)}&province=${province}`);
        const data = await res.json();
        if (myToken !== searchToken.current) return;
        const hits: RegistryHit[] = data.results ?? [];
        setResults(hits);
        setDropdownOpen(true);
        if (!hits.length) setSearchErr("No matches — try the exact legal name, corporation number, or Business Number.");
      } catch {
        if (myToken !== searchToken.current) return;
        setSearchErr("Search is temporarily unavailable — please try again.");
        setResults([]);
      } finally {
        if (myToken === searchToken.current) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, province]);

  const pickAndGo = (hit: RegistryHit) => {
    setRedirecting(true);
    const params = new URLSearchParams();
    params.set("q",            hit.name);
    if (hit.provinceKey) params.set("jurisdiction", hit.provinceKey);
    params.set("src",          src);
    window.location.href = `/order/corporate-documents?${params.toString()}`;
  };

  return (
    <div
      style={{
        margin: "0 0 2rem",
        padding: "1.75rem 1.75rem",
        borderRadius: "0.75rem",
        border: "1px solid var(--secondary)",
        background: "linear-gradient(135deg, rgba(42,125,143,0.10) 0%, rgba(42,125,143,0.03) 100%)",
        boxShadow: "0 4px 12px rgba(42,125,143,0.08)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", marginBottom: "1rem" }}>
        <span
          style={{
            width: "2.5rem", height: "2.5rem",
            borderRadius: "0.55rem",
            background: "rgba(42,125,143,0.15)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden
        >
          <Files size={18} style={{ color: "var(--secondary)" }} />
        </span>
        <div>
          <div style={{
            fontFamily: "var(--font-mono), monospace",
            fontSize: "0.68rem",
            textTransform: "uppercase",
            letterSpacing: "0.09em",
            color: "var(--secondary)",
            fontWeight: 700,
          }}>
            Skip the multi-registry paperwork
          </div>
          <div style={{
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: "1.2rem", fontWeight: 700,
            color: "var(--text)", marginTop: "0.15rem",
            lineHeight: 1.3,
          }}>
            Search your corporation — get every document in 24 hours
          </div>
        </div>
      </div>

      {/* Search row */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", position: "relative" }}>
        <select
          value={province}
          onChange={(e) => setProvince(e.target.value)}
          style={{ ...inputStyle, flex: "0 0 auto", maxWidth: 200 }}
          disabled={redirecting}
        >
          <option value="all">All Canada</option>
          <option value="ab">Alberta</option>
          <option value="bc">British Columbia</option>
          <option value="on">Ontario</option>
          <option value="federal">Federal</option>
          <option value="mb">Manitoba</option>
          <option value="sk">Saskatchewan</option>
          <option value="ns">Nova Scotia</option>
          <option value="nb">New Brunswick</option>
          <option value="nl">Newfoundland</option>
          <option value="pe">Prince Edward Island</option>
          <option value="nt">NWT</option>
          <option value="yt">Yukon</option>
          <option value="nu">Nunavut</option>
        </select>
        <div style={{ flex: "3 1 240px", position: "relative", minWidth: 0 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => { if (results.length) setDropdownOpen(true); }}
            placeholder="Company name, corporation number, or Business Number"
            style={inputStyle}
            disabled={redirecting}
          />
          {(searching || redirecting) && (
            <Loader2 size={14} className="crs-spin" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          )}

          {dropdownOpen && results.length > 0 && !redirecting && (
            <div style={dropdownStyle}>
              {results.slice(0, 6).map((hit, i) => (
                <button
                  key={`${hit.provinceKey}-${hit.registryId}-${i}`}
                  type="button"
                  onClick={() => pickAndGo(hit)}
                  style={dropdownItemStyle}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "flex-start" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.92rem" }}>{hit.name}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                        {hit.jurisdiction}
                        {hit.registryId ? ` · #${hit.registryId}` : ""}
                        {hit.location ? ` · ${hit.location}` : ""}
                      </div>
                    </div>
                    <ArrowRight size={14} style={{ color: "var(--secondary)", flexShrink: 0, marginTop: "0.25rem" }} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {searchErr && !dropdownOpen && (
        <p style={{ fontSize: "0.8rem", color: "#B91C1C", margin: "0.6rem 0 0" }}>{searchErr}</p>
      )}

      {/* Trust footer */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: "0.5rem 1rem",
        marginTop: "1rem",
        paddingTop: "0.85rem",
        borderTop: "1px solid rgba(42,125,143,0.15)",
      }}>
        <TrustLine label="Formal quote in a few hours" />
        <TrustLine label="Delivered within 24h of approval" />
        <TrustLine label="All 13 Canadian jurisdictions" />
        <TrustLine label="Certified PDFs — bank-ready" />
      </div>
    </div>
  );
}

function TrustLine({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.78rem", color: "var(--text)" }}>
      <CheckCircle2 size={12} style={{ color: "var(--secondary)", flexShrink: 0 }} />
      <span>{label}</span>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.85rem",
  border: "1px solid var(--border)",
  borderRadius: "0.4rem",
  fontSize: "0.92rem",
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "inherit",
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%", left: 0, right: 0,
  marginTop: "0.25rem",
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.4rem",
  boxShadow: "0 8px 24px rgba(0, 61, 91, 0.15)",
  maxHeight: "340px",
  overflowY: "auto",
  zIndex: 20,
};

const dropdownItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "0.75rem 0.9rem",
  border: "none",
  borderBottom: "1px solid var(--border)",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  color: "var(--text)",
};
