"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, CheckCircle2, ArrowRight, Loader2, AlertCircle, Plus, Trash2, Info } from "lucide-react";
import { JURISDICTIONS } from "@/lib/service-config";
import type { ChangeServiceConfig } from "@/lib/change-config";
import PlacesInput from "@/components/PlacesInput";
import ETransferCapture from "@/components/order/ETransferCapture";
import RegistryAccessField from "@/components/order/RegistryAccessField";
import { type RegistryAccessState } from "@/lib/registry-access";

/**
 * Shared checkout for the four form-based change services:
 * change-directors, change-address, voluntary-dissolution, revival.
 * Registry lookup + service-specific details + contact + Stripe.
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

/* ─── Service-specific detail shapes ─── */

type PersonChangeType   = "appointed" | "resigned" | "address-changed";
type PersonRole         = "director" | "officer";
type DirectorChangeRow  = {
  id:            string;
  type:          PersonChangeType;
  role:          PersonRole;
  officerTitle:  string;       // only meaningful when role === "officer"
  name:          string;
  effectiveDate: string;
  newAddress:    string;
};
type DirectorsDetails    = { changes: DirectorChangeRow[] };
type AddressDetails      = { newAddress: string; effectiveDate: string };
type DissolutionDetails  = {
  effectiveDate:      string;
  debtsPaid:          boolean;
  finalTaxFiled:      boolean;
  assetsDistributed:  boolean;
  reason:             string;
};
type RevivalDetails      = {
  hasMissedFilings:   boolean;
  reasonForRevival:   string;
  filingsNote:        string;
};

type Details = DirectorsDetails | AddressDetails | DissolutionDetails | RevivalDetails;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const emptyDirectorRow = (): DirectorChangeRow => ({
  id: newId(), type: "appointed", role: "director", officerTitle: "", name: "", effectiveDate: "", newAddress: "",
});

/* ────────────────────────── Component ────────────────────────── */

