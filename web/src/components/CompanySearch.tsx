"use client";

import { useState, useRef, useEffect } from "react";
import { Search, CheckCircle2, Clock, ArrowRight, AlertCircle } from "lucide-react";

const REGISTRIES = [
  { key: "bc",      label: "British Columbia",      live: true  },
  { key: "ab",      label: "Alberta",               live: false },
  { key: "on",      label: "Ontario",               live: false },
  { key: "federal", label: "Federal",               live: false },
  { key: "mb",      label: "Manitoba",              live: false },
  { key: "sk",      label: "Saskatchewan",          live: false },
  { key: "ns",      label: "Nova Scotia",           live: false },
  { key: "nb",      label: "New Brunswick",         live: false },
  { key: "nl",      label: "Newfoundland",          live: false },
  { key: "pe",      label: "Prince Edward Island",  live: false },
  { key: "nt",      label: "Northwest Territories", live: false },
  { key: "yt",      label: "Yukon",                 live: false },
  { key: "nu",      label: "Nunavut",               live: false },
];

const PREFIX_MAP: Record<string, string> = {
  BC: "bc", AB: "ab", ON: "on", MB: "mb", SK: "sk",
  NS: "ns", NB: "nb", NL: "nl", NF: "nl", PE: "pe",
  PEI: "pe", NT: "nt", YT: "yt", YK: "yt", NU: "nu",
};

function detectProvince(q: string): string | null {
  const upper = q.trim().toUpperCase().replace(/\s/g, "");
  for (const [prefix, key] of Object.entries(PREFIX_MAP)) {
    if (upper.startsWith(prefix) && /\d/.test(upper.slice(prefix.length, prefix.length + 1))) {
      return key;
    }
  }
  return null;
}

interface Result {
  name: string;
  registrationNumber: string;
  status: string;
  entityType: string;
  registrationDate: string;
  jurisdiction: string;
  provinceKey: string;
}

