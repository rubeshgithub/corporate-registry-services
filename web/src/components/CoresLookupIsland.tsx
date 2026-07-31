"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, ArrowRight, Building2 } from "lucide-react";

/**
 * Inline corporation lookup widget for the
 * /articles/what-is-cores-alberta article page.
 *
 * User types corp name / corp number in the search box → we
 * debounce-lookup against /api/company-search and render an
 * autocomplete dropdown. Clicking a match redirects to
 * /order/corporate-search with the corporation name in the `q`
 * query parameter, where NameSearchOrderFlow auto-populates
 * the proposed name field.
 */

const DEBOUNCE_MS = 400;
const MIN_QUERY = 2;

type RegistryHit = {
  name: string;
  businessNumber: string;
  registryId: string;
  location: string;
  status: "Active" | "Inactive";
  statusNotes: string;
  entityType: string;
  registrationDate: string;
  jurisdiction: string;
  provinceKey: string;
};

export default function CoresLookupIsland({ src = "article-what-is-cores-alberta" }: { src?: string }) {
  const [q, setQ] = useState("");
  const [province, setProvince] = useState("ab"); // CORES is Alberta-specific
  const [results, setResults] = useState<RegistryHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

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
        const res = await fetch(
          `/api/company-search?q=${encodeURIComponent(query)}&province=${province}`
        );
        const data = await res.json();
        if (myToken !== searchToken.current) return;
        const hits: RegistryHit[] = data.results ?? [];
        setResults(hits);
        setDropdownOpen(true);
        if (!hits.length)
          setSearchErr("No matches — try the exact legal name or corporation number.");
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
    params.set("q", hit.name);
    params.set("src", src);
    window.location.href = `/order/corporate-search?${params.toString()}`;
  };

  return (
    <div
      style={{
        margin: "0 0 2rem",
        padding: "2rem 1.75rem",
        borderRadius: "0.75rem",
        border: "1px solid var(--gold)",
        background: "linear-gradient(135deg, rgba(212,175,55,0.12) 0%, rgba(212,175,55,0.05) 100%)",
        boxShadow: "0 4px 12px rgba(212,175,55,0.08)",
      }}
    >
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", marginBottom: "1.25rem" }}>
        <span
          style={{
            width: "2.5rem",
            height: "2.5rem",
            borderRadius: "0.6rem",
            background: "var(--gold-dim)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden
        >
          <Building2 size={18} style={{ color: "var(--gold)" }} />
        </span>
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: "0.7rem",
              textTransform: "uppercase",
              letterSpacing: "0.09em",
              color: "var(--gold)",
              fontWeight: 700,
              marginBottom: "0.25rem",
            }}
          >
            Search the Alberta Registry
          </div>
          <div
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              fontSize: "1.35rem",
              fontWeight: 700,
              color: "var(--text)",
              lineHeight: 1.3,
            }}
          >
            Check your corporation's status
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", position: "relative" }}>
        <div style={{ flex: "1 1 100%", position: "relative", minWidth: 0 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => {
              if (results.length) setDropdownOpen(true);
            }}
            placeholder="Company name or corporation number"
            style={{
              ...inputStyle,
              fontSize: "1rem",
              padding: "0.85rem 1rem",
            }}
            disabled={redirecting}
            autoComplete="off"
          />
          {(searching || redirecting) && (
            <Loader2
              size={18}
              className="crs-spin"
              style={{
                position: "absolute",
                right: 14,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--gold)",
              }}
            />
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
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.95rem" }}>
                        {hit.name}
                      </div>
                      <div
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--text-muted)",
                          marginTop: "0.2rem",
                          display: "flex",
                          gap: "0.5rem",
                          flexWrap: "wrap",
                        }}
                      >
                        {hit.registryId && <span>#{hit.registryId}</span>}
                        {hit.location && <span>{hit.location}</span>}
                        <span
                          style={{
                            fontSize: "0.72rem",
                            fontWeight: 600,
                            padding: "0.2rem 0.5rem",
                            borderRadius: "3px",
                            background:
                              hit.status === "Active"
                                ? "rgba(34,197,94,0.15)"
                                : "rgba(107,114,128,0.15)",
                            color: hit.status === "Active" ? "#16a34a" : "#6b7280",
                          }}
                        >
                          {hit.status}
                        </span>
                      </div>
                    </div>
                    <ArrowRight
                      size={16}
                      style={{
                        color: "var(--gold)",
                        flexShrink: 0,
                        marginTop: "0.35rem",
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {searchErr && !dropdownOpen && (
        <p style={{ fontSize: "0.85rem", color: "#B91C1C", margin: "0.75rem 0 0" }}>
          {searchErr}
        </p>
      )}

      <p
        style={{
          fontSize: "0.82rem",
          color: "var(--text-muted)",
          margin: "1rem 0 0",
          lineHeight: 1.5,
        }}
      >
        Check the incorporation status, directors, address, and more. Results are pulled directly
        from the Alberta Registry and updated in real-time.
      </p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.85rem",
  border: "1.5px solid var(--gold)",
  borderRadius: "0.5rem",
  fontSize: "0.92rem",
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "inherit",
  transition: "all 0.2s ease",
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  marginTop: "0.35rem",
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  boxShadow: "0 12px 32px rgba(0, 61, 91, 0.2)",
  maxHeight: "400px",
  overflowY: "auto",
  zIndex: 20,
};

const dropdownItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "0.9rem 1rem",
  border: "none",
  borderBottom: "1px solid var(--border)",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  color: "var(--text)",
  transition: "background-color 0.15s ease",
};
