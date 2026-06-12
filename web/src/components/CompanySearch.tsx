"use client";

import { useState, useRef, useEffect } from "react";
import { Search, SlidersHorizontal, ArrowRight, CheckCircle2 } from "lucide-react";
import dynamic from "next/dynamic";

const WizardModal = dynamic(() => import("./WizardModal"), { ssr: false });

const REGISTRIES = [
  { key: "all",     label: "All Provinces"          },
  { key: "bc",      label: "British Columbia"        },
  { key: "ab",      label: "Alberta"                 },
  { key: "on",      label: "Ontario"                 },
  { key: "federal", label: "Federal"                 },
  { key: "mb",      label: "Manitoba"                },
  { key: "sk",      label: "Saskatchewan"            },
  { key: "ns",      label: "Nova Scotia"             },
  { key: "nb",      label: "New Brunswick"           },
  { key: "nl",      label: "Newfoundland"            },
  { key: "pe",      label: "Prince Edward Island"    },
  { key: "nt",      label: "Northwest Territories"   },
  { key: "yt",      label: "Yukon"                   },
  { key: "nu",      label: "Nunavut"                 },
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
  name:             string;
  businessNumber:   string;
  registryId:       string;
  location:         string;
  status:           string;
  statusNotes:      string;
  entityType:       string;
  registrationDate: string;
  jurisdiction:     string;
  provinceKey:      string;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: "0.25rem", fontSize: "0.82rem", lineHeight: 1.5 }}>
      <span style={{ color: "var(--text-muted)", whiteSpace: "nowrap" }}>{label}:</span>
      <span style={{ color: "var(--text)", fontWeight: value && value !== "-" ? 500 : 400 }}>
        {value || "—"}
      </span>
    </div>
  );
}

