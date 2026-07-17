"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, CheckCircle2, ArrowRight, Loader2, AlertCircle, HelpCircle, Mail, MessageCircle } from "lucide-react";
import type {
  CorpDocServiceConfig,
  CorpDocServiceKey,
  ShareCertificateDetails,
  DirectorResolutionDetails,
  DirectorResolutionType,
  ShareholderResolutionDetails,
  ShareholderResolutionType,
  BylawsDetails,
  BylawsFlavour,
} from "@/lib/corp-doc-config";

/**
 * Shared checkout for the four "corporate document" services:
 * share-certificate, director-resolution, shareholder-resolution, bylaws.
 *
 * Same three-screen shape as ChangeOrderFlow:
 *   1. Registry lookup — identify the corp
 *   2. Service-specific detail form (progressive disclosure by type)
 *   3. Contact + Stripe checkout
 *
 * Help affordance is visible on every screen — the fulfillment team's
 * chat widget (Crisp) is embedded site-wide; the "Not sure? Ask us"
 * anchor opens it, and a mailto fallback covers users with the chat
 * widget blocked.
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

type Screen = "lookup" | "details";

type Details = ShareCertificateDetails | DirectorResolutionDetails | ShareholderResolutionDetails | BylawsDetails;

/* ────────────────────────── Component ────────────────────────── */