export default function ChangeOrderFlow({ config }: { config: ChangeServiceConfig }) {
  const params              = useSearchParams();
  const initialJurisdiction = params.get("jurisdiction") ?? "all";
  const attributionSrc      = params.get("src") ?? "direct";

  const [screen, setScreen] = useState<Screen>("lookup");

  const [query, setQuery]         = useState("");
  const [province, setProvince]   = useState<string>(initialJurisdiction);
  const [results, setResults]     = useState<RegistryHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");

  const [pick, setPick]           = useState<RegistryHit | null>(null);
  const [details, setDetails]     = useState<Details>(() => defaultDetailsFor(config.key));
  const [contact, setContact]     = useState({ name: "", email: "", phone: "" });
  const [paying, setPaying]       = useState(false);
  const [payErr, setPayErr]       = useState("");
  const [registryAccess, setRegistryAccess] = useState<RegistryAccessState>({ status: "retrieve", code: "" });

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

  const detailsErr = validateDetails(config.key, details);
  const canPay =
    !!pick &&
    !!contact.name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) &&
    !!contact.phone.trim() &&
    detailsErr === null;

  const submit = async () => {
    if (!pick || !canPay) return;
    setPayErr("");
    setPaying(true);
    try {
      const res = await fetch("/api/order/change-request", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          service: config.key,
          hit:     pick,
          details,
          contact,
          registryAccess,
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

  /* ────────────────────────── LOOKUP SCREEN ────────────────────────── */

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

        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", padding: "1.5rem", boxShadow: "var(--shadow-card)" }}>
          <label htmlFor="chg-q" style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem" }}>
            Find the company — name, Corporate Access Number, or Business Number
          </label>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              id="chg-q"
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

  /* ────────────────────────── CONFIRM SCREEN ────────────────────────── */

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
              <div className="card-heading" style={{ fontSize: "1.15rem" }}>
                {pick.name}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "0.15rem" }}>
                {pick.jurisdiction} · {pick.entityType}
              </div>
            </div>
          </div>
          <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: "0.4rem", columnGap: "1rem", fontSize: "0.85rem", margin: 0 }}>
            <dt style={{ color: "var(--text-muted)" }}>Registry ID</dt>
            <dd style={{ margin: 0 }}>{pick.registryId || "—"}</dd>
            <dt style={{ color: "var(--text-muted)" }}>Business Number</dt>
            <dd style={{ margin: 0 }}>{pick.businessNumber || "—"}</dd>
            <dt style={{ color: "var(--text-muted)" }}>Status</dt>
            <dd style={{ margin: 0, color: pick.status === "Active" ? "var(--text)" : "#B45309", fontWeight: 600 }}>
              {pick.status}
            </dd>
          </dl>
        </div>
      )}

      {/* Service-specific middle section */}
      <DetailsSection config={config} details={details} setDetails={setDetails} />

      <RegistryAccessField
        service={config.key}
        provinceKey={pick?.provinceKey}
        jurisdictionLabel={pick?.jurisdiction}
        value={registryAccess}
        onChange={setRegistryAccess}
      />

      {/* Contact */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.75rem" }}>
          Your contact info
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

      {detailsErr && (
        <div style={{ padding: "0.55rem 0.85rem", background: "rgba(180,83,9,0.08)", color: "#B45309", fontSize: "0.78rem", borderRadius: "0.4rem", marginBottom: "0.75rem" }}>
          {detailsErr}
        </div>
      )}

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

      <ETransferCapture
        service={config.key}
        serviceLabel={config.label}
        priceLabel={config.priceLabel}
        priceCents={config.priceCents}
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

/* ────────────────────────── DetailsSection ────────────────────────── */

function DetailsSection({ config, details, setDetails }: { config: ChangeServiceConfig; details: Details; setDetails: (d: Details) => void }) {
  if (config.key === "change-directors")     return <DirectorsSection    details={details as DirectorsDetails}    setDetails={(d) => setDetails(d)} />;
  if (config.key === "change-address")       return <AddressSection      details={details as AddressDetails}      setDetails={(d) => setDetails(d)} />;
  if (config.key === "voluntary-dissolution") return <DissolutionSection details={details as DissolutionDetails} setDetails={(d) => setDetails(d)} />;
  if (config.key === "revival")              return <RevivalSection      details={details as RevivalDetails}      setDetails={(d) => setDetails(d)} />;
  return null;
}

/* ─── Directors ─── */

const DIRECTOR_TYPES: Array<{ v: PersonChangeType; l: string }> = [
  { v: "appointed",       l: "Appointed" },
  { v: "resigned",        l: "Resigned" },
  { v: "address-changed", l: "Address changed" },
];

function DirectorsSection({ details, setDetails }: { details: DirectorsDetails; setDetails: (d: DirectorsDetails) => void }) {
  const patch  = (id: string, p: Partial<DirectorChangeRow>) =>
    setDetails({ changes: details.changes.map((c) => c.id === id ? { ...c, ...p } : c) });
  const remove = (id: string) => setDetails({ changes: details.changes.filter((c) => c.id !== id) });
  const add    = () => setDetails({ changes: [...details.changes, emptyDirectorRow()] });

  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.35rem" }}>
        Director and officer changes
      </div>
      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 0.75rem" }}>
        Add every change you want filed on this application. All go on the same registry filing.
      </p>

      {details.changes.map((c) => (
        <div key={c.id} style={subCardStyle}>
          <TwoCol>
            <div>
              <label style={rowLabel}>Role</label>
              <select value={c.role} onChange={(e) => patch(c.id, { role: e.target.value as PersonRole })} style={inputStyle}>
                <option value="director">Director</option>
                <option value="officer">Officer</option>
              </select>
            </div>
            <div>
              <label style={rowLabel}>Change type</label>
              <select value={c.type} onChange={(e) => patch(c.id, { type: e.target.value as PersonChangeType })} style={inputStyle}>
                {DIRECTOR_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
          </TwoCol>
          {c.role === "officer" && (
            <div style={{ marginTop: "0.5rem" }}>
              <label style={rowLabel}>Officer title</label>
              <input type="text" value={c.officerTitle} onChange={(e) => patch(c.id, { officerTitle: e.target.value })} placeholder="e.g. President, Secretary" style={inputStyle} />
            </div>
          )}
          <div style={{ marginTop: "0.5rem" }}>
            <label style={rowLabel}>Full legal name</label>
            <input type="text" value={c.name} onChange={(e) => patch(c.id, { name: e.target.value })} placeholder="Jane Doe" style={inputStyle} />
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <label style={rowLabel}>Effective date</label>
            <input type="date" value={c.effectiveDate} onChange={(e) => patch(c.id, { effectiveDate: e.target.value })} style={inputStyle} />
          </div>
          {c.type === "address-changed" && (
            <div style={{ marginTop: "0.5rem" }}>
              <label style={rowLabel}>New address</label>
              <PlacesInput
                value={c.newAddress}
                onChange={(e) => patch(c.id, { newAddress: e.target.value })}
                onPlaceSelected={(p) => patch(c.id, { newAddress: p.formatted })}
                placeholder="Start typing an address…"
                style={inputStyle}
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => remove(c.id)}
            style={{ marginTop: "0.5rem", background: "none", border: "none", color: "#B45309", fontSize: "0.75rem", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
          >
            <Trash2 size={12} /> Remove this change
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.45rem 0.85rem", border: "1.5px dashed var(--border)", borderRadius: "0.4rem", background: "transparent", color: "var(--text-muted)", fontSize: "0.8rem", cursor: "pointer", marginTop: "0.35rem" }}
      >
        <Plus size={13} /> {details.changes.length === 0 ? "Add a change" : "Add another change"}
      </button>
    </div>
  );
}

/* ─── Address change ─── */

function AddressSection({ details, setDetails }: { details: AddressDetails; setDetails: (d: AddressDetails) => void }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.75rem" }}>
        New registered office address
      </div>
      <div>
        <label style={rowLabel}>Full address</label>
        <PlacesInput
          value={details.newAddress}
          onChange={(e) => setDetails({ ...details, newAddress: e.target.value })}
          onPlaceSelected={(p) => setDetails({ ...details, newAddress: p.formatted })}
          placeholder="Start typing an address…"
          style={inputStyle}
        />
        <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: "0.35rem 0 0" }}>
          Must be a physical address in the jurisdiction of incorporation. No PO boxes for most provinces.
        </p>
      </div>
      <div style={{ marginTop: "0.75rem" }}>
        <label style={rowLabel}>Effective date</label>
        <input
          type="date"
          value={details.effectiveDate}
          onChange={(e) => setDetails({ ...details, effectiveDate: e.target.value })}
          style={inputStyle}
        />
      </div>
    </div>
  );
}

/* ─── Voluntary dissolution ─── */

function DissolutionSection({ details, setDetails }: { details: DissolutionDetails; setDetails: (d: DissolutionDetails) => void }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.75rem" }}>
        Dissolution details
      </div>

      <div style={{ padding: "0.7rem 0.85rem", background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: "0.4rem", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: "0.9rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
        <Info size={14} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.15rem" }} />
        <div>
          <strong style={{ color: "var(--text)" }}>Before filing dissolution</strong>, all debts must be settled, the final corporate tax return must be filed with CRA, and remaining assets must be distributed to shareholders. Confirm each below.
        </div>
      </div>

      <div style={{ marginBottom: "0.6rem" }}>
        <label style={rowLabel}>Effective dissolution date</label>
        <input
          type="date"
          value={details.effectiveDate}
          onChange={(e) => setDetails({ ...details, effectiveDate: e.target.value })}
          style={inputStyle}
        />
      </div>

      {[
        { key: "debtsPaid",         label: "All debts and liabilities have been paid or resolved" },
        { key: "finalTaxFiled",     label: "Final T2 corporate tax return has been filed with CRA" },
        { key: "assetsDistributed", label: "All remaining assets have been distributed to shareholders" },
      ].map(({ key, label }) => {
        const k = key as "debtsPaid" | "finalTaxFiled" | "assetsDistributed";
        return (
          <label key={key} style={{ display: "flex", gap: "0.55rem", alignItems: "flex-start", padding: "0.55rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.4rem", marginBottom: "0.35rem", cursor: "pointer", background: details[k] ? "var(--gold-dim)" : "transparent" }}>
            <input
              type="checkbox"
              checked={details[k]}
              onChange={(e) => setDetails({ ...details, [k]: e.target.checked })}
              style={{ marginTop: "0.2rem" }}
            />
            <span style={{ fontSize: "0.82rem", color: "var(--text)" }}>{label}</span>
          </label>
        );
      })}

      <div style={{ marginTop: "0.75rem" }}>
        <label style={rowLabel}>Reason for dissolution (optional)</label>
        <textarea
          value={details.reason}
          onChange={(e) => setDetails({ ...details, reason: e.target.value })}
          rows={2}
          placeholder="e.g. Business wound down, no longer operating, amalgamating into new entity elsewhere…"
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      </div>
    </div>
  );
}

/* ─── Revival ─── */

function RevivalSection({ details, setDetails }: { details: RevivalDetails; setDetails: (d: RevivalDetails) => void }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.75rem" }}>
        Revival details
      </div>

      <div style={{ padding: "0.7rem 0.85rem", background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: "0.4rem", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: "0.9rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
        <Info size={14} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.15rem" }} />
        <div>
          Most dissolved corporations need to <strong style={{ color: "var(--text)" }}>catch up on missed annual returns</strong> before or during the revival application. If applicable, we'll quote the catch-up filings separately at the standard $99/year.
        </div>
      </div>

      <label style={{ display: "flex", gap: "0.55rem", alignItems: "flex-start", padding: "0.55rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.4rem", marginBottom: "0.6rem", cursor: "pointer", background: details.hasMissedFilings ? "var(--gold-dim)" : "transparent" }}>
        <input
          type="checkbox"
          checked={details.hasMissedFilings}
          onChange={(e) => setDetails({ ...details, hasMissedFilings: e.target.checked })}
          style={{ marginTop: "0.2rem" }}
        />
        <span style={{ fontSize: "0.82rem", color: "var(--text)" }}>Yes — the corporation has one or more missed annual returns to catch up on.</span>
      </label>

      {details.hasMissedFilings && (
        <div style={{ marginBottom: "0.75rem" }}>
          <label style={rowLabel}>Roughly how many years overdue?</label>
          <input
            type="text"
            value={details.filingsNote}
            onChange={(e) => setDetails({ ...details, filingsNote: e.target.value })}
            placeholder="e.g. 3 years, or 'unsure — please confirm'"
            style={inputStyle}
          />
        </div>
      )}

      <div>
        <label style={rowLabel}>Reason for revival (optional)</label>
        <textarea
          value={details.reasonForRevival}
          onChange={(e) => setDetails({ ...details, reasonForRevival: e.target.value })}
          rows={2}
          placeholder="e.g. Selling assets, real estate transaction requires the corp active, resuming operations…"
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      </div>
    </div>
  );
}

/* ────────────────────────── Details helpers ────────────────────────── */

function defaultDetailsFor(key: string): Details {
  if (key === "change-directors")      return { changes: [emptyDirectorRow()] } as DirectorsDetails;
  if (key === "change-address")        return { newAddress: "", effectiveDate: "" } as AddressDetails;
  if (key === "voluntary-dissolution") return { effectiveDate: "", debtsPaid: false, finalTaxFiled: false, assetsDistributed: false, reason: "" } as DissolutionDetails;
  if (key === "revival")               return { hasMissedFilings: false, reasonForRevival: "", filingsNote: "" } as RevivalDetails;
  return {} as Details;
}

function validateDetails(key: string, d: Details): string | null {
  if (key === "change-directors") {
    const dd = d as DirectorsDetails;
    if (!dd.changes.length) return "Add at least one director or officer change.";
    for (const c of dd.changes) {
      if (!c.name.trim())        return "Every change needs the person's full legal name.";
      if (!c.effectiveDate)      return "Every change needs an effective date.";
      if (c.role === "officer" && !c.officerTitle.trim()) return "Officer changes need a title (President, Secretary, etc.).";
      if (c.type === "address-changed" && !c.newAddress.trim()) return "Address change needs the new address.";
    }
    return null;
  }
  if (key === "change-address") {
    const dd = d as AddressDetails;
    if (!dd.newAddress.trim()) return "Enter the new registered office address.";
    if (!dd.effectiveDate)     return "Enter the effective date of the address change.";
    return null;
  }
  if (key === "voluntary-dissolution") {
    const dd = d as DissolutionDetails;
    if (!dd.effectiveDate) return "Enter the effective dissolution date.";
    if (!dd.debtsPaid || !dd.finalTaxFiled || !dd.assetsDistributed) return "Confirm all three compliance items before filing dissolution.";
    return null;
  }
  if (key === "revival") {
    const dd = d as RevivalDetails;
    if (dd.hasMissedFilings && !dd.filingsNote.trim()) return "Add a note about the missed filings so we can quote catch-up filings.";
    return null;
  }
  return null;
}

/* ────────────────────────── Styles ────────────────────────── */

const cardStyle: React.CSSProperties = {
  background:    "var(--card)",
  border:        "1px solid var(--border)",
  borderRadius:  "var(--radius-card)",
  padding:       "1.25rem 1.5rem",
  marginBottom:  "1.25rem",
};
const subCardStyle: React.CSSProperties = {
  border:       "1px solid var(--border)",
  borderRadius: "0.5rem",
  padding:      "0.75rem 0.9rem",
  marginBottom: "0.5rem",
  background:   "var(--bg-deep)",
};
const inputStyle: React.CSSProperties = {
  width:        "100%",
  padding:      "0.5rem 0.7rem",
  border:       "1px solid var(--border)",
  borderRadius: "0.4rem",
  fontSize:     "0.85rem",
  background:   "var(--bg)",
  color:        "var(--text)",
};
const rowLabel: React.CSSProperties = {
  fontSize:    "0.72rem",
  fontWeight:  600,
  color:       "var(--text-muted)",
  marginBottom: "0.2rem",
  display:     "block",
};

function TwoCol({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>{children}</div>;
}