export default function CompanySearch() {
  const [query, setQuery]             = useState("");
  const [province, setProvince]       = useState("all");
  const [results, setResults]         = useState<Result[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(false);
  const [searched, setSearched]       = useState(false);
  const [error, setError]             = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [wizardOpen, setWizardOpen]   = useState(false);
  const [wizardPreload, setWizardPreload] = useState<{ companyName?: string; jurisdictionKey?: string } | undefined>();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const detected = detectProvince(query);
    if (detected) setProvince(detected);
  }, [query]);

  async function doSearch(q: string, prov: string) {
    if (q.trim().length < 2) return;
    setLoading(true);
    setSearched(true);
    setError("");
    try {
      const res  = await fetch(`/api/company-search?q=${encodeURIComponent(q)}&province=${prov}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError("Search temporarily unavailable. Please try again.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounce.current) clearTimeout(debounce.current);
    if (val.trim().length >= 2) {
      debounce.current = setTimeout(() => doSearch(val, province), 450);
    } else {
      setSearched(false);
      setResults([]);
    }
  }

  function handleProvinceChange(key: string) {
    setProvince(key);
    if (query.trim().length >= 2) doSearch(query, key);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounce.current) clearTimeout(debounce.current);
    doSearch(query, province);
  }

  return (
    <div>
      {wizardOpen && <WizardModal onClose={() => { setWizardOpen(false); setWizardPreload(undefined); }} preload={wizardPreload} />}
      {/* Search bar */}
      <form onSubmit={handleSubmit} style={{ position: "relative", marginBottom: "0.875rem" }}>
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
          placeholder="Search by company name, business number, or registry ID…"
          className="field-input"
          style={{ paddingLeft: "2.75rem", paddingRight: "7.5rem", fontSize: "0.975rem", height: "3rem" }}
          autoComplete="off"
          autoFocus
        />
        <button
          type="submit"
          className="btn-primary"
          style={{ position: "absolute", right: "0.375rem", top: "50%", transform: "translateY(-50%)", height: "2.25rem", fontSize: "0.82rem" }}
        >
          Search
        </button>
      </form>

      {/* Filter row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.35rem",
            background: showFilters ? "var(--bg-deep)" : "none",
            border: "1.5px solid var(--border)", borderRadius: "0.375rem",
            padding: "0.3rem 0.7rem", fontSize: "0.75rem", cursor: "pointer",
            color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace",
            textTransform: "uppercase", letterSpacing: "0.05em", transition: "background 0.12s",
          }}
        >
          <SlidersHorizontal size={11} />
          Filter by province
        </button>

        {province !== "all" && (
          <>
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.3rem",
                fontSize: "0.75rem", fontFamily: "var(--font-mono), monospace",
                color: "var(--secondary)", background: "rgba(42,125,143,0.08)",
                border: "1px solid var(--secondary)", padding: "0.25rem 0.65rem", borderRadius: "9999px",
              }}
            >
              <CheckCircle2 size={10} />
              {REGISTRIES.find((r) => r.key === province)?.label}
            </span>
            <button
              onClick={() => handleProvinceChange("all")}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: "0.72rem", color: "var(--text-muted)", textDecoration: "underline",
                fontFamily: "var(--font-mono), monospace",
              }}
            >
              clear
            </button>
          </>
        )}

        {searched && !loading && (
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginLeft: "auto" }}>
            {total.toLocaleString()} result{total !== 1 ? "s" : ""}
            {province !== "all" && ` · ${REGISTRIES.find((r) => r.key === province)?.label}`}
          </span>
        )}
      </div>

      {/* Province filter grid */}
      {showFilters && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", marginBottom: "1.25rem" }}>
          {REGISTRIES.map((r) => {
            const active = province === r.key;
            return (
              <button
                key={r.key}
                onClick={() => handleProvinceChange(r.key)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.3rem",
                  padding: "0.25rem 0.7rem", borderRadius: "9999px",
                  border: `1.5px solid ${active ? "var(--primary)" : "var(--border)"}`,
                  background: active ? "var(--primary)" : "var(--bg)",
                  fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace",
                  color: active ? "#fff" : "var(--text-muted)",
                  cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.12s",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-muted)", fontSize: "0.875rem" }}>
          Searching registries…
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
          {error}
        </div>
      )}

      {/* Results */}
      {!loading && !error && searched && results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {results.map((r, i) => (
            <div
              key={i}
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderLeft: `3px solid ${r.status === "Active" ? "var(--secondary)" : "var(--border)"}`,
                borderRadius: "0.75rem",
                padding: "1.125rem 1.25rem",
              }}
            >
              {/* Company name + status badge */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontFamily: "var(--font-display), Georgia, serif",
                    fontSize: "1.05rem", fontWeight: 700,
                    color: "var(--primary)",
                  }}
                >
                  {r.name}
                </span>
                <span
                  style={{
                    fontSize: "0.68rem", fontWeight: 600, padding: "0.15rem 0.5rem",
                    borderRadius: "9999px", fontFamily: "var(--font-mono), monospace",
                    background: r.status === "Active" ? "rgba(42,125,143,0.1)" : "rgba(0,0,0,0.05)",
                    color: r.status === "Active" ? "var(--secondary)" : "var(--text-muted)",
                    border: `1px solid ${r.status === "Active" ? "var(--secondary)" : "var(--border)"}`,
                  }}
                >
                  {r.status}
                </span>
              </div>

              {/* Details grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "0.25rem 2rem",
                  marginBottom: "1rem",
                }}
              >
                <Field label="Business Number (BN)" value={r.businessNumber || "—"} />
                <Field label="Registry ID"           value={r.registryId     || "—"} />
                <Field label="Registered Office"     value={r.location       || "—"} />
                <Field label="Status"                value={r.status} />
                <Field label="Status Notes"          value={r.statusNotes    || "—"} />
                <Field label="Business Type"         value={r.entityType     || "—"} />
                <Field label="Created"               value={r.registrationDate || "—"} />
                <Field label="Jurisdiction"          value={r.jurisdiction   || "—"} />
              </div>

              {/* CTA */}
              <div
                style={{
                  borderTop: "1px solid var(--border)",
                  paddingTop: "0.75rem",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  flexWrap: "wrap", gap: "0.5rem",
                }}
              >
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  For the complete profile, request a service through our portal.
                </span>
                <button
                  onClick={() => { setWizardPreload({ companyName: r.name, jurisdictionKey: r.provinceKey }); setWizardOpen(true); }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "0.35rem",
                    padding: "0.4rem 0.9rem", borderRadius: "0.5rem",
                    background: "var(--primary)", color: "#fff",
                    fontSize: "0.78rem", fontWeight: 600,
                    border: "none", cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  Request a service <ArrowRight size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No results */}
      {!loading && !error && searched && results.length === 0 && (
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
            Try a different spelling, or let our team search directly.
          </p>
          <button
            onClick={() => { setWizardPreload(undefined); setWizardOpen(true); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.35rem",
              padding: "0.5rem 1rem", borderRadius: "0.5rem",
              background: "var(--primary)", color: "#fff",
              fontSize: "0.82rem", fontWeight: 600,
              border: "none", cursor: "pointer",
            }}
          >
            Request a manual search <ArrowRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