export default function CompanySearch() {
  const [query, setQuery]           = useState("");
  const [results, setResults]       = useState<Result[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [searched, setSearched]     = useState(false);
  const [detectedProvince, setDetectedProvince] = useState<string | null>(null);
  const [comingSoon, setComingSoon] = useState(false);
  const [error, setError]           = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const detected = detectProvince(query);
    setDetectedProvince(detected);
  }, [query]);

  async function doSearch(q: string) {
    if (q.trim().length < 2) return;
    setLoading(true);
    setSearched(true);
    setError("");
    setComingSoon(false);

    const detected = detectProvince(q);
    const province = detected ?? "all";

    if (detected && !REGISTRIES.find((r) => r.key === detected)?.live) {
      setResults([]);
      setTotal(0);
      setComingSoon(true);
      setLoading(false);
      return;
    }

    try {
      const res  = await fetch(`/api/company-search?q=${encodeURIComponent(q)}&province=${province}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError("Search temporarily unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounce.current) clearTimeout(debounce.current);
    if (val.trim().length >= 2) {
      debounce.current = setTimeout(() => doSearch(val), 450);
    } else {
      setSearched(false);
      setResults([]);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounce.current) clearTimeout(debounce.current);
    doSearch(query);
  }

  const detectedRegistry = detectedProvince ? REGISTRIES.find((r) => r.key === detectedProvince) : null;

  return (
    <div>
      {/* Search bar */}
      <form onSubmit={handleSubmit} style={{ position: "relative", marginBottom: "1.5rem" }}>
        <Search
          size={18}
          style={{
            position: "absolute", left: "1rem", top: "50%",
            transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none",
          }}
        />
        <input
          type="text"
          value={query}
          onChange={handleInput}
          placeholder="Search by company name, registration number, or business number..."
          className="field-input"
          style={{ paddingLeft: "2.75rem", paddingRight: "7rem", fontSize: "1rem", height: "3rem" }}
          autoComplete="off"
        />
        <button
          type="submit"
          className="btn-primary"
          style={{ position: "absolute", right: "0.375rem", top: "50%", transform: "translateY(-50%)", height: "2.25rem", fontSize: "0.82rem" }}
        >
          Search
        </button>
      </form>

      {/* Province detection hint */}
      {detectedRegistry && query.length >= 2 && (
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.375rem",
            fontSize: "0.78rem", color: detectedRegistry.live ? "var(--secondary)" : "var(--text-muted)",
            marginBottom: "1.25rem", fontFamily: "var(--font-mono), monospace",
          }}
        >
          <span
            style={{
              width: "6px", height: "6px", borderRadius: "50%",
              background: detectedRegistry.live ? "var(--secondary)" : "var(--text-muted)",
              flexShrink: 0,
            }}
          />
          Detected: {detectedRegistry.label} registry
          {!detectedRegistry.live && " — integration coming soon"}
        </div>
      )}

      {/* Registry coverage grid */}
      <div style={{ marginBottom: "2rem" }}>
        <div
          style={{
            fontSize: "0.7rem", fontFamily: "var(--font-mono), monospace",
            textTransform: "uppercase", letterSpacing: "0.06em",
            color: "var(--text-muted)", marginBottom: "0.625rem",
          }}
        >
          Registry Coverage
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
          {REGISTRIES.map((r) => (
            <span
              key={r.key}
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.3rem",
                padding: "0.2rem 0.6rem", borderRadius: "9999px",
                border: `1px solid ${r.live ? "var(--secondary)" : "var(--border)"}`,
                background: r.live ? "rgba(42,125,143,0.08)" : "var(--bg)",
                fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace",
                color: r.live ? "var(--secondary)" : "var(--text-muted)",
                whiteSpace: "nowrap",
              }}
            >
              {r.live
                ? <CheckCircle2 size={10} style={{ color: "var(--secondary)" }} />
                : <Clock size={10} />
              }
              {r.label}
            </span>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-muted)", fontSize: "0.875rem" }}>
          Searching registries…
        </div>
      )}

      {/* Coming soon notice */}
      {!loading && comingSoon && detectedRegistry && (
        <div
          style={{
            padding: "1.5rem", borderRadius: "0.75rem",
            border: "1.5px solid var(--border)", background: "var(--card)",
            borderLeft: "3px solid var(--gold)",
          }}
        >
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
            <AlertCircle size={18} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.1rem" }} />
            <div>
              <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: "0.375rem", fontSize: "0.95rem" }}>
                {detectedRegistry.label} registry search coming soon
              </div>
              <p style={{ fontSize: "0.83rem", color: "var(--text-muted)", margin: "0 0 1rem" }}>
                We haven't connected the {detectedRegistry.label} registry API yet, but our team retrieves
                records directly — typically within 1 hour.
              </p>
              <a
                href={`/#hero`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.35rem",
                  padding: "0.5rem 1rem", borderRadius: "0.5rem",
                  background: "var(--primary)", color: "#fff",
                  fontSize: "0.82rem", fontWeight: 600, textDecoration: "none",
                }}
              >
                Order a Profile Report <ArrowRight size={13} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
          {error}
        </div>
      )}

      {/* Results */}
      {!loading && !error && !comingSoon && searched && (
        <>
          {results.length > 0 ? (
            <>
              <div
                style={{
                  fontSize: "0.75rem", fontFamily: "var(--font-mono), monospace",
                  color: "var(--text-muted)", marginBottom: "0.875rem",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}
              >
                {total.toLocaleString()} result{total !== 1 ? "s" : ""} — showing {results.length}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                {results.map((r, i) => (
                  <div
                    key={i}
                    style={{
                      background: "var(--card)", border: "1px solid var(--border)",
                      borderRadius: "0.75rem", padding: "1rem 1.125rem",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      gap: "1rem", flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
                        <span style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.95rem" }}>
                          {r.name}
                        </span>
                        <span
                          style={{
                            fontSize: "0.68rem", fontWeight: 600, padding: "0.1rem 0.45rem",
                            borderRadius: "9999px", fontFamily: "var(--font-mono), monospace",
                            background: r.status === "Active" ? "rgba(42,125,143,0.1)" : "rgba(0,0,0,0.06)",
                            color: r.status === "Active" ? "var(--secondary)" : "var(--text-muted)",
                            border: `1px solid ${r.status === "Active" ? "var(--secondary)" : "var(--border)"}`,
                          }}
                        >
                          {r.status}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex", flexWrap: "wrap", gap: "0.75rem",
                          fontSize: "0.75rem", color: "var(--text-muted)",
                          fontFamily: "var(--font-mono), monospace",
                        }}
                      >
                        {r.registrationNumber && <span>#{r.registrationNumber}</span>}
                        {r.entityType        && <span>{r.entityType}</span>}
                        {r.registrationDate  && <span>Registered {r.registrationDate}</span>}
                        <span>{r.jurisdiction}</span>
                      </div>
                    </div>
                    <a
                      href={`/#hero`}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "0.3rem",
                        padding: "0.45rem 0.875rem", borderRadius: "0.5rem",
                        border: "1.5px solid var(--border)", background: "var(--bg)",
                        color: "var(--text)", fontSize: "0.78rem", fontWeight: 500,
                        textDecoration: "none", whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--gold)";
                        (e.currentTarget as HTMLElement).style.color = "var(--gold)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                        (e.currentTarget as HTMLElement).style.color = "var(--text)";
                      }}
                    >
                      Order Profile Report <ArrowRight size={12} />
                    </a>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div
              style={{
                textAlign: "center", padding: "3rem 1.5rem",
                background: "var(--card)", border: "1px solid var(--border)",
                borderRadius: "0.75rem",
              }}
            >
              <div style={{ fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.5rem", fontWeight: 500 }}>
                No results found for &ldquo;{query}&rdquo;
              </div>
              <p style={{ fontSize: "0.83rem", color: "var(--text-muted)", margin: "0 0 1.25rem" }}>
                Try a different spelling, or let our team search for you directly.
              </p>
              <a
                href="/#hero"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.35rem",
                  padding: "0.5rem 1rem", borderRadius: "0.5rem",
                  background: "var(--primary)", color: "#fff",
                  fontSize: "0.82rem", fontWeight: 600, textDecoration: "none",
                }}
              >
                Request a manual search <ArrowRight size={13} />
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
