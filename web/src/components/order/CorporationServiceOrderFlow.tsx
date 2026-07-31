"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, AlertCircle, CheckCircle2, Building2 } from "lucide-react";
import { JURISDICTIONS } from "@/lib/service-config";

/**
 * Order flow for visitors who searched and found a specific corporation
 * on an article. Shows corporation details + service selection + contact form.
 *
 * Different from NameSearchOrderFlow which is for proposing new names.
 * This is for ordering services on corporations that already exist.
 */

type CorporationDetails = {
  name: string;
  businessNumber: string;
  registryId: string;
  location: string;
  status: "Active" | "Inactive";
  jurisdiction: string;
  provinceKey: string;
};

const SERVICES = [
  { key: "annual-return", label: "Annual Return", price: "$99 all-in + GST" },
  { key: "profile-report", label: "Corporate Profile Report", price: "$49 all-in + GST" },
  { key: "good-standing", label: "Certificate of Good Standing", price: "$79 all-in + GST" },
  { key: "change-directors", label: "Director / Officer Change", price: "Starting at $199 + GST" },
  { key: "change-address", label: "Registered Address Change", price: "Starting at $199 + GST" },
  { key: "voluntary-dissolution", label: "Voluntary Dissolution", price: "Starting at $299 + GST" },
  { key: "revival", label: "Corporate Revival", price: "Starting at $399 + GST" },
];

