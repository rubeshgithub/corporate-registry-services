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

type PillTone = "teal" | "gold" | "navy";
const PILL_TONES: Record<PillTone, { bg: string; color: string; border: string }> = {
  teal: { bg: "rgba(42,125,143,0.10)", color: "var(--secondary)", border: "rgba(42,125,143,0.35)" },
  gold: { bg: "var(--gold-dim)",       color: "var(--gold)",      border: "rgba(249,172,0,0.45)"  },
  navy: { bg: "rgba(0,61,91,0.08)",    color: "var(--primary)",   border: "rgba(0,61,91,0.25)"    },
};

function MetaPill({ label, value, tone }: { label: string; value: string; tone: PillTone }) {
  if (!value || value === "—") return null;
  const t = PILL_TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: "0.35rem",
        padding: "0.22rem 0.6rem",
        borderRadius: "9999px",
        background: t.bg,
        border: `1px solid ${t.border}`,
        fontFamily: "var(--font-mono), monospace",
        fontSize: "0.7rem",
        lineHeight: 1.4,
      }}
    >
      <span style={{ color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.62rem" }}>
        {label}
      </span>
      <span style={{ color: t.color, fontWeight: 700 }}>
        {value}
      </span>
    </span>
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
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Build a deep-link into an order flow that skips the lookup step. */
  function orderHref(service: "profile-report" | "good-standing" | "annual-return", r: Result) {
    const params = new URLSearchParams();
    if (r.name)        params.set("q",           r.name);
    if (r.provinceKey) params.set("jurisdiction", r.provinceKey);
    if (r.registryId)  params.set("registryId",  r.registryId);
    params.set("src", "corp-search");
    return `/order/${service}?${params.toString()}`;
  }

  useEffect(() => {
    const detected = detectProvince(query);
    if (detected) setProvince(detected);
  }, [query]);

  /** Fire an intentional-search analytics beacon. Debounced auto-searches
      skip this; only explicit submits and filter changes call it, so the
      signal reflects real user queries rather than every keystroke. */
  function trackSearch(q: string, prov: string, resultCount: number) {
    try {
      const sessionId = document.cookie.match(/(?:^|; )crs_session_id=([^;]+)/)?.[1] ?? "";
      if (!sessionId || q.trim().length < 2) return;
      const body = JSON.stringify({
        type:        "search",
        query:       q.trim(),
        province:    prov,
        resultCount,
        path:        window.location.pathname,
        sessionId:   decodeURIComponent(sessionId),
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    } catch { /* analytics failures never break search */ }
  }

  async function doSearch(q: string, prov: string, opts: { track?: boolean } = {}) {
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
      if (opts.track) trackSearch(q, prov, data.total ?? data.results?.length ?? 0);
    } catch {
      setError("Search temporarily unavailable. Please try again.");
      setResults([]);
      if (opts.track) trackSearch(q, prov, 0);
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
    if (query.trim().length >= 2) doSearch(query, key, { track: true });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounce.current) clearTimeout(debounce.current);
    doSearch(query, province, { track: true });
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
                borderRadius: "var(--radius-card)",
                padding: "1.5rem 1.6rem",
                boxShadow: "var(--shadow-card)",
              }}
            >
              {/* Company name + status badge */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                <span
                  className="card-heading"
                  style={{
                    fontSize: "1.1rem",
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

              {/* Meta pills — Registry ID / Type / Jurisdiction */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.85rem" }}>
                <MetaPill label="Registry ID"  value={r.registryId}   tone="teal" />
                <MetaPill label="Type"         value={r.entityType}   tone="gold" />
                <MetaPill label="Jurisdiction" value={r.jurisdiction} tone="navy" />
              </div>

              {/* Remaining details (long-form) */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "0.25rem 2rem",
                  marginBottom: "1rem",
                }}
              >
                <Field label="Business Number (BN)" value={r.businessNumber   || "—"} />
                <Field label="Registered Office"    value={r.location         || "—"} />
                <Field label="Created"              value={r.registrationDate || "—"} />
                <Field label="Status Notes"         value={r.statusNotes      || "—"} />
              </div>

              {/* CTA: inline pricing menu → deep-link into an order flow */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    Order a service for this company — filed within 24 hours.
                  </span>
                  <button
                    onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "0.35rem",
                      padding: "0.4rem 0.9rem", borderRadius: "0.5rem",
                      background: expandedIdx === i ? "var(--bg-deep)" : "var(--primary)",
                      color: expandedIdx === i ? "var(--text)" : "#fff",
                      border: expandedIdx === i ? "1.5px solid var(--border)" : "none",
                      fontSize: "0.78rem", fontWeight: 600,
                      cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    {expandedIdx === i ? "Hide options" : "Order a service"} <ArrowRight size={12} />
                  </button>
                </div>

                {expandedIdx === i && (
                  <div
                    style={{
                      marginTop: "0.75rem",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                      gap: "0.5rem",
                    }}
                  >
                    {[
                      { service: "profile-report" as const, label: "Corporate Profile Report",     price: "$49" },
                      { service: "good-standing"  as const, label: "Certificate of Good Standing", price: "$79" },
                      { service: "annual-return"  as const, label: "Annual Return Filing",         price: "from $99/yr" },
                    ].map(({ service, label, price }) => (
                      <a
                        key={service}
                        href={orderHref(service, r)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "0.6rem 0.85rem",
                          border: "1px solid var(--border)",
                          background: "var(--card)",
                          borderRadius: "0.5rem",
                          textDecoration: "none",
                        }}
                      >
                        <span>
                          <span style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)" }}>{label}</span>
                          <span style={{ fontSize: "0.72rem", color: "var(--gold)", fontFamily: "var(--font-mono), monospace" }}>{price} all-in + GST</span>
                        </span>
                        <ArrowRight size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                      </a>
                    ))}
                    <button
                      onClick={() => { setWizardPreload({ companyName: r.name, jurisdictionKey: r.provinceKey }); setWizardOpen(true); }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        padding: "0.6rem 0.85rem",
                        border: "1.5px dashed var(--border)",
                        background: "transparent",
                        borderRadius: "0.5rem",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span>
                        <span style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, color: "var(--text)" }}>Something else</span>
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Custom quote — 1 hour response</span>
                      </span>
                      <ArrowRight size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                    </button>
                  </div>
                )}
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
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-card)",
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
