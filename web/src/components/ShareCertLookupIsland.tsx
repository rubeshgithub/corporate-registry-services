"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, ArrowRight, ShieldCheck } from "lucide-react";

/**
 * Inline share-certificate lookup widget for the
 * /articles/share-certificates-in-canada article page.
 *
 * User types corp name / corp number / BN in the search box → we
 * debounce-lookup against /api/company-search and render an
 * autocomplete dropdown. Clicking a match stashes the picked
 * RegistryHit in sessionStorage and redirects to
 * /order/share-certificate, where ShareCertSingleScreenFlow reads
 * the stashed corp on mount and auto-populates its "Verified
 * corporation" card — so the visitor never has to search twice.
 *
 * Session key: crs.shareCert.pickedCorp — consumed and cleared by
 * ShareCertSingleScreenFlow's mount effect.
 */

const DEBOUNCE_MS = 400;
const MIN_QUERY   = 2;
const SESSION_KEY = "crs.shareCert.pickedCorp";

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

export default function ShareCertLookupIsland({ src = "article-share-certificates-in-canada" }: { src?: string }) {
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
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(hit));
    } catch {
      /* sessionStorage can throw in strict privacy modes — the
       *  order page still works, the visitor just re-searches there. */
    }
    window.location.href = `/order/share-certificate?src=${encodeURIComponent(src)}`;
  };

  return (
    <div
      style={{
        margin: "0 0 1.5rem",
        padding: "1.25rem 1.5rem",
        borderRadius: "0.75rem",
        border: "1px solid var(--gold)",
        background: "linear-gradient(135deg, rgba(212,175,55,0.10) 0%, rgba(212,175,55,0.04) 100%)",
      }}
    >
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "0.75rem" }}>
        <span
          style={{
            width: "2rem", height: "2rem",
            borderRadius: "0.5rem",
            background: "var(--gold-dim)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden
        >
          <ShieldCheck size={16} style={{ color: "var(--gold)" }} />
        </span>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: "0.68rem",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              color: "var(--gold)",
              fontWeight: 700,
            }}
          >
            Order a share certificate
          </div>
          <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", marginTop: "0.15rem", lineHeight: 1.3 }}>
            Search your corporation to start
          </div>
        </div>
      </div>

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
              {results.slice(0, 5).map((hit, i) => (
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
                    <ArrowRight size={14} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.25rem" }} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {searchErr && !dropdownOpen && (
        <p style={{ fontSize: "0.8rem", color: "#B91C1C", margin: "0.5rem 0 0" }}>{searchErr}</p>
      )}

      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.75rem 0 0", lineHeight: 1.5 }}>
        $49 all-in + GST · certificate + share register + securities register updates · delivered as signable PDFs in 1 business day.
      </p>
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
  top: "100%",
  left: 0,
  right: 0,
  marginTop: "0.25rem",
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.4rem",
  boxShadow: "0 8px 24px rgba(0, 61, 91, 0.15)",
  maxHeight: "320px",
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