export default function CorporationServiceOrderFlow() {
  const params = useSearchParams();
  const qParam = params.get("q") ?? "";
  const srcParam = params.get("src") ?? "direct";

  const [corp, setCorp] = useState<CorporationDetails | null>(null);
  const [searching, setSearching] = useState(true);
  const [searchErr, setSearchErr] = useState("");
  const [selectedService, setSelectedService] = useState("annual-return");
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState("");

  // Search for corporation on mount
  useEffect(() => {
    if (!qParam.trim()) {
      setSearchErr("No corporation name provided. Please search from an article.");
      setSearching(false);
      return;
    }

    const doSearch = async () => {
      try {
        setSearching(true);
        setSearchErr("");
        // Try to find the corporation - grab first result
        const res = await fetch(`/api/company-search?q=${encodeURIComponent(qParam)}&province=all`);
        const data = await res.json();
        const hits = data.results ?? [];
        if (hits.length > 0) {
          const hit = hits[0];
          setCorp({
            name: hit.name,
            businessNumber: hit.businessNumber,
            registryId: hit.registryId,
            location: hit.location,
            status: hit.status,
            jurisdiction: hit.jurisdiction,
            provinceKey: hit.provinceKey,
          });
        } else {
          setSearchErr(`No corporation found with name "${qParam}". Please try again.`);
        }
      } catch (e) {
        setSearchErr("Search failed. Please try again.");
      } finally {
        setSearching(false);
      }
    };

    doSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPay =
    corp &&
    selectedService &&
    !!contact.name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) &&
    !!contact.phone.trim();

  const submit = async () => {
    if (!canPay || !corp) return;
    setPaying(true);
    setPayErr("");

    try {
      // Determine which service endpoint to use
      const serviceEndpoint = `/api/order/${selectedService}`;
      const res = await fetch(serviceEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          corpName: corp.name,
          registryId: corp.registryId,
          businessNumber: corp.businessNumber,
          jurisdiction: corp.jurisdiction,
          provinceKey: corp.provinceKey,
          contact,
          src: srcParam,
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setPayErr(data.error || "Could not start payment. Please try again.");
      }
    } catch (e) {
      setPayErr("Network error. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  // Loading state
  if (searching) {
    return (
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "4rem 1.5rem", textAlign: "center" }}>
        <Loader2 size={32} className="crs-spin" style={{ color: "var(--gold)", margin: "0 auto 1rem" }} />
        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
          Looking up {qParam}...
        </p>
      </div>
    );
  }

  // Error state
  if (searchErr || !corp) {
    return (
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <div
          style={{
            background: "rgba(180,83,9,0.08)",
            color: "#B45309",
            padding: "1.25rem",
            borderRadius: "0.5rem",
            display: "flex",
            gap: "0.75rem",
            alignItems: "flex-start",
            marginBottom: "2rem",
          }}
        >
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
          <div>
            <div style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Corporation not found</div>
            <p style={{ fontSize: "0.9rem", margin: 0, lineHeight: 1.5 }}>
              {searchErr || "The corporation you searched for could not be found."}
            </p>
            <a
              href="/articles/what-is-cores-alberta"
              style={{
                display: "inline-block",
                marginTop: "0.75rem",
                color: "#B45309",
                textDecoration: "none",
                fontSize: "0.9rem",
                fontWeight: 600,
              }}
            >
              ← Back to search
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Corporation Details Card */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "0.75rem",
          padding: "1.75rem",
          marginBottom: "2rem",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", marginBottom: "1rem" }}>
          <div
            style={{
              width: "2.5rem",
              height: "2.5rem",
              borderRadius: "0.5rem",
              background: "var(--gold-dim)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Building2 size={16} style={{ color: "var(--gold)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text)", margin: "0 0 0.5rem" }}>
              {corp.name}
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "0.75rem 1.5rem",
                fontSize: "0.85rem",
              }}
            >
              {corp.registryId && (
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                    Registry ID
                  </div>
                  <div style={{ color: "var(--text)", fontWeight: 600 }}>#{corp.registryId}</div>
                </div>
              )}
              <div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                  Status
                </div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    padding: "0.3rem 0.7rem",
                    borderRadius: "3px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    background:
                      corp.status === "Active"
                        ? "rgba(34,197,94,0.15)"
                        : "rgba(107,114,128,0.15)",
                    color: corp.status === "Active" ? "#16a34a" : "#6b7280",
                  }}
                >
                  <CheckCircle2 size={12} />
                  {corp.status}
                </div>
              </div>
              {corp.location && (
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                    Location
                  </div>
                  <div style={{ color: "var(--text)", fontWeight: 600 }}>{corp.location}</div>
                </div>
              )}
              {corp.jurisdiction && (
                <div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                    Jurisdiction
                  </div>
                  <div style={{ color: "var(--text)", fontWeight: 600 }}>{corp.jurisdiction}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Service Selection */}
      <div style={{ marginBottom: "2rem" }}>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "1rem" }}>
          What service do you need?
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {SERVICES.map((svc) => (
            <label
              key={svc.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.9rem 1rem",
                borderRadius: "0.5rem",
                border: selectedService === svc.key ? "2px solid var(--gold)" : "1px solid var(--border)",
                background: selectedService === svc.key ? "rgba(212,175,55,0.05)" : "var(--card)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <input
                type="radio"
                name="service"
                value={svc.key}
                checked={selectedService === svc.key}
                onChange={(e) => setSelectedService(e.target.value)}
                style={{ cursor: "pointer", accentColor: "var(--gold)" }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.95rem" }}>
                  {svc.label}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--gold)" }}>
                  {svc.price}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Contact Form */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "0.75rem",
          padding: "1.75rem",
          marginBottom: "2rem",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", marginBottom: "1.25rem" }}>
          Your contact details
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.35rem" }}>
              Full name
            </label>
            <input
              type="text"
              value={contact.name}
              onChange={(e) => setContact({ ...contact, name: e.target.value })}
              placeholder="Your full name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.35rem" }}>
              Email
            </label>
            <input
              type="email"
              value={contact.email}
              onChange={(e) => setContact({ ...contact, email: e.target.value })}
              placeholder="you@company.com"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.35rem" }}>
              Phone
            </label>
            <input
              type="tel"
              value={contact.phone}
              onChange={(e) => setContact({ ...contact, phone: e.target.value })}
              placeholder="(555) 123-4567"
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Error Message */}
      {payErr && (
        <div
          style={{
            background: "rgba(180,83,9,0.08)",
            color: "#B45309",
            padding: "0.75rem 1rem",
            borderRadius: "0.4rem",
            fontSize: "0.85rem",
            marginBottom: "1rem",
            display: "flex",
            gap: "0.5rem",
            alignItems: "flex-start",
          }}
        >
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
          <span>{payErr}</span>
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={submit}
        disabled={!canPay || paying}
        style={{
          width: "100%",
          padding: "1rem",
          borderRadius: "0.5rem",
          background: canPay ? "var(--primary)" : "var(--text-muted)",
          color: "#FFFFFF",
          fontWeight: 600,
          fontSize: "1rem",
          border: "none",
          cursor: canPay ? "pointer" : "not-allowed",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          opacity: canPay ? 1 : 0.6,
        }}
      >
        {paying ? (
          <>
            <Loader2 size={18} className="crs-spin" />
            Processing...
          </>
        ) : (
          <>
            Proceed to Payment
            <ArrowRight size={18} />
          </>
        )}
      </button>

      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center", marginTop: "1rem" }}>
        All prices shown include government fees. You'll receive a quote within 1 hour.
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
