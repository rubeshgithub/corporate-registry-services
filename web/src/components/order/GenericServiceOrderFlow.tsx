"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, CheckCircle2, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { JURISDICTIONS, type ServiceItem } from "@/lib/service-config";
import { useOrderDraftBeacon } from "@/components/useOrderDraftBeacon";
import ETransferCapture from "@/components/order/ETransferCapture";

/**
 * Checkout for catalogue services that don't warrant a bespoke flow —
 * name changes, articles of amendment, share splits, amalgamation,
 * continuance, extra-provincial registration, registered office,
 * compliance review, minute books.
 *
 * Same three-screen shape as the other order flows (lookup → details +
 * contact → Stripe), with the middle section generated from the service's
 * own `detailFields` instead of a hand-written sub-form. Price is never
 * sent from here; /api/order/service resolves it from the service key.
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

export default function GenericServiceOrderFlow({ service }: { service: ServiceItem }) {
  const params              = useSearchParams();
  const initialJurisdiction = params.get("jurisdiction") ?? "all";
  const attributionSrc      = params.get("src") ?? "direct";

  const [screen, setScreen]       = useState<Screen>("lookup");
  const [query, setQuery]         = useState("");
  const [province, setProvince]   = useState<string>(initialJurisdiction);
  const [results, setResults]     = useState<RegistryHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");

  const [pick, setPick]       = useState<RegistryHit | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({});
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [paying, setPaying]   = useState(false);
  const [payErr, setPayErr]   = useState("");

  useOrderDraftBeacon({
    service:  service.key,
    contact,
    company:  pick ? {
      name:           pick.name,
      registryId:     pick.registryId,
      businessNumber: pick.businessNumber,
      jurisdiction:   pick.jurisdiction,
      provinceKey:    pick.provinceKey,
    } : undefined,
    disabled: paying,
  });

  /* Deep-link: ?q=&registryId=&jurisdiction= jumps straight to the details
     screen, same contract the other flows use. */
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
        if (match) { setPick(match); setScreen("confirm"); }
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

  const requiredFields = (service.detailFields ?? []).filter((f) => f.required);
  const detailsComplete = requiredFields.every((f) => (details[f.key] ?? "").trim().length > 0);

  const canPay =
    !!pick &&
    detailsComplete &&
    !!contact.name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) &&
    !!contact.phone.trim();

  const goToPayment = async () => {
    if (!pick || !canPay) return;
    setPayErr("");
    setPaying(true);
    try {
      const res = await fetch("/api/order/service", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          serviceKey: service.key,
          hit:        pick,
          details,
          contact,
          src:        attributionSrc,
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

  const priceOnly = service.estimatedFee.replace(" + GST", "");

  /* ─────────────────── LOOKUP ─────────────────── */

  if (screen === "lookup") {
    return (
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
            {service.label} · {service.estimatedFee}
          </span>
          <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", marginTop: "0.35rem", marginBottom: "0.5rem" }}>
            Find your corporation
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
            {service.description}
          </p>
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", padding: "1.5rem", boxShadow: "var(--shadow-card)" }}>
          <label htmlFor="svc-q" style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem" }}>
            Company name, Corporate Access Number, or Business Number
          </label>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              id="svc-q"
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
            {results.slice(0, 6).map((hit, i) => (
              <button
                key={`${hit.provinceKey}-${hit.registryId}-${i}`}
                onClick={() => { setPick(hit); setScreen("confirm"); }}
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

  /* ─────────────────── DETAILS + CONTACT ─────────────────── */

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
        <div style={{ background: "var(--card)", border: "1px solid var(--gold)", borderRadius: "var(--radius-card)", padding: "1.5rem 1.75rem", marginBottom: "1.25rem", boxShadow: "var(--shadow-card)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", marginBottom: "0.85rem" }}>
            <CheckCircle2 size={20} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.15rem" }} />
            <div>
              <div className="card-heading" style={{ fontSize: "1.15rem" }}>{pick.name}</div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "0.15rem" }}>
                {pick.jurisdiction} · {pick.registryId || "—"} · {pick.entityType || "—"}
              </div>
            </div>
          </div>
          <div style={{ fontSize: "0.85rem", color: "var(--text)" }}>
            <strong>{service.label}</strong> — {service.estimatedFee}
          </div>
        </div>
      )}

      {/* Service-specific details, generated from the catalogue definition */}
      {(service.detailFields?.length ?? 0) > 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", padding: "1.5rem 1.75rem", marginBottom: "1.25rem", boxShadow: "var(--shadow-card)" }}>
          <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.75rem" }}>
            Details we need
          </div>
          {(service.detailFields ?? []).map((f) => (
            <div key={f.key} style={{ marginBottom: "0.75rem" }}>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                {f.label}{f.required ? " *" : ""}
              </label>
              {f.type === "textarea" ? (
                <textarea
                  value={details[f.key] ?? ""}
                  onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  rows={3}
                  style={{ width: "100%", padding: "0.6rem 0.85rem", border: "1px solid var(--border)", borderRadius: "0.5rem", fontSize: "0.9rem", background: "var(--bg)", color: "var(--text)", fontFamily: "inherit", resize: "vertical" }}
                />
              ) : f.type === "select" ? (
                <select
                  value={details[f.key] ?? ""}
                  onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })}
                  style={{ width: "100%", padding: "0.6rem 0.85rem", border: "1px solid var(--border)", borderRadius: "0.5rem", fontSize: "0.9rem", background: "var(--bg)", color: "var(--text)" }}
                >
                  <option value="">Select…</option>
                  {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={f.type === "date" ? "date" : "text"}
                  value={details[f.key] ?? ""}
                  onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  style={{ width: "100%", padding: "0.6rem 0.85rem", border: "1px solid var(--border)", borderRadius: "0.5rem", fontSize: "0.9rem", background: "var(--bg)", color: "var(--text)" }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Contact */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", padding: "1.5rem 1.75rem", marginBottom: "1.25rem", boxShadow: "var(--shadow-card)" }}>
        <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.75rem" }}>
          Where do we send it?
        </div>
        {[
          { key: "name",  label: "Full name", type: "text",  placeholder: "Jane Doe" },
          { key: "email", label: "Email",     type: "email", placeholder: "jane@company.ca" },
          { key: "phone", label: "Phone",     type: "tel",   placeholder: "(403) 555-0123" },
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
        {paying
          ? <><Loader2 size={16} className="crs-spin" /> Redirecting to secure payment…</>
          : <>Pay {priceOnly} + GST and order <ArrowRight size={16} /></>}
      </button>

      <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", textAlign: "center", marginTop: "0.75rem" }}>
        Card processed securely by Stripe. All government fees included.
      </p>

      <ETransferCapture
        service={service.key}
        serviceLabel={service.label}
        priceLabel={service.estimatedFee}
        priceCents={service.priceCents ?? 0}
        company={pick ? {
          name:           pick.name,
          registryId:     pick.registryId,
          businessNumber: pick.businessNumber,
          jurisdiction:   pick.jurisdiction,
          provinceKey:    pick.provinceKey,
        } : undefined}
        contact={contact}
        src={attributionSrc}
      />
    </div>
  );
}
