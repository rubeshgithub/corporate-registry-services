"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, CheckCircle2, ArrowRight, Loader2, AlertCircle, FileText, Mail } from "lucide-react";
import ETransferCapture from "@/components/order/ETransferCapture";

/**
 * Corporate Documents order flow — flat $489 + GST, paid upfront via Stripe.
 *
 * Visitor lookup a corporation → picks which documents they need →
 * provides contact details → pays → documents delivered within 24 hours.
 * Once confirmed and paid, all documents are delivered within 24 hours.
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

type Screen = "lookup" | "confirm" | "success";

const DOCUMENTS: { key: string; label: string; hint: string }[] = [
  {
    key:   "original",
    label: "Original / copy of the Incorporation Document",
    hint:  "The certificate issued by the registry at the time of incorporation.",
  },
  {
    key:   "articles",
    label: "Articles of Incorporation",
    hint:  "Foundational governing document — share classes, restrictions, other provisions.",
  },
  {
    key:   "proof-filings",
    label: "Proof of filings on record",
    hint:  "Annual returns, changes to directors, shareholders, registered office, name changes — anything filed since incorporation.",
  },
  {
    key:   "full-set",
    label: "Full set of documents — everything on file, up to date",
    hint:  "Every corporate document available from the registry, from Day 1 through today. Best value.",
  },
];

const DEBOUNCE_MS = 400;
const MIN_QUERY   = 2;

export default function CorporateDocumentsFlow({ priceCents = 48900 }: { priceCents?: number }) {
  /* Price from the admin-editable catalogue via the server page. */
  const price = `$${Math.round(priceCents / 100).toLocaleString()}`;
  const params = useSearchParams();
  const initialQuery    = params.get("q") ?? "";
  const initialProvince = params.get("jurisdiction") ?? "all";
  const src             = params.get("src") ?? "direct";

  const [screen, setScreen] = useState<Screen>("lookup");

  /* Lookup state */
  const [query, setQuery]           = useState(initialQuery);
  const [province, setProvince]     = useState<string>(initialProvince);
  const [results, setResults]       = useState<RegistryHit[]>([]);
  const [searching, setSearching]   = useState(false);
  const [searchErr, setSearchErr]   = useState("");
  const searchToken = useRef(0);

  /* Confirm-screen state */
  const [hit, setHit]                 = useState<RegistryHit | null>(null);
  const [selected, setSelected]       = useState<Set<string>>(new Set(["full-set"]));
  const [notes, setNotes]             = useState("");
  const [contact, setContact]         = useState({ name: "", email: "", phone: "" });
  const [submitting, setSubmitting]   = useState(false);
  const [submitErr, setSubmitErr]     = useState("");
  const [ref, setRef]                 = useState("");

  /* Debounced search */
  useEffect(() => {
    if (screen !== "lookup") return;
    const q = query.trim();
    if (q.length < MIN_QUERY) {
      setResults([]);
      setSearchErr("");
      return;
    }
    const myToken = ++searchToken.current;
    const t = setTimeout(async () => {
      setSearching(true);
      setSearchErr("");
      try {
        const res  = await fetch(`/api/company-search?q=${encodeURIComponent(q)}&province=${province}`);
        const data = await res.json();
        if (myToken !== searchToken.current) return;
        const hits: RegistryHit[] = data.results ?? [];
        setResults(hits);
        if (!hits.length) setSearchErr("No matches — try the exact legal name, corporation number, or Business Number.");
      } catch {
        if (myToken !== searchToken.current) return;
        setSearchErr("Search is temporarily unavailable — please try again.");
        setResults([]);
      } finally {
        if (myToken === searchToken.current) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, province, screen]);

  const pickCompany = (h: RegistryHit) => {
    setHit(h);
    setScreen("confirm");
  };

  const toggleDoc = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else               next.add(key);
      return next;
    });
  };

  const canSubmit =
    !!hit &&
    selected.size > 0 &&
    contact.name.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) &&
    contact.phone.trim().length > 0;

  const submit = async () => {
    if (!canSubmit || !hit) return;
    setSubmitting(true);
    setSubmitErr("");
    try {
      const res = await fetch("/api/order/corporate-documents", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hit,
          documents: [...selected],
          notes:     notes.trim(),
          contact:   {
            name:  contact.name.trim(),
            email: contact.email.trim().toLowerCase(),
            phone: contact.phone.trim(),
          },
          src,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not submit — please try again.");
      /* Paid flow now: the API returns a Stripe Checkout URL rather than a
         quote reference, so hand off to Stripe instead of a success screen.
         Stripe returns the customer to /order/thanks. */
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("Could not start payment. Please try again.");
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : "Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Renders ─── */

  if (screen === "success") {
    return <SuccessScreen refCode={ref} company={hit?.name ?? ""} />;
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
          Corporate Documents · {price} all-in + GST
        </span>
        <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", marginTop: "0.35rem", marginBottom: "0.5rem" }}>
          Order corporate documents on file
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.5 }}>
          Articles of incorporation, historical filings, and every document ever recorded for
          the corporation — pulled directly from the government registry.
        </p>
      </div>

      {screen === "lookup" && (
        <LookupScreen
          query={query} setQuery={setQuery}
          province={province} setProvince={setProvince}
          results={results} searching={searching} searchErr={searchErr}
          onPick={pickCompany}
        />
      )}

      {screen === "confirm" && hit && (
        <ConfirmScreen
          hit={hit}
          selected={selected} toggleDoc={toggleDoc}
          notes={notes} setNotes={setNotes}
          contact={contact} setContact={setContact}
          onBack={() => setScreen("lookup")}
          onSubmit={submit} price={price} priceCents={priceCents} src={src}
          submitting={submitting} submitErr={submitErr}
          canSubmit={canSubmit}
        />
      )}
    </div>
  );
}