export default function CorpDocOrderFlow({ config }: { config: CorpDocServiceConfig }) {
  const params        = useSearchParams();
  const attributionSrc = params.get("src") ?? "direct";

  const [screen, setScreen] = useState<Screen>("lookup");

  /* Lookup state */
  const [query, setQuery]         = useState("");
  const [province, setProvince]   = useState<string>(params.get("jurisdiction") ?? "all");
  const [results, setResults]     = useState<RegistryHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");

  /* Selection + details + contact state */
  const [pick, setPick]           = useState<RegistryHit | null>(null);
  const [details, setDetails]     = useState<Details>(() => defaultDetailsFor(config.key));
  const [contact, setContact]     = useState({ name: "", email: "", phone: "" });
  const [paying, setPaying]       = useState(false);
  const [payErr, setPayErr]       = useState("");

  /* Restart when the config changes (e.g. between service pages during dev). */
  useEffect(() => { setDetails(defaultDetailsFor(config.key)); }, [config.key]);

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) { setSearchErr("Enter at least 2 characters."); return; }
    setSearchErr("");
    setSearching(true);
    try {
      const res  = await fetch(`/api/company-search?q=${encodeURIComponent(q)}&province=${province}`);
      const data = await res.json();
      const hits: RegistryHit[] = data.results ?? [];
      setResults(hits);
      if (!hits.length) setSearchErr("No matching records. Try the exact registered name.");
    } catch {
      setSearchErr("Search is temporarily unavailable. Please try again.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const selectHit = (hit: RegistryHit) => {
    setPick(hit);
    setScreen("details");
  };

  const canPay =
    !!pick &&
    !!contact.name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) &&
    !!contact.phone.trim() &&
    detailsAreValid(config.key, details);

  const submit = async () => {
    if (!pick || !canPay) return;
    setPayErr("");
    setPaying(true);
    try {
      const res = await fetch("/api/order/corp-doc", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          service: config.key,
          hit:     pick,
          details,
          contact,
          src:     attributionSrc,
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) window.location.href = data.url;
      else setPayErr(data.error || "Could not start payment. Please try again.");
    } catch {
      setPayErr("Network error. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "2.5rem 1.5rem 4rem" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
          {config.label} · {config.priceLabel}
        </div>
        <h1 className="card-heading" style={{ fontSize: "1.6rem", margin: "0.35rem 0 0.5rem" }}>
          {config.headline}
        </h1>
        <p style={{ fontSize: "0.92rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
          {config.description}
        </p>
      </header>

      {screen === "lookup" && (
        <LookupScreen
          query={query} setQuery={setQuery}
          province={province} setProvince={setProvince}
          results={results}
          searching={searching}
          searchErr={searchErr}
          onSearch={runSearch}
          onSelect={selectHit}
        />
      )}

      {screen === "details" && pick && (
        <DetailsScreen
          config={config}
          pick={pick}
          onChangeCorp={() => { setScreen("lookup"); setPick(null); }}
          details={details}
          setDetails={setDetails}
          contact={contact}
          setContact={setContact}
          canPay={canPay}
          paying={paying}
          payErr={payErr}
          onSubmit={submit}
        />
      )}

      <HelpFooter serviceLabel={config.label} />
    </div>
  );
}

/* ────────────────────────── Lookup screen ────────────────────────── */

function LookupScreen({ query, setQuery, province, setProvince, results, searching, searchErr, onSearch, onSelect }: {
  query: string; setQuery: (v: string) => void;
  province: string; setProvince: (v: string) => void;
  results: RegistryHit[];
  searching: boolean;
  searchErr: string;
  onSearch: () => void;
  onSelect: (h: RegistryHit) => void;
}) {
  return (
    <section style={cardStyle}>
      <div style={sectionHeading}>Step 1 · Find your corporation</div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <select
          value={province}
          onChange={(e) => setProvince(e.target.value)}
          style={{ ...inputStyle, flex: "0 0 auto", maxWidth: 200 }}
        >
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
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSearch(); } }}
          placeholder="Company name, Corporate Access Number, or Business Number"
          style={{ ...inputStyle, flex: "3 1 240px" }}
        />
        <button
          onClick={onSearch}
          disabled={searching}
          style={{ ...buttonStyle, flex: "0 0 auto" }}
        >
          {searching ? <Loader2 size={14} className="crs-spin" /> : <Search size={14} />} Find
        </button>
      </div>
      {searchErr && <p style={errTextStyle}>{searchErr}</p>}

      {results.length > 0 && (
        <div style={{ marginTop: "0.9rem", display: "flex", flexDirection: "column", gap: "0.55rem" }}>
          {results.slice(0, 6).map((hit, i) => (
            <button
              key={`${hit.provinceKey}-${hit.registryId}-${i}`}
              onClick={() => onSelect(hit)}
              style={{
                textAlign: "left",
                padding: "0.75rem 0.9rem",
                background: "var(--bg-deep)",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                cursor: "pointer",
                color: "var(--text)",
                fontFamily: "inherit",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.92rem" }}>{hit.name}</div>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                {hit.registryId ? `${hit.registryId} · ` : ""}{hit.entityType} · {hit.jurisdiction} · {hit.status}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/* ────────────────────────── Details screen ────────────────────────── */

function DetailsScreen(props: {
  config: CorpDocServiceConfig;
  pick: RegistryHit;
  onChangeCorp: () => void;
  details: Details;
  setDetails: (d: Details) => void;
  contact: { name: string; email: string; phone: string };
  setContact: (c: { name: string; email: string; phone: string }) => void;
  canPay: boolean;
  paying: boolean;
  payErr: string;
  onSubmit: () => void;
}) {
  const { config, pick, onChangeCorp, details, setDetails, contact, setContact, canPay, paying, payErr, onSubmit } = props;

  return (
    <section style={cardStyle}>
      {/* Picked corp confirm */}
      <div
        style={{
          padding: "0.75rem 0.9rem",
          background: "var(--bg-deep)",
          border: "1px solid var(--gold)",
          borderRadius: "0.5rem",
          marginBottom: "1rem",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
            <CheckCircle2 size={16} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.15rem" }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.95rem" }}>{pick.name}</div>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                {pick.registryId ? `${pick.registryId} · ` : ""}{pick.entityType} · {pick.jurisdiction}
              </div>
            </div>
          </div>
        </div>
        <button onClick={onChangeCorp} style={{ background: "none", border: "none", fontSize: "0.72rem", color: "var(--text-muted)", cursor: "pointer", flexShrink: 0 }}>
          ← Change
        </button>
      </div>

      <div style={sectionHeading}>Step 2 · {config.label} details</div>

      {config.key === "share-certificate" && (
        <ShareCertificateForm details={details as ShareCertificateDetails} setDetails={(d) => setDetails(d)} />
      )}
      {config.key === "director-resolution" && (
        <DirectorResolutionForm details={details as DirectorResolutionDetails} setDetails={(d) => setDetails(d)} />
      )}
      {config.key === "shareholder-resolution" && (
        <ShareholderResolutionForm details={details as ShareholderResolutionDetails} setDetails={(d) => setDetails(d)} />
      )}
      {config.key === "bylaws" && (
        <BylawsForm details={details as BylawsDetails} setDetails={(d) => setDetails(d)} />
      )}

      {/* Contact */}
      <div style={{ marginTop: "1.5rem" }}>
        <div style={sectionHeading}>Step 3 · Your contact info</div>
        {[
          { key: "name",  label: "Full name",  type: "text",  placeholder: "Jane Doe" },
          { key: "email", label: "Email",      type: "email", placeholder: "jane@company.ca" },
          { key: "phone", label: "Phone",      type: "tel",   placeholder: "(403) 555-0123" },
        ].map(({ key, label, type, placeholder }) => (
          <div key={key} style={{ marginBottom: "0.55rem" }}>
            <label style={fieldLabelStyle}>{label}</label>
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
        <div style={{ padding: "0.55rem 0.75rem", background: "rgba(180,83,9,0.10)", color: "#B45309", fontSize: "0.82rem", borderRadius: "0.4rem", marginTop: "0.75rem", display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
          <AlertCircle size={14} style={{ marginTop: "0.1rem", flexShrink: 0 }} />
          <span>{payErr}</span>
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={!canPay || paying}
        style={{
          width: "100%",
          marginTop: "1rem",
          padding: "0.85rem 1rem",
          background: canPay ? "var(--primary)" : "var(--border)",
          color: "#fff",
          fontWeight: 700,
          fontSize: "0.95rem",
          border: "none",
          borderRadius: "0.5rem",
          cursor: canPay && !paying ? "pointer" : "not-allowed",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.4rem",
        }}
      >
        {paying ? (
          <><Loader2 size={16} className="crs-spin" /> Redirecting to secure payment…</>
        ) : (
          <>{config.buttonLabel} <ArrowRight size={16} /></>
        )}
      </button>
      <p style={{ color: "var(--text-muted)", fontSize: "0.7rem", textAlign: "center", marginTop: "0.55rem" }}>
        Card processed securely by Stripe. {config.deliveryPromise}
      </p>
    </section>
  );
}

/* ────────────────────── Sub-forms per service ────────────────────── */

function ShareCertificateForm({ details, setDetails }: {
  details: ShareCertificateDetails;
  setDetails: (d: ShareCertificateDetails) => void;
}) {
  const set = <K extends keyof ShareCertificateDetails>(k: K, v: ShareCertificateDetails[K]) => setDetails({ ...details, [k]: v });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <Field label="Shareholder full legal name" required>
        <input value={details.shareholderName} onChange={(e) => set("shareholderName", e.target.value)} placeholder="Jane Doe / Acme Holdings Inc." style={inputStyle} />
      </Field>
      <Field label="Shareholder address" required>
        <textarea value={details.shareholderAddress} onChange={(e) => set("shareholderAddress", e.target.value)} placeholder="Street, city, province, postal code" rows={2} style={{ ...inputStyle, resize: "vertical", minHeight: 44 }} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <Field label="Share class" required>
          <select value={details.shareClass} onChange={(e) => set("shareClass", e.target.value)} style={inputStyle}>
            <option value="">Select…</option>
            <option value="Common">Common</option>
            <option value="Class A">Class A</option>
            <option value="Class B">Class B</option>
            <option value="Preferred">Preferred</option>
            <option value="Other">Other (specify in notes)</option>
          </select>
        </Field>
        <Field label="Number of shares" required>
          <input type="number" min={1} value={details.numShares || ""} onChange={(e) => set("numShares", parseInt(e.target.value, 10) || 0)} placeholder="100" style={inputStyle} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <Field label="Issue date" required>
          <input type="date" value={details.issueDate} onChange={(e) => set("issueDate", e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Number of certificates" required>
          <input type="number" min={1} value={details.numCertificates || ""} onChange={(e) => set("numCertificates", parseInt(e.target.value, 10) || 1)} placeholder="1" style={inputStyle} />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <Field label="Signing officer name" required>
          <input value={details.signingOfficerName} onChange={(e) => set("signingOfficerName", e.target.value)} placeholder="Jane Doe" style={inputStyle} />
        </Field>
        <Field label="Signing officer role" required>
          <select value={details.signingOfficerRole} onChange={(e) => set("signingOfficerRole", e.target.value)} style={inputStyle}>
            <option value="">Select…</option>
            <option value="Director">Director</option>
            <option value="President">President</option>
            <option value="Secretary">Secretary</option>
            <option value="Treasurer">Treasurer</option>
            <option value="Other">Other</option>
          </select>
        </Field>
      </div>
      <Field label="Consideration ($ paid, optional)" hint="You can leave blank — we'll ask by email if we need it">
        <input type="number" step="0.01" min={0} value={details.consideration ?? ""} onChange={(e) => set("consideration", e.target.value ? parseFloat(e.target.value) : undefined)} placeholder="e.g. 100.00" style={inputStyle} />
      </Field>
      <Field label="Special instructions" hint="Anything unusual we should know">
        <textarea value={details.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical", minHeight: 44 }} />
      </Field>
    </div>
  );
}

function DirectorResolutionForm({ details, setDetails }: {
  details: DirectorResolutionDetails;
  setDetails: (d: DirectorResolutionDetails) => void;
}) {
  const set = <K extends keyof DirectorResolutionDetails>(k: K, v: DirectorResolutionDetails[K]) => setDetails({ ...details, [k]: v });
  const t = details.resolutionType;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <Field label="Resolution type" required>
        <select value={t} onChange={(e) => set("resolutionType", e.target.value as DirectorResolutionType)} style={inputStyle}>
          <option value="annual-package">Annual package (yearly)</option>
          <option value="organizational">Organizational (first-ever, at incorporation)</option>
          <option value="share-issuance">Share issuance (approve allotment)</option>
          <option value="officer-appointment">Officer appointment / change</option>
          <option value="banking">Banking arrangements</option>
          <option value="dividend">Dividend declaration</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Effective date" required>
        <input type="date" value={details.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Directors' names (all who will sign)" required hint="Comma-separated. All directors must sign a written resolution.">
        <textarea value={details.directorsNames} onChange={(e) => set("directorsNames", e.target.value)} placeholder="e.g. Jane Doe, John Smith" rows={2} style={{ ...inputStyle, resize: "vertical", minHeight: 44 }} />
      </Field>

      {t === "annual-package" && (
        <>
          <Field label="Fiscal year end" required>
            <input type="date" value={details.fiscalYearEnd ?? ""} onChange={(e) => set("fiscalYearEnd", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Officer changes this year?">
            <YesNo value={details.hasOfficerChanges} onChange={(v) => set("hasOfficerChanges", v)} />
          </Field>
          <Field label="Dividends declared this year?">
            <YesNo value={details.hasDividendsThisYear} onChange={(v) => set("hasDividendsThisYear", v)} />
          </Field>
        </>
      )}

      {t === "share-issuance" && (
        <>
          <Field label="New shareholder name" required>
            <input value={details.newShareholderName ?? ""} onChange={(e) => set("newShareholderName", e.target.value)} style={inputStyle} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <Field label="Share class" required>
              <input value={details.shareIssueClass ?? ""} onChange={(e) => set("shareIssueClass", e.target.value)} placeholder="Common" style={inputStyle} />
            </Field>
            <Field label="Number of shares" required>
              <input type="number" min={1} value={details.shareIssueCount ?? ""} onChange={(e) => set("shareIssueCount", parseInt(e.target.value, 10) || undefined)} style={inputStyle} />
            </Field>
          </div>
          <Field label="Consideration ($ paid)" required>
            <input type="number" step="0.01" min={0} value={details.shareIssueConsideration ?? ""} onChange={(e) => set("shareIssueConsideration", e.target.value ? parseFloat(e.target.value) : undefined)} style={inputStyle} />
          </Field>
        </>
      )}

      {t === "officer-appointment" && (
        <>
          <Field label="Officer name" required>
            <input value={details.officerName ?? ""} onChange={(e) => set("officerName", e.target.value)} style={inputStyle} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <Field label="Position" required>
              <select value={details.officerPosition ?? ""} onChange={(e) => set("officerPosition", e.target.value)} style={inputStyle}>
                <option value="">Select…</option>
                <option>President</option>
                <option>Secretary</option>
                <option>Treasurer</option>
                <option>Vice-President</option>
                <option>Other</option>
              </select>
            </Field>
            <Field label="Appoint or remove" required>
              <select value={details.officerAction ?? "appoint"} onChange={(e) => set("officerAction", e.target.value as "appoint" | "remove")} style={inputStyle}>
                <option value="appoint">Appoint</option>
                <option value="remove">Remove</option>
              </select>
            </Field>
          </div>
        </>
      )}

      {t === "banking" && (
        <>
          <Field label="Bank name + branch" required>
            <input value={details.bankName ?? ""} onChange={(e) => set("bankName", e.target.value)} placeholder="RBC — Main Branch, Calgary" style={inputStyle} />
          </Field>
          <Field label="Purpose" required>
            <select value={details.bankPurpose ?? "open-account"} onChange={(e) => set("bankPurpose", e.target.value as "open-account" | "close-account" | "change-signers")} style={inputStyle}>
              <option value="open-account">Open a new account</option>
              <option value="close-account">Close an account</option>
              <option value="change-signers">Change signing officers</option>
            </select>
          </Field>
          <Field label="Signing officers (names)" required>
            <input value={details.bankSigningOfficers ?? ""} onChange={(e) => set("bankSigningOfficers", e.target.value)} placeholder="Jane Doe, John Smith" style={inputStyle} />
          </Field>
          <Field label="Signature rule" required>
            <select value={details.bankSignatureRule ?? "any one"} onChange={(e) => set("bankSignatureRule", e.target.value)} style={inputStyle}>
              <option value="any one">Any one signature</option>
              <option value="any two">Any two signatures</option>
              <option value="all">All signatures required</option>
            </select>
          </Field>
        </>
      )}

      {t === "dividend" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <Field label="Share class" required>
              <input value={details.dividendShareClass ?? ""} onChange={(e) => set("dividendShareClass", e.target.value)} placeholder="Common" style={inputStyle} />
            </Field>
            <Field label="Amount per share ($)" required>
              <input type="number" step="0.01" value={details.dividendPerShare ?? ""} onChange={(e) => set("dividendPerShare", e.target.value ? parseFloat(e.target.value) : undefined)} style={inputStyle} />
            </Field>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <Field label="Record date" required>
              <input type="date" value={details.dividendRecordDate ?? ""} onChange={(e) => set("dividendRecordDate", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Payment date" required>
              <input type="date" value={details.dividendPaymentDate ?? ""} onChange={(e) => set("dividendPaymentDate", e.target.value)} style={inputStyle} />
            </Field>
          </div>
        </>
      )}

      {t === "other" && (
        <Field label="Describe the resolution" required>
          <textarea value={details.otherDescription ?? ""} onChange={(e) => set("otherDescription", e.target.value)} placeholder="What is the board deciding?" rows={3} style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} />
        </Field>
      )}

      <Field label="Notes" hint="Anything else we should know">
        <textarea value={details.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical", minHeight: 44 }} />
      </Field>
    </div>
  );
}

function ShareholderResolutionForm({ details, setDetails }: {
  details: ShareholderResolutionDetails;
  setDetails: (d: ShareholderResolutionDetails) => void;
}) {
  const set = <K extends keyof ShareholderResolutionDetails>(k: K, v: ShareholderResolutionDetails[K]) => setDetails({ ...details, [k]: v });
  const t = details.resolutionType;
  const isSpecialByType = t === "article-amendment" || t === "fundamental-change";
  useEffect(() => { setDetails({ ...details, isSpecial: isSpecialByType }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [t]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <Field label="Resolution type" required>
        <select value={t} onChange={(e) => set("resolutionType", e.target.value as ShareholderResolutionType)} style={inputStyle}>
          <option value="annual-package">Annual package (waive auditor, elect directors, approve financials)</option>
          <option value="article-amendment">Article amendment (special)</option>
          <option value="bylaw-confirmation">By-law confirmation</option>
          <option value="fundamental-change">Fundamental change (amalgamation, continuation, dissolution)</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Effective date" required>
        <input type="date" value={details.effectiveDate} onChange={(e) => set("effectiveDate", e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Shareholders' names (all who will sign)" required hint="Comma-separated. Unanimous written resolution requires every shareholder's signature.">
        <textarea value={details.shareholdersNames} onChange={(e) => set("shareholdersNames", e.target.value)} placeholder="e.g. Jane Doe, John Smith" rows={2} style={{ ...inputStyle, resize: "vertical", minHeight: 44 }} />
      </Field>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontStyle: "italic" }}>
        {isSpecialByType ? "Special resolution — requires two-thirds (66.67%) shareholder approval." : "Ordinary resolution — requires simple majority (>50%) shareholder approval."}
      </div>

      {t === "annual-package" && (
        <>
          <Field label="Fiscal year end" required>
            <input type="date" value={details.fiscalYearEnd ?? ""} onChange={(e) => set("fiscalYearEnd", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Directors being elected" required hint="Comma-separated. Usually same as current directors.">
            <input value={details.directorsBeingElected ?? ""} onChange={(e) => set("directorsBeingElected", e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Waive auditor?">
            <YesNo value={details.waiveAuditor} onChange={(v) => set("waiveAuditor", v)} defaultTrue />
          </Field>
          <Field label="Approve financial statements?">
            <YesNo value={details.approveFinancials} onChange={(v) => set("approveFinancials", v)} defaultTrue />
          </Field>
        </>
      )}

      {t === "article-amendment" && (
        <>
          <Field label="Nature of amendment" required>
            <select value={details.amendmentNature ?? ""} onChange={(e) => set("amendmentNature", e.target.value as ShareholderResolutionDetails["amendmentNature"])} style={inputStyle}>
              <option value="">Select…</option>
              <option value="name-change">Corporate name change</option>
              <option value="share-structure">Share structure change</option>
              <option value="transfer-restrictions">Transfer restrictions</option>
              <option value="directors-number">Number of directors</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Detail of change" required>
            <textarea value={details.amendmentDetail ?? ""} onChange={(e) => set("amendmentDetail", e.target.value)} placeholder="e.g. Change corporate name from Acme Holdings Inc. to Acme Group Inc." rows={3} style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} />
          </Field>
        </>
      )}

      {t === "bylaw-confirmation" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <Field label="By-law number" required>
              <input value={details.bylawNumber ?? ""} onChange={(e) => set("bylawNumber", e.target.value)} placeholder="By-Law No. 1" style={inputStyle} />
            </Field>
            <Field label="Date enacted by directors" required>
              <input type="date" value={details.bylawEnactedDate ?? ""} onChange={(e) => set("bylawEnactedDate", e.target.value)} style={inputStyle} />
            </Field>
          </div>
        </>
      )}

      {t === "fundamental-change" && (
        <>
          <Field label="Type of fundamental change" required>
            <select value={details.fundamentalChangeType ?? ""} onChange={(e) => set("fundamentalChangeType", e.target.value as ShareholderResolutionDetails["fundamentalChangeType"])} style={inputStyle}>
              <option value="">Select…</option>
              <option value="amalgamation">Amalgamation</option>
              <option value="continuation">Continuation to another jurisdiction</option>
              <option value="dissolution">Voluntary dissolution</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Detail" required>
            <textarea value={details.fundamentalChangeDetail ?? ""} onChange={(e) => set("fundamentalChangeDetail", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} />
          </Field>
        </>
      )}

      {t === "other" && (
        <Field label="Describe the resolution" required>
          <textarea value={details.otherDescription ?? ""} onChange={(e) => set("otherDescription", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} />
        </Field>
      )}

      <Field label="Notes" hint="Anything else we should know">
        <textarea value={details.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical", minHeight: 44 }} />
      </Field>
    </div>
  );
}

function BylawsForm({ details, setDetails }: {
  details: BylawsDetails;
  setDetails: (d: BylawsDetails) => void;
}) {
  const set = <K extends keyof BylawsDetails>(k: K, v: BylawsDetails[K]) => setDetails({ ...details, [k]: v });
  const f = details.flavour;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
      <Field label="Type" required>
        <select value={f} onChange={(e) => set("flavour", e.target.value as BylawsFlavour)} style={inputStyle}>
          <option value="new-standard">New — Standard By-Law No. 1</option>
          <option value="new-custom">New — Custom (we'll email to gather your custom provisions)</option>
          <option value="amendment">Amendment to an existing by-law</option>
        </select>
      </Field>

      {f === "new-custom" && (
        <div style={{ padding: "0.6rem 0.8rem", background: "rgba(212,175,55,0.10)", border: "1px solid rgba(212,175,55,0.35)", borderRadius: "0.4rem", fontSize: "0.78rem", color: "var(--text)" }}>
          <strong>Custom by-laws:</strong> after payment, we&apos;ll email you to gather your custom provisions (shareholder agreement terms, non-standard voting rules, class-of-shares specifics, etc.). Turnaround is 3-5 business days depending on complexity.
        </div>
      )}

      {(f === "new-standard" || f === "new-custom") && (
        <>
          <Field label="Officer positions to include" required hint="Comma-separated. Typical: President, Secretary, Treasurer">
            <input value={details.officerPositions ?? ""} onChange={(e) => set("officerPositions", e.target.value)} placeholder="President, Secretary, Treasurer" style={inputStyle} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
            <Field label="Fiscal year end" required>
              <input type="date" value={details.fiscalYearEnd ?? ""} onChange={(e) => set("fiscalYearEnd", e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Min directors" required>
              <input type="number" min={1} value={details.minDirectors ?? ""} onChange={(e) => set("minDirectors", parseInt(e.target.value, 10) || undefined)} style={inputStyle} />
            </Field>
            <Field label="Max directors" required>
              <input type="number" min={1} value={details.maxDirectors ?? ""} onChange={(e) => set("maxDirectors", parseInt(e.target.value, 10) || undefined)} style={inputStyle} />
            </Field>
          </div>
          <Field label="Signing authority for cheques + contracts" required hint="Names + roles">
            <input value={details.signingAuthority ?? ""} onChange={(e) => set("signingAuthority", e.target.value)} placeholder="Any two of: President, Treasurer" style={inputStyle} />
          </Field>
          <Field label="Uses a corporate seal?" hint="Most modern corporations don't">
            <YesNo value={details.usesCorporateSeal} onChange={(v) => set("usesCorporateSeal", v)} />
          </Field>
          <Field label="Transfer restrictions" hint="Default = standard private-corp restriction legend">
            <select value={details.transferRestrictions ?? "standard"} onChange={(e) => set("transferRestrictions", e.target.value as "standard" | "custom")} style={inputStyle}>
              <option value="standard">Standard (private-corp default)</option>
              <option value="custom">Custom (we'll email to gather details)</option>
            </select>
          </Field>
          {f === "new-custom" && (
            <Field label="Custom provisions to include" hint="Anything specific — we'll follow up by email">
              <textarea value={details.customProvisionsNote ?? ""} onChange={(e) => set("customProvisionsNote", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical", minHeight: 60 }} />
            </Field>
          )}
        </>
      )}

      {f === "amendment" && (
        <>
          <Field label="Which by-law is being amended" required>
            <input value={details.bylawNumber ?? ""} onChange={(e) => set("bylawNumber", e.target.value)} placeholder="By-Law No. 1" style={inputStyle} />
          </Field>
          <Field label="Detail of amendment" required>
            <textarea value={details.amendmentDetail ?? ""} onChange={(e) => set("amendmentDetail", e.target.value)} placeholder="What change to make. If you have the current by-law text, paste it or reference the section." rows={4} style={{ ...inputStyle, resize: "vertical", minHeight: 80 }} />
          </Field>
          <Field label="Effective date" required>
            <input type="date" value={details.effectiveDate ?? ""} onChange={(e) => set("effectiveDate", e.target.value)} style={inputStyle} />
          </Field>
        </>
      )}

      <Field label="Notes" hint="Anything else we should know">
        <textarea value={details.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical", minHeight: 44 }} />
      </Field>
    </div>
  );
}

/* ────────────────────── Help footer ────────────────────── */

function HelpFooter({ serviceLabel }: { serviceLabel: string }) {
  const openChat = () => {
    // Crisp chat is embedded site-wide via layout.tsx; the widget exposes
    // window.$crisp for programmatic control. Fall through silently if the
    // widget hasn't loaded (blocked by an ad-blocker, offline, etc.) — the
    // mailto link right next to this button covers that case.
    const w = window as unknown as { $crisp?: unknown[] };
    if (Array.isArray(w.$crisp)) {
      w.$crisp.push(["do", "chat:open"]);
    } else {
      // No chat widget available — open the mailto instead.
      window.location.href = `mailto:support@corporateregistryservices.ca?subject=Question about ordering ${encodeURIComponent(serviceLabel)}`;
    }
  };
  return (
    <div
      style={{
        marginTop:    "1.25rem",
        padding:      "0.9rem 1.15rem",
        background:   "var(--bg-deep)",
        border:       "1px dashed var(--border)",
        borderRadius: "0.5rem",
        display:      "flex",
        alignItems:   "center",
        gap:          "0.6rem",
        flexWrap:     "wrap",
      }}
    >
      <HelpCircle size={16} style={{ color: "var(--gold)", flexShrink: 0 }} />
      <div style={{ fontSize: "0.85rem", color: "var(--text)", flex: "1 1 200px" }}>
        <strong>Not sure about a field?</strong> Ask us before you pay — we&apos;ll help you decide what you actually need.
      </div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={openChat}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.3rem",
            padding: "0.4rem 0.7rem",
            background: "var(--secondary)",
            color: "#fff",
            border: "none",
            borderRadius: "0.35rem",
            fontSize: "0.78rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <MessageCircle size={13} /> Open chat
        </button>
        <a
          href={`mailto:support@corporateregistryservices.ca?subject=Question about ordering ${encodeURIComponent(serviceLabel)}`}
          style={{
            display: "inline-flex", alignItems: "center", gap: "0.3rem",
            padding: "0.4rem 0.7rem",
            background: "var(--card)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: "0.35rem",
            fontSize: "0.78rem",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          <Mail size={13} /> Email us
        </a>
      </div>
    </div>
  );
}

/* ────────────────────── Small helpers ────────────────────── */

function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label style={fieldLabelStyle}>
        {label}{required ? "" : hint ? "" : ""}
        {required && <span style={{ color: "#B45309", marginLeft: "0.2rem" }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.15rem", fontStyle: "italic" }}>{hint}</div>}
    </div>
  );
}

function YesNo({ value, onChange, defaultTrue }: {
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  defaultTrue?: boolean;
}) {
  const v = value ?? defaultTrue ?? false;
  return (
    <div style={{ display: "flex", gap: "0.35rem" }}>
      <button type="button" onClick={() => onChange(true)} style={pillBtn(v === true)}>Yes</button>
      <button type="button" onClick={() => onChange(false)} style={pillBtn(v === false && value !== undefined)}>No</button>
    </div>
  );
}

function pillBtn(active: boolean): React.CSSProperties {
  return {
    padding: "0.35rem 0.85rem",
    fontSize: "0.82rem",
    background: active ? "var(--gold)" : "var(--card)",
    color: active ? "var(--primary)" : "var(--text)",
    border: `1px solid ${active ? "var(--gold)" : "var(--border)"}`,
    borderRadius: "0.35rem",
    fontWeight: active ? 700 : 500,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

/* ────────────────────── Defaults + validation ────────────────────── */

function defaultDetailsFor(key: CorpDocServiceKey): Details {
  switch (key) {
    case "share-certificate":
      return {
        shareholderName: "", shareholderAddress: "", shareClass: "",
        numShares: 0, issueDate: "", numCertificates: 1,
        signingOfficerName: "", signingOfficerRole: "",
        transferRestrictions: "standard",
      } as ShareCertificateDetails;
    case "director-resolution":
      return {
        resolutionType: "annual-package",
        effectiveDate: "",
        directorsNames: "",
      } as DirectorResolutionDetails;
    case "shareholder-resolution":
      return {
        resolutionType: "annual-package",
        isSpecial: false,
        effectiveDate: "",
        shareholdersNames: "",
        waiveAuditor: true,
        approveFinancials: true,
      } as ShareholderResolutionDetails;
    case "bylaws":
      return {
        flavour: "new-standard",
        transferRestrictions: "standard",
      } as BylawsDetails;
  }
}

function detailsAreValid(key: CorpDocServiceKey, d: Details): boolean {
  if (key === "share-certificate") {
    const x = d as ShareCertificateDetails;
    return !!x.shareholderName.trim() && !!x.shareholderAddress.trim() && !!x.shareClass
      && x.numShares > 0 && !!x.issueDate && x.numCertificates > 0
      && !!x.signingOfficerName.trim() && !!x.signingOfficerRole;
  }
  if (key === "director-resolution") {
    const x = d as DirectorResolutionDetails;
    return !!x.effectiveDate && !!x.directorsNames.trim();
  }
  if (key === "shareholder-resolution") {
    const x = d as ShareholderResolutionDetails;
    return !!x.effectiveDate && !!x.shareholdersNames.trim();
  }
  if (key === "bylaws") {
    const x = d as BylawsDetails;
    if (x.flavour === "amendment") {
      return !!x.bylawNumber?.trim() && !!x.amendmentDetail?.trim() && !!x.effectiveDate;
    }
    return !!x.officerPositions?.trim() && !!x.fiscalYearEnd
      && (x.minDirectors ?? 0) > 0 && (x.maxDirectors ?? 0) > 0
      && !!x.signingAuthority?.trim();
  }
  return false;
}

/* ────────────────────── Styles ────────────────────── */

const cardStyle: React.CSSProperties = {
  padding:      "1.25rem 1.5rem",
  background:   "var(--card)",
  border:       "1px solid var(--border)",
  borderRadius: "var(--radius-card, 0.75rem)",
  boxShadow:    "var(--shadow-card, 0 4px 12px rgba(0,61,91,0.05))",
};

const sectionHeading: React.CSSProperties = {
  fontFamily: "var(--font-mono), monospace",
  fontSize: "0.68rem",
  textTransform: "uppercase",
  letterSpacing: "0.09em",
  color: "var(--text-muted)",
  fontWeight: 700,
  marginBottom: "0.85rem",
};

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  fontWeight: 700,
  color: "var(--text-muted)",
  marginBottom: "0.25rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.75rem",
  border: "1px solid var(--border)",
  borderRadius: "0.4rem",
  fontSize: "0.88rem",
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "inherit",
};

const buttonStyle: React.CSSProperties = {
  padding: "0.65rem 1.1rem",
  background: "var(--primary)",
  color: "#fff",
  fontWeight: 600,
  fontSize: "0.9rem",
  border: "none",
  borderRadius: "0.5rem",
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: "0.4rem",
};

const errTextStyle: React.CSSProperties = {
  color: "#B45309", fontSize: "0.82rem", marginTop: "0.5rem",
};
