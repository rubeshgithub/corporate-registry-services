"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, CheckCircle2, Clock, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { JURISDICTIONS } from "@/lib/service-config";
import PlacesInput from "@/components/PlacesInput";

// Shape returned by /api/company-search (already exists in this project).
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

/* ─── Structured "what changed" model ─── */

type DirectorChangeType    = "added" | "resigned" | "address";
type ShareholderChangeType = "added" | "resigned" | "address" | "voting";

type DirectorChange = {
  id:            string;
  type:          DirectorChangeType;
  name:          string;
  effectiveDate: string;  // ISO YYYY-MM-DD
  newAddress:    string;  // only meaningful for type === "address"
};

type ShareholderChange = {
  id:            string;
  type:          ShareholderChangeType;
  name:          string;
  effectiveDate: string;
  newAddress:    string;   // for type === "address"
  oldPercent:    string;   // for type === "voting"
  newPercent:    string;   // for type === "voting"
};

type SingleAddressChange = {
  changed:       boolean;
  newAddress:    string;
  effectiveDate: string;
};

type AgentChange = {
  changed:       boolean;
  newAgent:      string;
  effectiveDate: string;
};

type Changes = {
  directors:         DirectorChange[];
  shareholders:      ShareholderChange[];
  registeredAddress: SingleAddressChange;
  recordsAddress:    SingleAddressChange;
  authorizedAgent:   AgentChange;
  other:             string;
};

const emptyAddressChange = (): SingleAddressChange => ({ changed: false, newAddress: "", effectiveDate: "" });
const emptyAgentChange   = (): AgentChange         => ({ changed: false, newAgent: "",   effectiveDate: "" });
const emptyChanges = (): Changes => ({
  directors: [],
  shareholders: [],
  registeredAddress: emptyAddressChange(),
  recordsAddress:    emptyAddressChange(),
  authorizedAgent:   emptyAgentChange(),
  other:             "",
});
const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto)
  ? crypto.randomUUID()
  : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const emptyDirectorChange    = (): DirectorChange    => ({ id: newId(), type: "added", name: "", effectiveDate: "", newAddress: "" });
const emptyShareholderChange = (): ShareholderChange => ({ id: newId(), type: "added", name: "", effectiveDate: "", newAddress: "", oldPercent: "", newPercent: "" });

/** True if any change field has meaningful data. */
function hasAnyChange(c: Changes): boolean {
  return c.directors.length > 0
    || c.shareholders.length > 0
    || c.registeredAddress.changed
    || c.recordsAddress.changed
    || c.authorizedAgent.changed
    || c.other.trim().length > 0;
}

/** Any structural error in the current change entries (empty required fields inside an added row). */
function changeErrors(c: Changes): string | null {
  for (const d of c.directors) {
    if (!d.name.trim() || !d.effectiveDate) return "Every director change needs a name and effective date.";
    if (d.type === "address" && !d.newAddress.trim()) return "Enter the director's new address.";
  }
  for (const s of c.shareholders) {
    if (!s.name.trim() || !s.effectiveDate) return "Every shareholder change needs a name and effective date.";
    if (s.type === "address" && !s.newAddress.trim()) return "Enter the shareholder's new address.";
    if (s.type === "voting"  && (!s.oldPercent.trim() || !s.newPercent.trim())) return "Enter both old and new voting percentages.";
  }
  if (c.registeredAddress.changed && (!c.registeredAddress.newAddress.trim() || !c.registeredAddress.effectiveDate)) return "Registered address change needs the new address and effective date.";
  if (c.recordsAddress.changed    && (!c.recordsAddress.newAddress.trim()    || !c.recordsAddress.effectiveDate))    return "Records address change needs the new address and effective date.";
  if (c.authorizedAgent.changed   && (!c.authorizedAgent.newAgent.trim()     || !c.authorizedAgent.effectiveDate))   return "Authorized agent change needs the new agent and effective date.";
  return null;
}