/* ─────────────────── LOOKUP SCREEN ─────────────────── */

function LookupScreen({
  query, setQuery, province, setProvince,
  results, searching, searchErr, onPick,
}: {
  query: string; setQuery: (v: string) => void;
  province: string; setProvince: (v: string) => void;
  results: RegistryHit[]; searching: boolean; searchErr: string;
  onPick: (h: RegistryHit) => void;
}) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", padding: "1.5rem 1.75rem", boxShadow: "var(--shadow-card)" }}>
      <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.4rem" }}>
        Which corporation?
      </label>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
        <select value={province} onChange={(e) => setProvince(e.target.value)} style={{ ...inputStyle, flex: "0 0 auto", maxWidth: 220 }}>
          <option value="all">All Canada</option>
          <option value="ab">Alberta</option>
          <option value="bc">British Columbia</option>
          <option value="on">Ontario</option>
          <option value="federal">Federal</option>
          <option value="mb">Manitoba</option>
          <option value="sk">Saskatchewan</option>
          <option value="ns">Nova Scotia</option>
          <option value="nb">New Brunswick</option>
          <option value="nl">Newfoundland</option>
          <option value="pe">Prince Edward Island</option>
          <option value="nt">NWT</option>
          <option value="yt">Yukon</option>
          <option value="nu">Nunavut</option>
        </select>
        <div style={{ flex: "3 1 240px", position: "relative", minWidth: 0 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Company name, corporation number, or Business Number"
            style={inputStyle}
            autoFocus
          />
          {searching && <Loader2 size={14} className="crs-spin" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />}
        </div>
      </div>

      {searchErr && !searching && (
        <p style={{ fontSize: "0.82rem", color: "#B91C1C", margin: "0 0 0.75rem" }}>{searchErr}</p>
      )}

      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
          {results.slice(0, 8).map((r, i) => (
            <button
              key={`${r.provinceKey}-${r.registryId}-${i}`}
              type="button"
              onClick={() => onPick(r)}
              style={{
                display: "block", width: "100%",
                textAlign: "left", padding: "0.75rem 0.9rem",
                border: "1px solid var(--border)",
                borderRadius: "0.45rem",
                background: "var(--bg)", cursor: "pointer",
                color: "var(--text)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "flex-start" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.95rem" }}>{r.name}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                    {r.jurisdiction}
                    {r.registryId ? ` · #${r.registryId}` : ""}
                    {r.location ? ` · ${r.location}` : ""}
                  </div>
                </div>
                <ArrowRight size={14} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.25rem" }} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────── CONFIRM SCREEN ─────────────────── */

function ConfirmScreen({
  hit, selected, toggleDoc, notes, setNotes,
  contact, setContact, onBack, onSubmit, price, priceCents, src,
  submitting, submitErr, canSubmit,
}: {
  hit: RegistryHit;
  selected: Set<string>; toggleDoc: (k: string) => void;
  notes: string; setNotes: (v: string) => void;
  contact: { name: string; email: string; phone: string };
  setContact: (v: { name: string; email: string; phone: string }) => void;
  onBack: () => void; onSubmit: () => void; price: string; priceCents: number; src: string;
  submitting: boolean; submitErr: string; canSubmit: boolean;
}) {
  return (
    <>
      {/* Selected company */}
      <div style={{ background: "var(--card)", border: "1px solid var(--secondary)", borderLeft: "3px solid var(--secondary)", borderRadius: "var(--radius-card)", padding: "1.25rem 1.5rem", marginBottom: "1.25rem", boxShadow: "var(--shadow-card)" }}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
              <CheckCircle2 size={16} style={{ color: "var(--secondary)", flexShrink: 0 }} />
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--secondary)", fontWeight: 700 }}>
                Verified corporation
              </span>
            </div>
            <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "1.05rem" }}>{hit.name}</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
              {hit.jurisdiction}
              {hit.registryId ? ` · #${hit.registryId}` : ""}
              {hit.location ? ` · ${hit.location}` : ""}
            </div>
          </div>
          <button type="button" onClick={onBack} style={linkBtnStyle}>Change</button>
        </div>
      </div>

      {/* Document checklist */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", padding: "1.5rem 1.75rem", marginBottom: "1.25rem", boxShadow: "var(--shadow-card)" }}>
        <div style={{ marginBottom: "0.85rem" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.2rem" }}>
            Which documents do you need?
          </label>
          <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0 }}>
            Tell us what you&apos;re chasing so we prioritise it. The price covers the full set on file either way.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {DOCUMENTS.map((d) => {
            const on = selected.has(d.key);
            return (
              <label
                key={d.key}
                style={{
                  display: "flex", alignItems: "flex-start", gap: "0.7rem",
                  padding: "0.85rem 1rem",
                  border: on ? "2px solid var(--gold)" : "1px solid var(--border)",
                  background: on ? "rgba(212,175,55,0.06)" : "var(--bg)",
                  borderRadius: "0.5rem", cursor: "pointer",
                  transition: "all 0.12s ease",
                }}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleDoc(d.key)}
                  style={{ marginTop: "0.2rem", cursor: "pointer", accentColor: "var(--gold)" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--text)" }}>{d.label}</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem", lineHeight: 1.45 }}>{d.hint}</div>
                </div>
              </label>
            );
          })}
        </div>

        <div style={{ marginTop: "1.15rem" }}>
          <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.35rem" }}>
            Anything else we should know? <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. specific date range, purpose, urgency"
            rows={2}
            style={{ ...inputStyle, resize: "vertical", minHeight: "3.5rem", fontFamily: "inherit" }}
          />
        </div>
      </div>

      {/* Contact */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", padding: "1.5rem 1.75rem", marginBottom: "1.25rem", boxShadow: "var(--shadow-card)" }}>
        <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.85rem" }}>
          Where should we send the documents?
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <div>
            <label style={miniLabel}>Full name</label>
            <input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} style={inputStyle} placeholder="Your full name" />
          </div>
          <div>
            <label style={miniLabel}>Email</label>
            <input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} style={inputStyle} placeholder="you@company.com" />
          </div>
          <div>
            <label style={miniLabel}>Phone</label>
            <input type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} style={inputStyle} placeholder="(587) 555-1234" />
          </div>
        </div>
      </div>

      {submitErr && (
        <div style={{ background: "rgba(180,83,9,0.08)", color: "#B45309", padding: "0.75rem 1rem", borderRadius: "0.4rem", fontSize: "0.85rem", marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
          <span>{submitErr}</span>
        </div>
      )}

      <button
        type="button"
        onClick={onSubmit}
        disabled={!canSubmit || submitting}
        style={{
          width: "100%", padding: "0.95rem",
          borderRadius: "0.5rem",
          background: canSubmit ? "var(--primary)" : "var(--border)",
          color: canSubmit ? "#FFFFFF" : "var(--text-muted)",
          fontSize: "0.98rem", fontWeight: 700, border: "none",
          cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
        }}
      >
        {submitting ? <Loader2 size={16} className="crs-spin" /> : <Mail size={16} />}
        {submitting ? "Redirecting to secure payment…" : `Pay ${price} + GST and order`}
      </button>

      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center", marginTop: "0.85rem", lineHeight: 1.5 }}>
        Card processed securely by Stripe. All government fees included — documents delivered by email within 24 hours.
      </p>

      <ETransferCapture
        service="corporate-documents"
        serviceLabel="Copies of Corporation Documents"
        priceLabel={`${price} all-in + GST`}
        priceCents={priceCents}
        company={{
          name:           hit.name,
          registryId:     hit.registryId,
          businessNumber: hit.businessNumber,
          jurisdiction:   hit.jurisdiction,
          provinceKey:    hit.provinceKey,
        }}
        contact={contact}
        src={src}
      />
    </>
  );
}

/* ─────────────────── SUCCESS SCREEN ─────────────────── */

function SuccessScreen({ refCode, company }: { refCode: string; company: string }) {
  return (
    <div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center" }}>
      <div style={{ width: "3.5rem", height: "3.5rem", borderRadius: "50%", background: "rgba(42,125,143,0.12)", color: "var(--secondary)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "1.25rem" }}>
        <CheckCircle2 size={30} />
      </div>
      <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", margin: "0 0 0.5rem" }}>
        Request received
      </h1>
      <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.55, margin: "0 0 1.5rem" }}>
        We&apos;re preparing your quote for <strong style={{ color: "var(--text)" }}>{company}</strong>. Watch your inbox in the next few hours.
      </p>

      {refCode && (
        <div style={{ display: "inline-block", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.45rem", padding: "0.55rem 1rem", fontFamily: "var(--font-mono), monospace", fontSize: "0.9rem", color: "var(--text)", marginBottom: "1.75rem" }}>
          Reference: <strong style={{ color: "var(--gold)" }}>{refCode}</strong>
        </div>
      )}

      <div style={{ textAlign: "left", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", padding: "1.25rem 1.5rem", boxShadow: "var(--shadow-card)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", marginBottom: "0.75rem" }}>
          <FileText size={16} style={{ color: "var(--gold)" }} />
          <span style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.95rem" }}>What happens next</span>
        </div>
        <ol style={{ margin: 0, padding: "0 0 0 1.15rem", color: "var(--text)", fontSize: "0.88rem", lineHeight: 1.7 }}>
          <li>We review what&apos;s available on file with the registry.</li>
          <li>You get a formal quote by email within a few hours.</li>
          <li>Reply to approve — we send a secure payment link.</li>
          <li>All documents delivered to your email within 24 hours.</li>
        </ol>
      </div>
    </div>
  );
}

/* ─────────────────── Styles ─────────────────── */

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

const miniLabel: React.CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  fontFamily: "var(--font-mono), monospace",
  fontWeight: 600,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: "0.3rem",
};

const linkBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--secondary)",
  fontWeight: 600,
  fontSize: "0.82rem",
  cursor: "pointer",
  padding: "0.25rem 0.5rem",
};
