"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";

/**
 * High-conversion registry status search widget for article pages.
 *
 * Psychology-driven design that uses:
 * - Urgency & FOMO (deadline language, "check now")
 * - Risk framing (penalties, compliance)
 * - Social proof (thousands have checked)
 * - Immediate value (see status in seconds)
 * - Visual dominance (color, size, shadow)
 * - Emotional triggers (peace of mind, confidence)
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

type SearchConfig = {
  province: string;
  eyebrow: string;           // e.g. "Check Status Now"
  headline: string;          // e.g. "Know Your Filing Deadline"
  subheadline: string;       // e.g. "See your compliance status in 5 seconds"
  urgencyBadge?: string;     // e.g. "⚠ Deadlines matter"
  riskText?: string;         // e.g. "Avoid $500+ penalties"
  trustText?: string;        // e.g. "Direct from the government registry"
};

export default function RegistryStatusSearchIsland({ config }: { config: SearchConfig }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<RegistryHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [interacted, setInteracted] = useState(false);

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
          `/api/company-search?q=${encodeURIComponent(query)}&province=${config.province}`
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
  }, [q, config.province]);

  const pickAndGo = (hit: RegistryHit) => {
    setRedirecting(true);
    const params = new URLSearchParams();
    params.set("q", hit.name);
    params.set("src", `article-status-search-${config.province}`);
    window.location.href = `/order/corporate-search?${params.toString()}`;
  };

  return (
    <div
      style={{
        margin: "0 0 2.5rem",
        padding: "2.25rem 1.75rem",
        borderRadius: "0.8rem",
        border: "2px solid #D97706", // Amber/orange for urgency
        background: "linear-gradient(135deg, rgba(217,119,6,0.08) 0%, rgba(217,119,6,0.02) 100%)",
        boxShadow: "0 8px 24px rgba(217,119,6,0.15), inset 0 1px 0 rgba(255,255,255,0.2)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Accent line at top for psychological weight */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "3px",
          background: "linear-gradient(90deg, #D97706 0%, #F97316 50%, #D97706 100%)",
        }}
      />

      {/* Header section with urgency signals */}
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", marginBottom: "1.5rem" }}>
        {/* Icon with animation potential */}
        <span
          style={{
            width: "2.75rem",
            height: "2.75rem",
            borderRadius: "0.7rem",
            background: "linear-gradient(135deg, #D97706 0%, #F97316 100%)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: "0 4px 12px rgba(217,119,6,0.3)",
          }}
          aria-hidden
        >
          <Search size={20} style={{ color: "#FFFFFF" }} />
        </span>

        <div style={{ flex: 1 }}>
          {/* Urgency badge */}
          {config.urgencyBadge && (
            <div
              style={{
                display: "inline-block",
                fontSize: "0.7rem",
                fontFamily: "var(--font-mono), monospace",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "#D97706",
                fontWeight: 700,
                marginBottom: "0.4rem",
              }}
            >
              {config.urgencyBadge}
            </div>
          )}

          {/* Main headline - larger and more compelling */}
          <div
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--text)",
              lineHeight: 1.2,
              marginBottom: "0.35rem",
            }}
          >
            {config.headline}
          </div>

          {/* Subheadline - value proposition + speed */}
          <div
            style={{
              fontSize: "0.9rem",
              color: "var(--text-muted)",
              lineHeight: 1.4,
              marginBottom: "0.5rem",
            }}
          >
            {config.subheadline}
          </div>

          {/* Risk/pain point */}
          {config.riskText && (
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                fontSize: "0.85rem",
                color: "#B91C1C",
                fontWeight: 500,
              }}
            >
              <AlertCircle size={14} style={{ flexShrink: 0 }} />
              <span>{config.riskText}</span>
            </div>
          )}
        </div>
      </div>

      {/* Search box - prominent and inviting */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", position: "relative", marginBottom: "1rem" }}>
        <div style={{ flex: "1 1 100%", position: "relative", minWidth: 0 }}>
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (!interacted) setInteracted(true);
            }}
            onFocus={() => {
              setInteracted(true);
              if (results.length) setDropdownOpen(true);
            }}
            placeholder="Enter your company name or corporation number"
            style={{
              ...inputStyle,
              fontSize: "1.05rem",
              padding: "1rem 1rem 1rem 1rem",
              boxShadow: interacted
                ? "0 0 0 3px rgba(217,119,6,0.15), inset 0 1px 2px rgba(0,0,0,0.05)"
                : "inset 0 1px 2px rgba(0,0,0,0.05)",
            }}
            disabled={redirecting}
            autoComplete="off"
          />
          {(searching || redirecting) && (
            <Loader2
              size={20}
              className="crs-spin"
              style={{
                position: "absolute",
                right: 16,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#D97706",
              }}
            />
          )}

          {/* Results dropdown */}
          {dropdownOpen && results.length > 0 && !redirecting && (
            <div style={dropdownStyle}>
              {results.slice(0, 6).map((hit, i) => (
                <button
                  key={`${hit.provinceKey}-${hit.registryId}-${i}`}
                  type="button"
                  onClick={() => pickAndGo(hit)}
                  style={{
                    ...dropdownItemStyle,
                    borderBottom: i < results.length - 1 ? "1px solid var(--border)" : "none",
                  }}
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
                          marginTop: "0.25rem",
                          display: "flex",
                          gap: "0.75rem",
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        {hit.registryId && <span>#{hit.registryId}</span>}
                        {hit.location && <span>{hit.location}</span>}
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            padding: "0.25rem 0.6rem",
                            borderRadius: "3px",
                            background:
                              hit.status === "Active"
                                ? "rgba(34,197,94,0.2)"
                                : "rgba(107,114,128,0.15)",
                            color: hit.status === "Active" ? "#16a34a" : "#6b7280",
                          }}
                        >
                          {hit.status === "Active" ? (
                            <CheckCircle2 size={10} />
                          ) : (
                            <AlertCircle size={10} />
                          )}
                          {hit.status}
                        </span>
                      </div>
                    </div>
                    <ArrowRight
                      size={18}
                      style={{
                        color: "#D97706",
                        flexShrink: 0,
                        marginTop: "0.25rem",
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Error message */}
      {searchErr && !dropdownOpen && (
        <p style={{ fontSize: "0.85rem", color: "#B91C1C", margin: "0 0 1rem" }}>
          {searchErr}
        </p>
      )}

      {/* Trust & credibility footer */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
          fontSize: "0.8rem",
          color: "var(--text-muted)",
          paddingTop: "0.5rem",
          borderTop: "1px solid rgba(217,119,6,0.1)",
        }}
      >
        <CheckCircle2 size={14} style={{ color: "#16a34a", flexShrink: 0 }} />
        <span>
          {config.trustText || "Direct from the government registry — real-time data"}
        </span>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.85rem",
  border: "1.5px solid #D97706",
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
  marginTop: "0.4rem",
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  boxShadow: "0 16px 40px rgba(0, 0, 0, 0.15)",
  maxHeight: "400px",
  overflowY: "auto",
  zIndex: 20,
};

const dropdownItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "1rem",
  border: "none",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  color: "var(--text)",
  transition: "background-color 0.15s ease",
};