// Given an incorporation ISO date, return the next anniversary in the future
// and a human-readable countdown string.
function nextAnniversary(incorpISO: string) {
  if (!incorpISO) return null;
  const d = new Date(incorpISO);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const anniv = new Date(Date.UTC(now.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (anniv < now) anniv.setUTCFullYear(anniv.getUTCFullYear() + 1);
  const daysAway = Math.round((anniv.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const label = anniv.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" });
  const away  = daysAway < 30
    ? `${daysAway} day${daysAway === 1 ? "" : "s"} away`
    : daysAway < 365
      ? `${Math.round(daysAway / 30)} month${Math.round(daysAway / 30) === 1 ? "" : "s"} away`
      : "over a year away";
  return { date: label, away, daysAway };
}

export default function OrderFlow() {
  const params = useSearchParams();
  const initialJurisdiction = params.get("jurisdiction") ?? "all";
  const attributionSrc      = params.get("src") ?? "direct";
  const outreachRef         = params.get("ref") ?? "";

  const [screen, setScreen] = useState<Screen>("lookup");

  // Lookup screen state
  const [query, setQuery]         = useState("");
  const [province, setProvince]   = useState<string>(initialJurisdiction);
  const [results, setResults]     = useState<RegistryHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");

  // Confirm screen state
  const [pick, setPick]           = useState<RegistryHit | null>(null);
  const [years, setYears]         = useState<number>(1);
  const [changes, setChanges]     = useState<Changes>(emptyChanges());
  const [contact, setContact]     = useState({ name: "", email: "", phone: "" });
  const [paying, setPaying]       = useState(false);
  const [payErr, setPayErr]       = useState("");

  const changeErr = changeErrors(changes);

  const priceLabel = years === 1 ? "$99 all-in + GST" : `$${99 * years} all-in + GST`;
  const buttonLabel = years === 1
    ? "Pay $99 + GST and file"
    : `Pay $${99 * years} + GST and file ${years} years`;

  // Read initial query and years from URL. If ?q= is present the visitor
  // arrived from the company-search page with a specific pick — auto-run the
  // lookup, and if ?registryId= matches one of the hits, jump straight to
  // the confirm screen so they don't have to search twice.
  useEffect(() => {
    const q = params.get("q");
    const y = parseInt(params.get("years") ?? "", 10);
    if (Number.isFinite(y) && y >= 1 && y <= 10) setYears(y);
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
      const res = await fetch(`/api/company-search?q=${encodeURIComponent(q)}&province=${province}`);
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
    !!contact.phone.trim() &&
    changeErr === null;

  const goToPayment = async () => {
    if (!pick || !canPay) return;
    setPayErr("");
    setPaying(true);
    try {
      const res = await fetch("/api/order/annual-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hit: pick,
          years,
          changes,
          contact,
          src: attributionSrc,
          ref: outreachRef,
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

  const anniv = pick ? nextAnniversary(pick.registrationDate) : null;

  // ────────────────── SCREEN 1: LOOKUP ──────────────────
  if (screen === "lookup") {
    return (
      <div style={{ maxWidth: 620, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <span
            style={{
              fontFamily: "var(--font-mono), monospace",
              fontSize: "0.7rem",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              color: "var(--gold)",
            }}
          >
            Annual Return · from $99 all-in + GST
          </span>
          <h1
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              fontSize: "1.75rem",
              fontWeight: 700,
              color: "var(--text)",
              marginTop: "0.35rem",
              marginBottom: "0.5rem",
            }}
          >
            Find your company
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            We&apos;ll pull the government record and pre-fill your filing.
          </p>
        </div>

        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-card)",
            padding: "1.25rem",
            boxShadow: "var(--shadow)",
          }}
        >
          <label
            htmlFor="ar-q"
            style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem" }}
          >
            Company name, Corporate Access Number, or Business Number
          </label>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              id="ar-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
              placeholder="e.g. Acme Holdings, 2094832, or 123456789RC0001"
              style={{
                flex: "3 1 260px",
                padding: "0.65rem 0.85rem",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                fontSize: "0.9rem",
                background: "var(--bg)",
                color: "var(--text)",
              }}
            />
            <select
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              style={{
                flex: "1 1 160px",
                padding: "0.65rem 0.75rem",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                fontSize: "0.85rem",
                background: "var(--bg)",
                color: "var(--text)",
              }}
            >
              <option value="all">All of Canada</option>
              {JURISDICTIONS.map((j) => (
                <option key={j.key} value={j.key}>{j.label}</option>
              ))}
            </select>
            <button
              onClick={runSearch}
              disabled={searching}
              style={{
                flex: "0 0 auto",
                padding: "0.65rem 1.1rem",
                background: "var(--primary)",
                color: "#FFFFFF",
                fontWeight: 600,
                fontSize: "0.9rem",
                border: "none",
                borderRadius: "0.5rem",
                cursor: searching ? "wait" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
              }}
            >
              {searching ? <Loader2 size={14} className="crs-spin" /> : <Search size={14} />} Find
            </button>
          </div>
          {searchErr && (
            <p style={{ color: "#B45309", fontSize: "0.8rem", marginTop: "0.75rem" }}>{searchErr}</p>
          )}
        </div>

        {results.length > 0 && (
          <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {results.slice(0, 5).map((hit, i) => (
              <button
                key={`${hit.provinceKey}-${hit.registryId}-${i}`}
                onClick={() => chooseHit(hit)}
                style={{
                  textAlign: "left",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.5rem",
                  padding: "0.9rem 1rem",
                  cursor: "pointer",
                  display: "flex",
                  gap: "0.75rem",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
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
          Data pulled live from federal & provincial registries. QC uses REQ.
        </p>
      </div>
    );
  }

  // ────────────────── SCREEN 2: CONFIRM & PAY ──────────────────
  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <button
          onClick={() => setScreen("lookup")}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            fontSize: "0.8rem",
            cursor: "pointer",
            padding: 0,
          }}
        >
          ← Pick a different company
        </button>
      </div>

      {/* Registry card */}
      {pick && (
        <div
          style={{
            background: "var(--card)",
            border: "1px solid var(--gold)",
            borderRadius: "var(--radius-card)",
            padding: "1.25rem 1.5rem",
            marginBottom: "1.25rem",
            boxShadow: "var(--shadow)",
          }}
        >
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

          {anniv && (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.7rem 0.9rem",
                background: "var(--gold-dim)",
                borderRadius: "0.5rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Clock size={16} style={{ color: "var(--gold)", flexShrink: 0 }} />
              <div style={{ fontSize: "0.8rem", color: "var(--text)" }}>
                Next annual return anniversary:{" "}
                <strong>{anniv.date}</strong> <span style={{ color: "var(--text-muted)" }}>({anniv.away})</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* How many years to file? */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          padding: "1.25rem 1.5rem",
          marginBottom: "1.25rem",
        }}
      >
        <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.35rem" }}>
          How many years do you need to file?
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 0.6rem" }}>
          One filing per outstanding year. Behind on filings? Pick the total number of missed years plus the current one.
        </p>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              onClick={() => setYears(n)}
              style={{
                padding: "0.45rem 0.85rem",
                border: `1.5px solid ${years === n ? "var(--gold)" : "var(--border)"}`,
                background: years === n ? "var(--gold-dim)" : "transparent",
                color: "var(--text)",
                fontWeight: years === n ? 700 : 500,
                fontSize: "0.85rem",
                borderRadius: "0.4rem",
                cursor: "pointer",
              }}
            >
              {n === 6 ? "6 +" : `${n} year${n === 1 ? "" : "s"}`}
            </button>
          ))}
        </div>
        {years >= 6 && (
          <input
            type="number"
            min={6}
            max={10}
            value={years}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (Number.isFinite(v) && v >= 6 && v <= 10) setYears(v);
            }}
            style={{
              marginTop: "0.6rem",
              width: "8rem",
              padding: "0.5rem 0.75rem",
              border: "1px solid var(--border)",
              borderRadius: "0.4rem",
              fontSize: "0.85rem",
              background: "var(--bg)",
              color: "var(--text)",
            }}
            aria-label="Number of years"
          />
        )}
        <div style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Total: <strong style={{ color: "var(--text)" }}>{priceLabel}</strong>{years > 1 ? ` (${years} × $99)` : ""}
        </div>
      </div>

      {/* What changed? */}
      <ChangesSection years={years} changes={changes} setChanges={setChanges} error={changeErr} />

      {/* Contact */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          padding: "1.25rem 1.5rem",
          marginBottom: "1.25rem",
        }}
      >
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
              style={{
                width: "100%",
                padding: "0.6rem 0.85rem",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                fontSize: "0.9rem",
                background: "var(--bg)",
                color: "var(--text)",
              }}
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
        style={{
          width: "100%",
          padding: "0.85rem 1rem",
          background: canPay ? "var(--primary)" : "var(--border)",
          color: "#FFFFFF",
          fontWeight: 700,
          fontSize: "1rem",
          border: "none",
          borderRadius: "0.5rem",
          cursor: canPay && !paying ? "pointer" : "not-allowed",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
        }}
      >
        {paying ? (
          <>
            <Loader2 size={16} className="crs-spin" /> Redirecting to secure payment…
          </>
        ) : (
          <>{buttonLabel} <ArrowRight size={16} /></>
        )}
      </button>

      <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", textAlign: "center", marginTop: "0.75rem" }}>
        Card processed securely by Stripe. We&apos;ll file within 24 hours and email a filing confirmation.
      </p>
    </div>
  );
}

/* ────────────────────── ChangesSection ──────────────────────
   Structured capture of everything that changed since last filing.
   Rendered on the confirm screen; each subsection is optional. */

const DIRECTOR_TYPES: Array<{ v: DirectorChangeType; l: string }> = [
  { v: "added",    l: "Appointed" },
  { v: "resigned", l: "Resigned" },
  { v: "address",  l: "Address changed" },
];
const SHAREHOLDER_TYPES: Array<{ v: ShareholderChangeType; l: string }> = [
  { v: "added",    l: "Added" },
  { v: "resigned", l: "Sold / resigned" },
  { v: "address",  l: "Address changed" },
  { v: "voting",   l: "Voting % changed" },
];

const cardStyle: React.CSSProperties = {
  background:    "var(--card)",
  border:        "1px solid var(--border)",
  borderRadius:  "var(--radius-card)",
  padding:       "1.25rem 1.5rem",
  marginBottom:  "1.25rem",
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
const subCardStyle: React.CSSProperties = {
  border:       "1px solid var(--border)",
  borderRadius: "0.5rem",
  padding:      "0.75rem 0.9rem",
  marginBottom: "0.5rem",
  background:   "var(--bg-deep)",
};
const rowLabel: React.CSSProperties = {
  fontSize:    "0.7rem",
  fontWeight:  600,
  color:       "var(--text-muted)",
  marginBottom: "0.2rem",
  display:     "block",
};

function ChangesSection({
  years, changes, setChanges, error,
}: {
  years:   number;
  changes: Changes;
  setChanges: (c: Changes) => void;
  error:   string | null;
}) {
  const patchDirector = (id: string, p: Partial<DirectorChange>) => {
    setChanges({ ...changes, directors: changes.directors.map((d) => d.id === id ? { ...d, ...p } : d) });
  };
  const removeDirector = (id: string) => setChanges({ ...changes, directors: changes.directors.filter((d) => d.id !== id) });
  const addDirector    = () => setChanges({ ...changes, directors: [...changes.directors, emptyDirectorChange()] });

  const patchShareholder  = (id: string, p: Partial<ShareholderChange>) => {
    setChanges({ ...changes, shareholders: changes.shareholders.map((s) => s.id === id ? { ...s, ...p } : s) });
  };
  const removeShareholder = (id: string) => setChanges({ ...changes, shareholders: changes.shareholders.filter((s) => s.id !== id) });
  const addShareholder    = () => setChanges({ ...changes, shareholders: [...changes.shareholders, emptyShareholderChange()] });

  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.35rem" }}>
        {years === 1 ? "Has anything changed since last year?" : "Any changes over these years?"}
      </div>
      <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 1rem" }}>
        Leave any section empty if that area is unchanged. Most annual returns need nothing at all here.
      </p>

      {/* Directors */}
      <SectionTitle label="Director changes" />
      {changes.directors.map((d) => (
        <div key={d.id} style={subCardStyle}>
          <TwoCol>
            <div>
              <label style={rowLabel}>Change type</label>
              <select value={d.type} onChange={(e) => patchDirector(d.id, { type: e.target.value as DirectorChangeType })} style={inputStyle}>
                {DIRECTOR_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
            <div>
              <label style={rowLabel}>Effective date</label>
              <input type="date" value={d.effectiveDate} onChange={(e) => patchDirector(d.id, { effectiveDate: e.target.value })} style={inputStyle} />
            </div>
          </TwoCol>
          <div style={{ marginTop: "0.5rem" }}>
            <label style={rowLabel}>Director&apos;s full name</label>
            <input type="text" value={d.name} onChange={(e) => patchDirector(d.id, { name: e.target.value })} placeholder="Jane Doe" style={inputStyle} />
          </div>
          {d.type === "address" && (
            <div style={{ marginTop: "0.5rem" }}>
              <label style={rowLabel}>New address</label>
              <PlacesInput
                value={d.newAddress}
                onChange={(e) => patchDirector(d.id, { newAddress: e.target.value })}
                onPlaceSelected={(p) => patchDirector(d.id, { newAddress: p.formatted })}
                placeholder="Start typing an address…"
                style={inputStyle}
              />
            </div>
          )}
          <RemoveButton onClick={() => removeDirector(d.id)} label="Remove this change" />
        </div>
      ))}
      <AddInlineButton label={changes.directors.length === 0 ? "+ Add a director change" : "+ Add another director change"} onClick={addDirector} />

      {/* Shareholders */}
      <SectionTitle label="Shareholder changes" hint="Not required until first-year tax filing — add here if you'd like it on record now." />
      {changes.shareholders.map((s) => (
        <div key={s.id} style={subCardStyle}>
          <TwoCol>
            <div>
              <label style={rowLabel}>Change type</label>
              <select value={s.type} onChange={(e) => patchShareholder(s.id, { type: e.target.value as ShareholderChangeType })} style={inputStyle}>
                {SHAREHOLDER_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
              </select>
            </div>
            <div>
              <label style={rowLabel}>Effective date</label>
              <input type="date" value={s.effectiveDate} onChange={(e) => patchShareholder(s.id, { effectiveDate: e.target.value })} style={inputStyle} />
            </div>
          </TwoCol>
          <div style={{ marginTop: "0.5rem" }}>
            <label style={rowLabel}>Shareholder&apos;s full name</label>
            <input type="text" value={s.name} onChange={(e) => patchShareholder(s.id, { name: e.target.value })} placeholder="John Smith" style={inputStyle} />
          </div>
          {s.type === "address" && (
            <div style={{ marginTop: "0.5rem" }}>
              <label style={rowLabel}>New address</label>
              <PlacesInput
                value={s.newAddress}
                onChange={(e) => patchShareholder(s.id, { newAddress: e.target.value })}
                onPlaceSelected={(p) => patchShareholder(s.id, { newAddress: p.formatted })}
                placeholder="Start typing an address…"
                style={inputStyle}
              />
            </div>
          )}
          {s.type === "voting" && (
            <TwoCol style={{ marginTop: "0.5rem" }}>
              <div>
                <label style={rowLabel}>Old voting %</label>
                <input type="text" value={s.oldPercent} onChange={(e) => patchShareholder(s.id, { oldPercent: e.target.value })} placeholder="e.g. 40" style={inputStyle} />
              </div>
              <div>
                <label style={rowLabel}>New voting %</label>
                <input type="text" value={s.newPercent} onChange={(e) => patchShareholder(s.id, { newPercent: e.target.value })} placeholder="e.g. 60" style={inputStyle} />
              </div>
            </TwoCol>
          )}
          <RemoveButton onClick={() => removeShareholder(s.id)} label="Remove this change" />
        </div>
      ))}
      <AddInlineButton label={changes.shareholders.length === 0 ? "+ Add a shareholder change" : "+ Add another shareholder change"} onClick={addShareholder} />

      {/* Registered address */}
      <SingleToggleSection
        title="Registered address change"
        checked={changes.registeredAddress.changed}
        onToggle={(v) => setChanges({ ...changes, registeredAddress: { ...changes.registeredAddress, changed: v } })}
      >
        <div>
          <label style={rowLabel}>New registered address</label>
          <PlacesInput
            value={changes.registeredAddress.newAddress}
            onChange={(e) => setChanges({ ...changes, registeredAddress: { ...changes.registeredAddress, newAddress: e.target.value } })}
            onPlaceSelected={(p) => setChanges({ ...changes, registeredAddress: { ...changes.registeredAddress, newAddress: p.formatted } })}
            placeholder="Start typing the new registered address…"
            style={inputStyle}
          />
        </div>
        <div style={{ marginTop: "0.5rem" }}>
          <label style={rowLabel}>Effective date</label>
          <input
            type="date"
            value={changes.registeredAddress.effectiveDate}
            onChange={(e) => setChanges({ ...changes, registeredAddress: { ...changes.registeredAddress, effectiveDate: e.target.value } })}
            style={inputStyle}
          />
        </div>
      </SingleToggleSection>

      {/* Records address */}
      <SingleToggleSection
        title="Records address change"
        checked={changes.recordsAddress.changed}
        onToggle={(v) => setChanges({ ...changes, recordsAddress: { ...changes.recordsAddress, changed: v } })}
      >
        <div>
          <label style={rowLabel}>New records address</label>
          <PlacesInput
            value={changes.recordsAddress.newAddress}
            onChange={(e) => setChanges({ ...changes, recordsAddress: { ...changes.recordsAddress, newAddress: e.target.value } })}
            onPlaceSelected={(p) => setChanges({ ...changes, recordsAddress: { ...changes.recordsAddress, newAddress: p.formatted } })}
            placeholder="Start typing the new records address…"
            style={inputStyle}
          />
        </div>
        <div style={{ marginTop: "0.5rem" }}>
          <label style={rowLabel}>Effective date</label>
          <input
            type="date"
            value={changes.recordsAddress.effectiveDate}
            onChange={(e) => setChanges({ ...changes, recordsAddress: { ...changes.recordsAddress, effectiveDate: e.target.value } })}
            style={inputStyle}
          />
        </div>
      </SingleToggleSection>

      {/* Authorized agent */}
      <SingleToggleSection
        title="Authorized agent change"
        checked={changes.authorizedAgent.changed}
        onToggle={(v) => setChanges({ ...changes, authorizedAgent: { ...changes.authorizedAgent, changed: v } })}
      >
        <div>
          <label style={rowLabel}>New authorized agent</label>
          <input
            type="text"
            value={changes.authorizedAgent.newAgent}
            onChange={(e) => setChanges({ ...changes, authorizedAgent: { ...changes.authorizedAgent, newAgent: e.target.value } })}
            placeholder="Name of new authorized agent"
            style={inputStyle}
          />
        </div>
        <div style={{ marginTop: "0.5rem" }}>
          <label style={rowLabel}>Effective date</label>
          <input
            type="date"
            value={changes.authorizedAgent.effectiveDate}
            onChange={(e) => setChanges({ ...changes, authorizedAgent: { ...changes.authorizedAgent, effectiveDate: e.target.value } })}
            style={inputStyle}
          />
        </div>
      </SingleToggleSection>

      {/* Other */}
      <SectionTitle label="Other changes" hint="Anything else we should file (name change, share structure, restrictions, etc.)." />
      <textarea
        value={changes.other}
        onChange={(e) => setChanges({ ...changes, other: e.target.value })}
        placeholder="Describe any other change. Leave blank if none."
        rows={2}
        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
      />

      {error && (
        <div style={{ marginTop: "0.75rem", padding: "0.5rem 0.75rem", background: "rgba(180,83,9,0.08)", color: "#B45309", fontSize: "0.78rem", borderRadius: "0.4rem" }}>
          {error}
        </div>
      )}
    </div>
  );
}

/* ── Small helpers used inside ChangesSection ── */

function SectionTitle({ label, hint }: { label: string; hint?: string }) {
  return (
    <div style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>
      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text)" }}>{label}</div>
      {hint && <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>{hint}</div>}
    </div>
  );
}

function TwoCol({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", ...style }}>{children}</div>;
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ marginTop: "0.5rem", background: "none", border: "none", color: "#B45309", fontSize: "0.72rem", cursor: "pointer", padding: 0 }}
    >
      {label}
    </button>
  );
}

function AddInlineButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        padding: "0.4rem 0.75rem",
        border: "1.5px dashed var(--border)",
        borderRadius: "0.4rem",
        background: "transparent",
        color: "var(--text-muted)",
        fontSize: "0.78rem",
        fontWeight: 500,
        cursor: "pointer",
        marginTop: "0.35rem",
      }}
    >
      {label}
    </button>
  );
}

function SingleToggleSection({
  title, checked, onToggle, children,
}: {
  title:    string;
  checked:  boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: "1rem", padding: "0.7rem 0.85rem", border: "1px solid var(--border)", borderRadius: "0.5rem" }}>
      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem", color: "var(--text)" }}>
        <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
        {title}
      </label>
      {checked && <div style={{ marginTop: "0.6rem" }}>{children}</div>}
    </div>
  );
}
