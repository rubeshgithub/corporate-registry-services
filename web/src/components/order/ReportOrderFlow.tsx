"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, CheckCircle2, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { JURISDICTIONS } from "@/lib/service-config";
import type { ReportServiceConfig } from "@/lib/report-config";

/**
 * Shared lookup-first checkout for both Profile Report and Good Standing.
 * Behavior is identical between the two — a registry search picks the target
 * company, the customer confirms and provides contact info, then pays via
 * Stripe. Copy and pricing are driven from ReportServiceConfig so the same
 * component ships two distinct order pages.
 */

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

type Screen = "lookup" | "confirm";

export default function ReportOrderFlow({ config }: { config: ReportServiceConfig }) {
  const params              = useSearchParams();
  const initialJurisdiction = params.get("jurisdiction") ?? "all";
  const attributionSrc      = params.get("src") ?? "direct";

  const [screen, setScreen] = useState<Screen>("lookup");

  // Lookup state
  const [query, setQuery]         = useState("");
  const [province, setProvince]   = useState<string>(initialJurisdiction);
  const [results, setResults]     = useState<RegistryHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");

  // Confirm state
  const [pick, setPick]     = useState<RegistryHit | null>(null);
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState("");

  // If ?q= is present the visitor came from the company-search page with a
  // specific pick — auto-run the lookup and, if ?registryId= matches, jump
  // straight to the confirm screen. Otherwise just pre-fill the input.
  useEffect(() => {
    const q = params.get("q");
    if (!q) return;
    setQuery(q);
    const wantedRegistryId = params.get("registryId") ?? "";
    const wantedProvince   = params.get("jurisdiction") ?? "all";
    (async () => {
      setSearching(true);
      try {
        const res  = await fetch(`/api/company-search?q=${encodeURIComponent(q)}&province=${wantedProvince}`);
        const data = await res.json();
        const hits: RegistryHit[] = data.results ?? [];
        setResults(hits);
        const match = wantedRegistryId
          ? hits.find((h) => h.registryId === wantedRegistryId)
          : (hits.length === 1 ? hits[0] : null);
        if (match) {
          setPick(match);
          setScreen("confirm");
        }
      } catch {
        setSearchErr("Search is temporarily unavailable. Please try again.");
      } finally {
        setSearching(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchErr("Enter at least 2 characters — a company name, Corporate Access Number, or Business Number.");
      return;
    }
    setSearchErr("");
    setSearching(true);
    try {
      const res  = await fetch(`/api/company-search?q=${encodeURIComponent(q)}&province=${province}`);
      const data = await res.json();
      setResults(data.results ?? []);
      if (!data.results?.length) setSearchErr("No matching records. Try the exact registered name, or change jurisdiction.");
    } catch {
      setSearchErr("Search is temporarily unavailable. Please try again.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const chooseHit = (hit: RegistryHit) => {
    setPick(hit);
    setScreen("confirm");
  };

  const canPay =
    !!pick &&
    !!contact.name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) &&
    !!contact.phone.trim();

  const goToPayment = async () => {
    if (!pick || !canPay) return;
    setPayErr("");
    setPaying(true);
    try {
      const res = await fetch("/api/order/report", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          service: config.key,
          hit:     pick,
          contact,
          src:     attributionSrc,
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

  /* ─────────────────── LOOKUP SCREEN ─────────────────── */

  if (screen === "lookup") {
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

        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem", boxShadow: "var(--shadow)" }}>
          <label htmlFor="rep-q" style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem" }}>
            Company name, Corporate Access Number, or Business Number
          </label>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              id="rep-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
              placeholder="e.g. Acme Holdings, 2094832, or 123456789RC0001"
              style={{ flex: "3 1 260px", padding: "0.65rem 0.85rem", border: "1px solid var(--border)", borderRadius: "0.5rem", fontSize: "0.9rem", background: "var(--bg)", color: "var(--text)" }}
            />
            <select
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              style={{ flex: "1 1 160px", padding: "0.65rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.5rem", fontSize: "0.85rem", background: "var(--bg)", color: "var(--text)" }}
            >
              <option value="all">All of Canada</option>
              {JURISDICTIONS.map((j) => (
                <option key={j.key} value={j.key}>{j.label}</option>
              ))}
            </select>
            <button
              onClick={runSearch}
              disabled={searching}
              style={{ flex: "0 0 auto", padding: "0.65rem 1.1rem", background: "var(--primary)", color: "#FFFFFF", fontWeight: 600, fontSize: "0.9rem", border: "none", borderRadius: "0.5rem", cursor: searching ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
            >
              {searching ? <Loader2 size={14} className="crs-spin" /> : <Search size={14} />} Find
            </button>
          </div>
          {searchErr && <p style={{ color: "#B45309", fontSize: "0.8rem", marginTop: "0.75rem" }}>{searchErr}</p>}
        </div>

        {results.length > 0 && (
          <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {results.slice(0, 5).map((hit, i) => (
              <button
                key={`${hit.provinceKey}-${hit.registryId}-${i}`}
                onClick={() => chooseHit(hit)}
                style={{ textAlign: "left", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.9rem 1rem", cursor: "pointer", display: "flex", gap: "0.75rem", alignItems: "center", justifyContent: "space-between" }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.95rem" }}>{hit.name}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "0.15rem" }}>
                    {hit.jurisdiction} · {hit.registryId || "—"} · {hit.status}
                    {hit.entityType ? ` · ${hit.entityType}` : ""}
                  </div>
                </div>
                <ArrowRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}

        <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", textAlign: "center", marginTop: "1.5rem" }}>
          Data pulled live from federal &amp; provincial registries. QC uses REQ.
        </p>
      </div>
    );
  }

  /* ─────────────────── CONFIRM SCREEN ─────────────────── */

  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <button
          onClick={() => setScreen("lookup")}
          style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.8rem", cursor: "pointer", padding: 0 }}
        >
          ← Pick a different company
        </button>
      </div>

      {pick && (
        <div style={{ background: "var(--card)", border: "1px solid var(--gold)", borderRadius: "0.75rem", padding: "1.25rem 1.5rem", marginBottom: "1.25rem", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.85rem" }}>
            <CheckCircle2 size={20} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.15rem" }} />
            <div>
              <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.15rem", fontWeight: 700, color: "var(--text)" }}>
                {pick.name}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "0.15rem" }}>
                {pick.jurisdiction} · {pick.entityType}
              </div>
            </div>
          </div>

          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: "0.4rem", columnGap: "1rem", fontSize: "0.85rem", margin: 0 }}>
            <dt style={{ color: "var(--text-muted)" }}>Registry ID</dt>
            <dd style={{ margin: 0, color: "var(--text)" }}>{pick.registryId || "—"}</dd>

            <dt style={{ color: "var(--text-muted)" }}>Business Number</dt>
            <dd style={{ margin: 0, color: "var(--text)" }}>{pick.businessNumber || "—"}</dd>

            <dt style={{ color: "var(--text-muted)" }}>Incorporated</dt>
            <dd style={{ margin: 0, color: "var(--text)" }}>{pick.registrationDate || "—"}</dd>

            <dt style={{ color: "var(--text-muted)" }}>Location</dt>
            <dd style={{ margin: 0, color: "var(--text)" }}>{pick.location}</dd>

            <dt style={{ color: "var(--text-muted)" }}>Status</dt>
            <dd style={{ margin: 0, color: pick.status === "Active" ? "var(--text)" : "#B45309", fontWeight: 600 }}>
              {pick.status}
            </dd>
          </dl>

          <div style={{ marginTop: "0.9rem", fontSize: "0.78rem", color: "var(--text-muted)" }}>
            {config.deliveryPromise}
          </div>
        </div>
      )}

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
              style={{ width: "100%", padding: "0.6rem 0.85rem", border: "1px solid var(--border)", borderRadius: "0.5rem", fontSize: "0.9rem", background: "var(--bg)", color: "var(--text)" }}
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
        onClick={goToPayment}
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
