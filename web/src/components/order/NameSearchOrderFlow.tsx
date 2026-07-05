"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { JURISDICTIONS } from "@/lib/service-config";
import type { NameSearchServiceConfig } from "@/lib/name-search-config";

/**
 * Simple "propose a name → pay" order flow shared by Corporate Name Search
 * and NUANS. Single-screen: proposed name + (optional) jurisdiction +
 * contact + Stripe payment. No registry lookup step.
 */

export default function NameSearchOrderFlow({ config }: { config: NameSearchServiceConfig }) {
  const params              = useSearchParams();
  const initialJurisdiction = params.get("jurisdiction") ?? "";
  const attributionSrc      = params.get("src") ?? "direct";

  const [proposedName, setProposedName]   = useState("");
  const [altName, setAltName]             = useState("");
  const [jurisdiction, setJurisdiction]   = useState(initialJurisdiction);
  const [contact, setContact]             = useState({ name: "", email: "", phone: "" });
  const [paying, setPaying]               = useState(false);
  const [payErr, setPayErr]               = useState("");

  useEffect(() => {
    const q = params.get("q");
    if (q) setProposedName(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPay =
    proposedName.trim().length >= 2 &&
    (!config.needsJurisdiction || !!jurisdiction) &&
    !!contact.name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) &&
    !!contact.phone.trim();

  const submit = async () => {
    if (!canPay) return;
    setPayErr("");
    setPaying(true);
    try {
      const res = await fetch("/api/order/name-search", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          service:      config.key,
          proposedName: proposedName.trim(),
          altName:      altName.trim(),
          jurisdiction: config.needsJurisdiction ? jurisdiction : "",
          contact,
          src:          attributionSrc,
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setPayErr(data.error || "Could not start payment. Please try again.");
      }
    } catch {
      setPayErr("Network error. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
          {config.label} · {config.priceLabel}
        </span>
        <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", marginTop: "0.35rem", marginBottom: "0.5rem" }}>
          {config.headline}
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
          {config.description}
        </p>
      </div>

      {/* Name inputs */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem 1.5rem", marginBottom: "1.25rem", boxShadow: "var(--shadow)" }}>
        <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.35rem" }}>
          Proposed name
        </label>
        <input
          type="text"
          value={proposedName}
          onChange={(e) => setProposedName(e.target.value)}
          placeholder={config.namePlaceholder}
          style={inputStyle}
        />
        <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.4rem 0 0" }}>
          {config.nameHelp}
        </p>

        <div style={{ marginTop: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.35rem" }}>
            {config.key === "nuans-search" ? "Fallback name (optional)" : "Alternate name (optional)"}
          </label>
          <input
            type="text"
            value={altName}
            onChange={(e) => setAltName(e.target.value)}
            placeholder="Only if you want us to try a second option"
            style={inputStyle}
          />
        </div>

        {config.needsJurisdiction && (
          <div style={{ marginTop: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.35rem" }}>
              Jurisdiction
            </label>
            <select
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              style={inputStyle}
            >
              <option value="">Select…</option>
              {JURISDICTIONS.map((j) => (
                <option key={j.key} value={j.key}>{j.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Contact */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem 1.5rem", marginBottom: "1.25rem" }}>
        <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.75rem" }}>
          Where do we send the report?
        </div>
        {[
          { key: "name",  label: "Full name",  type: "text",  placeholder: "Jane Doe" },
          { key: "email", label: "Email",      type: "email", placeholder: "jane@company.ca" },
          { key: "phone", label: "Phone",      type: "tel",   placeholder: "(403) 555-0123" },
        ].map(({ key, label, type, placeholder }) => (
          <div key={key} style={{ marginBottom: "0.65rem" }}>
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)", marginBottom: "0.25rem" }}>
              {label}
            </label>
            <input
              type={type}
              value={contact[key as keyof typeof contact]}
              onChange={(e) => setContact({ ...contact, [key]: e.target.value })}
              placeholder={placeholder}
              style={inputStyle}
            />
          </div>
        ))}
      </div>

      {payErr && (
        <div style={{ padding: "0.75rem 1rem", borderRadius: "0.5rem", background: "rgba(180,83,9,0.08)", color: "#B45309", fontSize: "0.85rem", marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
          <AlertCircle size={16} style={{ marginTop: "0.1rem", flexShrink: 0 }} />
          <span>{payErr}</span>
        </div>
      )}

      <button
        onClick={submit}
        disabled={!canPay || paying}
        style={{ width: "100%", padding: "0.85rem 1rem", background: canPay ? "var(--primary)" : "var(--border)", color: "#FFFFFF", fontWeight: 700, fontSize: "1rem", border: "none", borderRadius: "0.5rem", cursor: canPay && !paying ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
      >
        {paying ? <><Loader2 size={16} className="crs-spin" /> Redirecting to secure payment…</> : <>{config.buttonLabel} <ArrowRight size={16} /></>}
      </button>

      <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", textAlign: "center", marginTop: "0.75rem" }}>
        Card processed securely by Stripe. {config.deliveryPromise}
      </p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width:        "100%",
  padding:      "0.6rem 0.85rem",
  border:       "1px solid var(--border)",
  borderRadius: "0.5rem",
  fontSize:     "0.9rem",
  background:   "var(--bg)",
  color:        "var(--text)",
};
