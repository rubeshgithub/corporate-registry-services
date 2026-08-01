"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, MapPin, Calendar, Building2, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";

/**
 * Comprehensive company profile & status lookup tool.
 *
 * Google-style clean search that queries multiple registries:
 * - All Canadian registries (federal, provinces)
 * - D&B data (if available via API)
 * - Google Places for additional location/business data
 *
 * Shows full company preview with all available information.
 */

type CompanyInfo = {
  name: string;
  registryId?: string;
  businessNumber?: string;
  status: "Active" | "Inactive" | "Unknown";
  jurisdiction: string;
  provinceKey: string;
  incorporationDate?: string;
  location?: string;
  address?: string;
  operatingName?: string;
  entityType?: string;
  directors?: string[];
  registeredOffice?: string;
  // D&B data
  dAndBData?: {
    companySize?: string;
    industry?: string;
    yearEstablished?: string;
    employees?: string;
    revenue?: string;
  };
  // Google Places data
  googlePlacesData?: {
    phone?: string;
    website?: string;
    email?: string;
    placeId?: string;
  };
};

const DEBOUNCE_MS = 500;
const MIN_QUERY = 2;

export default function CompanyProfileSearch() {
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [searchErr, setSearchErr] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  const searchToken = useRef(0);

  // Load search history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("companySearchHistory");
      if (saved) setSearchHistory(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const query = q.trim();
    if (query.length < MIN_QUERY) {
      setCompany(null);
      setSearchErr("");
      return;
    }

    const myToken = ++searchToken.current;
    const t = setTimeout(async () => {
      setSearching(true);
      setSearchErr("");
      try {
        // Search across all registries
        const res = await fetch(`/api/company-search?q=${encodeURIComponent(query)}&province=all`);
        const data = await res.json();
        const hits = data.results ?? [];

        if (myToken !== searchToken.current) return;

        if (hits.length > 0) {
          const hit = hits[0];
          const info: CompanyInfo = {
            name: hit.name,
            registryId: hit.registryId,
            businessNumber: hit.businessNumber,
            status: hit.status,
            jurisdiction: hit.jurisdiction,
            provinceKey: hit.provinceKey,
            location: hit.location,
            entityType: hit.entityType,
            incorporationDate: hit.registrationDate,
          };
          setCompany(info);

          // Fetch enriched data from D&B and Google Places
          try {
            const enrichRes = await fetch("/api/company/enrich", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: hit.name,
                businessNumber: hit.businessNumber,
                location: hit.location,
              }),
            });
            const enrichData = await enrichRes.json();
            if (enrichData.success) {
              setCompany((prev) =>
                prev
                  ? {
                      ...prev,
                      dAndBData: enrichData.dAndBData,
                      googlePlacesData: enrichData.googlePlacesData,
                    }
                  : prev
              );
            }
          } catch {
            /* silently fail on enrichment — registry data is enough */
          }
          // Save to history
          const newHistory = [query, ...searchHistory.filter((h) => h !== query)].slice(0, 10);
          setSearchHistory(newHistory);
          try {
            localStorage.setItem("companySearchHistory", JSON.stringify(newHistory));
          } catch {
            /* ignore */
          }
        } else {
          setCompany(null);
          setSearchErr("No corporation found. Try the exact legal name or corporation number.");
        }
      } catch (e) {
        if (myToken === searchToken.current) {
          setSearchErr("Search temporarily unavailable. Please try again.");
          setCompany(null);
        }
      } finally {
        if (myToken === searchToken.current) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(t);
  }, [q]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "2rem 1.5rem" }}>
      {/* Header */}
      <div style={{ maxWidth: 800, margin: "0 auto 3rem", textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: "2.5rem",
            fontWeight: 700,
            color: "var(--text)",
            marginBottom: "0.75rem",
            lineHeight: 1.2,
          }}
        >
          Company Profile
        </h1>
        <p style={{ fontSize: "1rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
          Search across all Canadian registries to view company information, status, and details.
        </p>
      </div>

      {/* Search Box */}
      <div style={{ maxWidth: 800, margin: "0 auto 3rem" }}>
        <div style={{ position: "relative" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Company name, corporation number, or Business Number"
            autoFocus
            style={{
              width: "100%",
              padding: "1rem 1rem 1rem 3.5rem",
              fontSize: "1.1rem",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              background: "var(--card)",
              color: "var(--text)",
              fontFamily: "inherit",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
            autoComplete="off"
          />
          {searching ? (
            <Loader2
              size={20}
              className="crs-spin"
              style={{
                position: "absolute",
                left: "1rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
          ) : (
            <Search
              size={20}
              style={{
                position: "absolute",
                left: "1rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
              }}
            />
          )}
        </div>

        {/* Recent searches */}
        {!q && searchHistory.length > 0 && (
          <div style={{ marginTop: "1.5rem" }}>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600, marginBottom: "0.75rem" }}>
              Recent searches
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {searchHistory.map((term) => (
                <button
                  key={term}
                  onClick={() => setQ(term)}
                  style={{
                    padding: "0.4rem 0.9rem",
                    borderRadius: "0.4rem",
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    color: "var(--text)",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.background = "var(--gold-dim)";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.background = "var(--card)";
                  }}
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {searchErr && !company && (
        <div style={{ maxWidth: 800, margin: "0 auto 2rem" }}>
          <div
            style={{
              background: "rgba(180,83,9,0.08)",
              color: "#B45309",
              padding: "1rem 1.25rem",
              borderRadius: "0.5rem",
              display: "flex",
              gap: "0.75rem",
              alignItems: "flex-start",
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
            <span style={{ fontSize: "0.9rem" }}>{searchErr}</span>
          </div>
        </div>
      )}

      {/* Company Profile Card */}
      {company && (
        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          <CompanyProfileCard company={company} />
        </div>
      )}
    </div>
  );
}

function CompanyProfileCard({ company }: { company: CompanyInfo }) {
  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "0.75rem",
        overflow: "hidden",
        boxShadow: "var(--shadow-card)",
      }}
    >
      {/* Header */}
      <div style={{ padding: "2rem 1.75rem", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
          <div
            style={{
              width: "3rem",
              height: "3rem",
              borderRadius: "0.5rem",
              background: "var(--gold-dim)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Building2 size={20} style={{ color: "var(--gold)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", margin: "0 0 0.5rem" }}>
              {company.name}
            </h2>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
              <StatusBadge status={company.status} />
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                {company.jurisdiction}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Core Info Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1.5rem",
          padding: "2rem 1.75rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {company.registryId && (
          <InfoBlock label="Registry ID" value={`#${company.registryId}`} />
        )}
        {company.businessNumber && (
          <InfoBlock label="Business Number" value={company.businessNumber} />
        )}
        {company.incorporationDate && (
          <InfoBlock
            label="Incorporation Date"
            value={new Date(company.incorporationDate).toLocaleDateString()}
            icon={<Calendar size={14} />}
          />
        )}
        {company.entityType && (
          <InfoBlock label="Entity Type" value={company.entityType} />
        )}
        {company.location && (
          <InfoBlock label="Location" value={company.location} icon={<MapPin size={14} />} />
        )}
      </div>

      {/* Address */}
      {company.registeredOffice && (
        <div style={{ padding: "1.75rem", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.75rem" }}>
            Registered Office
          </h3>
          <p style={{ fontSize: "0.95rem", color: "var(--text)", margin: 0, lineHeight: 1.5 }}>
            {company.registeredOffice}
          </p>
        </div>
      )}

      {/* D&B Data */}
      {company.dAndBData && (
        <div style={{ padding: "1.75rem", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "1rem" }}>
            Business Information
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {company.dAndBData.yearEstablished && (
              <InfoBlock label="Year Established" value={company.dAndBData.yearEstablished} />
            )}
            {company.dAndBData.employees && (
              <InfoBlock label="Employees" value={company.dAndBData.employees} />
            )}
            {company.dAndBData.industry && (
              <InfoBlock label="Industry" value={company.dAndBData.industry} />
            )}
            {company.dAndBData.revenue && (
              <InfoBlock label="Revenue" value={company.dAndBData.revenue} />
            )}
          </div>
        </div>
      )}

      {/* Google Places Data */}
      {company.googlePlacesData && (
        <div style={{ padding: "1.75rem", borderBottom: "1px solid var(--border)" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "1rem" }}>
            Contact Information
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {company.googlePlacesData.phone && (
              <a
                href={`tel:${company.googlePlacesData.phone}`}
                style={{ color: "var(--primary)", textDecoration: "none", fontSize: "0.95rem" }}
              >
                📞 {company.googlePlacesData.phone}
              </a>
            )}
            {company.googlePlacesData.email && (
              <a
                href={`mailto:${company.googlePlacesData.email}`}
                style={{ color: "var(--primary)", textDecoration: "none", fontSize: "0.95rem" }}
              >
                ✉️ {company.googlePlacesData.email}
              </a>
            )}
            {company.googlePlacesData.website && (
              <a
                href={company.googlePlacesData.website}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--primary)",
                  textDecoration: "none",
                  fontSize: "0.95rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                🌐 Visit website
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div style={{ padding: "1.75rem", background: "var(--bg-deep)", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <button
          onClick={() => window.print()}
          style={{
            padding: "0.75rem 1.25rem",
            borderRadius: "0.5rem",
            background: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            fontWeight: 600,
            fontSize: "0.9rem",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.background = "var(--gold-dim)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.background = "var(--card)";
          }}
        >
          📄 Print Profile
        </button>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "0.75rem 1.25rem",
            borderRadius: "0.5rem",
            background: "var(--card)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            fontWeight: 600,
            fontSize: "0.9rem",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.background = "var(--gold-dim)";
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLElement).style.background = "var(--card)";
          }}
        >
          🔄 New Search
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "Active";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        padding: "0.35rem 0.8rem",
        borderRadius: "4px",
        fontSize: "0.8rem",
        fontWeight: 600,
        background: isActive ? "rgba(34,197,94,0.15)" : "rgba(107,114,128,0.15)",
        color: isActive ? "#16a34a" : "#6b7280",
      }}
    >
      {isActive ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
      {status}
    </span>
  );
}

function InfoBlock({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600, marginBottom: "0.35rem" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: "0.95rem",
          color: "var(--text)",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        {icon}
        {value}
      </div>
    </div>
  );
}
