"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";

/**
 * Alberta corporation search with debounced-dropdown UX. Uses only the DB
 * (via /api/registrar/search) — no live registry / Places calls happen at
 * autocomplete time. Selecting a result navigates to the profile page,
 * where the live calls fire.
 */

type Hit = {
  corpNumber:    string;
  slug:          string;
  name:          string;
  entityType:    string;
  status:        string;
  lastEventDate: string | null;
  lastIssueDate: string | null;
  city:          string;
  isNameShell:   boolean;
};

const JURISDICTIONS = [
  { key: "alberta", label: "Alberta",              enabled: true  },
  { key: "bc",      label: "British Columbia",     enabled: false },
  { key: "on",      label: "Ontario",              enabled: false },
  { key: "federal", label: "Federal",              enabled: false },
];

export default function AlbertaSearchIsland() {
  const [query, setQuery]     = useState("");
  const [jur, setJur]         = useState("alberta");
  const [results, setResults] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const [focused, setFocused] = useState(-1);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  /* Close dropdown on outside click */
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounce.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res  = await fetch(`/api/registrar/search?q=${encodeURIComponent(query)}&limit=12`);
        const data = await res.json();
        setResults(data.results ?? []);
        setOpen(true);
        setFocused(-1);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  function pick(hit: Hit) {
    if (!hit.slug) return;
    window.location.href = `/corporation/${hit.slug}`;
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setFocused((f) => Math.min(results.length - 1, f + 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setFocused((f) => Math.max(0, f - 1)); }
    if (e.key === "Enter" && focused >= 0) { e.preventDefault(); pick(results[focused]); }
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <div ref={wrapperRef} style={{ position: "relative", maxWidth: 720, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          gap: 0,
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)",
          overflow: "hidden",
          alignItems: "stretch",
        }}
      >
        <select
          value={jur}
          onChange={(e) => setJur(e.target.value)}
          style={{
            padding: "0.85rem 0.75rem",
            border: "none", background: "var(--bg-deep)",
            fontSize: "0.9rem", color: "var(--text)",
            fontFamily: "inherit", cursor: "pointer",
            borderRight: "1px solid var(--border)",
            minWidth: 130,
          }}
        >
          {JURISDICTIONS.map((j) => (
            <option key={j.key} value={j.key} disabled={!j.enabled}>
              {j.label}{!j.enabled ? " (soon)" : ""}
            </option>
          ))}
        </select>

        <div style={{ flex: 1, position: "relative", display: "flex", alignItems: "center" }}>
          <Search size={16} style={{ position: "absolute", left: "0.9rem", color: "var(--text-muted)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onKeyDown={onKey}
            placeholder="Business Name or Corporate Access Number…"
            style={{
              flex: 1,
              padding: "0.85rem 0.85rem 0.85rem 2.4rem",
              border: "none",
              fontSize: "0.95rem",
              background: "var(--card)",
              color: "var(--text)",
              outline: "none",
            }}
            autoComplete="off"
          />
          {loading && <Loader2 size={14} className="crs-spin" style={{ position: "absolute", right: "1rem", color: "var(--text-muted)" }} />}
        </div>

        <button
          onClick={() => results.length > 0 && pick(results[0])}
          disabled={!results.length}
          style={{
            padding: "0.85rem 1.35rem",
            border: "none", background: "var(--primary)", color: "#fff",
            fontWeight: 700, fontSize: "0.88rem",
            cursor: results.length ? "pointer" : "not-allowed",
            opacity: results.length ? 1 : 0.5,
            whiteSpace: "nowrap",
          }}
        >
          Start Filing Now
        </button>
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden", zIndex: 20,
          maxHeight: 400, overflowY: "auto",
        }}>
          {results.map((h, i) => (
            <button
              key={h.slug || `${h.name}-${i}`}
              onClick={() => pick(h)}
              onMouseEnter={() => setFocused(i)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "0.7rem 1rem",
                background: focused === i ? "var(--card-hover)" : "transparent",
                border: "none",
                borderBottom: i < results.length - 1 ? "1px solid var(--border)" : "none",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)" }}>
                {h.name}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem", fontFamily: "var(--font-mono), monospace" }}>
                {h.corpNumber && <span>#{h.corpNumber}</span>}
                {h.city && <span>{h.city}</span>}
                {h.entityType && <span>{h.entityType}</span>}
                {h.status && (
                  <span style={{
                    padding: "0.05rem 0.5rem",
                    borderRadius: "9999px",
                    background: statusPillBg(h.status),
                    color: statusPillColor(h.status),
                    border: `1px solid ${statusPillColor(h.status)}`,
                    fontWeight: 600, fontSize: "0.68rem",
                  }}>
                    {h.status}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && query.trim().length >= 2 && !loading && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0,
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)", padding: "1rem",
          color: "var(--text-muted)", fontSize: "0.85rem", textAlign: "center",
          zIndex: 20,
        }}>
          No matches. Try the exact registered name or corporate access number.
        </div>
      )}
    </div>
  );
}

function statusPillColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("active") || s === "incorporated" || s === "registered") return "var(--secondary)";
  if (s.includes("liable"))    return "#B45309";
  if (s.includes("struck") || s.includes("dissolved")) return "#991B1B";
  return "var(--text-muted)";
}
function statusPillBg(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("active") || s === "incorporated" || s === "registered") return "rgba(42,125,143,0.10)";
  if (s.includes("liable"))    return "rgba(180,83,9,0.10)";
  if (s.includes("struck") || s.includes("dissolved")) return "rgba(153,27,27,0.10)";
  return "rgba(0,0,0,0.05)";
}
