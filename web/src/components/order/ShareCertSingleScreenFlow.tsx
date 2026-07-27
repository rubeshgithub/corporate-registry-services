"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, CheckCircle2, ArrowRight, Loader2, AlertCircle, Edit2, Mail, MessageCircle } from "lucide-react";
import type { CorpDocServiceConfig, ShareCertificateDetails } from "@/lib/corp-doc-config";

/**
 * Single-screen share certificate order flow.
 *
 * Replaces the two-screen wizard (search → confirm → details) for the
 * /order/share-certificate route with a form-first UX: the entire order
 * form is visible on load. As the user types in the corp identifier field,
 * we debounce-lookup against /api/company-search and populate a
 * "Verified corporation" summary once a match is picked. Everything
 * shareholder-specific (name, class, number of shares, issue date, signing
 * officer) stays manual — that data isn't in any registry.
 *
 * The other three services on CorpDocOrderFlow (director-resolution,
 * shareholder-resolution, bylaws) still use the two-screen wizard. If
 * this single-screen pattern converts well, we can extend.
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

const DEBOUNCE_MS = 400;
const MIN_QUERY   = 2;
const HANDOFF_KEY = "crs.shareCert.pickedCorp";

export default function ShareCertSingleScreenFlow({ config }: { config: CorpDocServiceConfig }) {
  const params         = useSearchParams();
  const attributionSrc = params.get("src") ?? "direct";

  /* Corp lookup state */
  const [q, setQ]                       = useState("");
  const [province, setProvince]         = useState<string>(params.get("jurisdiction") ?? "all");
  const [results, setResults]           = useState<RegistryHit[]>([]);
  const [searching, setSearching]       = useState(false);
  const [searchErr, setSearchErr]       = useState("");
  const [pick, setPick]                 = useState<RegistryHit | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  /* Share cert details */
  const [details, setDetails] = useState<ShareCertificateDetails>({
    shareholderName:      "",
    shareholderAddress:   "",
    shareClass:           "Common",
    numShares:            0,
    issueDate:            "",
    numCertificates:      1,
    signingOfficerName:   "",
    signingOfficerRole:   "Director",
    consideration:        undefined,
    transferRestrictions: "standard",
    customRestrictionText: "",
    notes:                "",
  });

  /* Contact */
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });

  /* Payment */
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState("");

  /* Consume the sessionStorage handoff from the article-page lookup widget.
   *  If ShareCertLookupIsland stashed a picked corp before redirecting here,
   *  read it and auto-verify so the visitor doesn't have to search twice. */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(HANDOFF_KEY);
      if (!raw) return;
      sessionStorage.removeItem(HANDOFF_KEY);
      const hit = JSON.parse(raw) as RegistryHit;
      if (hit && typeof hit.name === "string") setPick(hit);
    } catch {
      /* Malformed handoff — visitor searches manually. */
    }
  }, []);

  /* Debounced auto-lookup — fires whenever q changes and no corp is picked. */
  const searchToken = useRef(0);
  useEffect(() => {
    if (pick) return;
    const query = q.trim();
    if (query.length < MIN_QUERY) {
      setResults([]);
      setSearchErr("");
      setDropdownOpen(false);
      return;
    }
    const myToken = ++searchToken.current;
    const t = setTimeout(async () => {
      setSearching(true);
      setSearchErr("");
      try {
        const res  = await fetch(`/api/company-search?q=${encodeURIComponent(query)}&province=${province}`);
        const data = await res.json();
        if (myToken !== searchToken.current) return;
        const hits: RegistryHit[] = data.results ?? [];
        setResults(hits);
        setDropdownOpen(true);
        if (!hits.length) setSearchErr("No matching records — try the exact legal name, corp number, or a different jurisdiction.");
      } catch {
        if (myToken !== searchToken.current) return;
        setSearchErr("Search is temporarily unavailable — please try again.");
        setResults([]);
      } finally {
        if (myToken === searchToken.current) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, province, pick]);

  const selectHit = (hit: RegistryHit) => {
    setPick(hit);
    setDropdownOpen(false);
    setResults([]);
  };

  const clearPick = () => {
    setPick(null);
    setQ("");
    setResults([]);
    setDropdownOpen(false);
  };

  const canPay =
    !!pick &&
    !!details.shareholderName.trim() &&
    !!details.shareholderAddress.trim() &&
    !!details.shareClass.trim() &&
    details.numShares > 0 &&
    !!details.issueDate.trim() &&
    details.numCertificates > 0 &&
    !!details.signingOfficerName.trim() &&
    !!details.signingOfficerRole.trim() &&
    (details.transferRestrictions !== "custom" || !!details.customRestrictionText?.trim()) &&
    !!contact.name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) &&
    !!contact.phone.trim();

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

      {/* ═══════════ SECTION 1: Corporation lookup with autofill ═══════════ */}
      <section style={cardStyle}>
        <div style={sectionHeading}>Your corporation</div>

        {!pick ? (
          <>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.35rem", position: "relative" }}>
              <select
                value={province}
                onChange={(e) => { setProvince(e.target.value); }}
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
              <div style={{ flex: "3 1 240px", position: "relative" }}>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onFocus={() => { if (results.length) setDropdownOpen(true); }}
                  placeholder="Company name, corporation number, or Business Number"
                  style={inputStyle}
                  autoFocus
                />
                {searching && (
                  <Loader2 size={14} className="crs-spin" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                )}

                {/* Autocomplete dropdown */}
                {dropdownOpen && results.length > 0 && (
                  <div style={dropdownStyle}>
                    {results.slice(0, 5).map((hit, i) => (
                      <button
                        key={`${hit.provinceKey}-${hit.registryId}-${i}`}
                        type="button"
                        onClick={() => selectHit(hit)}
                        style={dropdownItemStyle}
                      >
                        <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.92rem" }}>{hit.name}</div>
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                          {hit.jurisdiction}
                          {hit.registryId ? ` · #${hit.registryId}` : ""}
                          {hit.location ? ` · ${hit.location}` : ""}
                          {hit.status ? ` · ${hit.status.toLowerCase()}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: "0.4rem 0 0", lineHeight: 1.5 }}>
              Start typing your corporation name or number. We&apos;ll look it up in the live registry so we can pre-fill the corporation details on your certificate.
            </p>
            {searchErr && <p style={errTextStyle}>{searchErr}</p>}
          </>
        ) : (
          <div style={verifiedCardStyle}>
            <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", flex: 1, minWidth: 0 }}>
                <CheckCircle2 size={20} style={{ color: "#16A34A", flexShrink: 0, marginTop: "0.15rem" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "#166534", fontWeight: 700, marginBottom: "0.25rem" }}>
                    Verified corporation
                  </div>
                  <div style={{ fontWeight: 700, fontSize: "1.02rem", color: "var(--text)", lineHeight: 1.35, marginBottom: "0.35rem" }}>
                    {pick.name}
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "var(--text)", lineHeight: 1.55 }}>
                    <div><strong style={{ color: "var(--text-muted)", fontWeight: 500 }}>Jurisdiction:</strong> {pick.jurisdiction}</div>
                    {pick.registryId && <div><strong style={{ color: "var(--text-muted)", fontWeight: 500 }}>Corporation #:</strong> {pick.registryId}</div>}
                    {pick.businessNumber && <div><strong style={{ color: "var(--text-muted)", fontWeight: 500 }}>Business #:</strong> {pick.businessNumber}</div>}
                    {pick.location && <div><strong style={{ color: "var(--text-muted)", fontWeight: 500 }}>Registered office:</strong> {pick.location}</div>}
                    <div><strong style={{ color: "var(--text-muted)", fontWeight: 500 }}>Status:</strong> {pick.status}{pick.statusNotes && pick.statusNotes !== pick.status ? ` (${pick.statusNotes})` : ""}</div>
                  </div>
                  <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", margin: "0.5rem 0 0", fontStyle: "italic" }}>
                    These fields will be printed on the certificate exactly as shown — pulled from the live registry.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearPick}
                title="Change corporation"
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: "0.35rem",
                  padding: "0.35rem 0.55rem",
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  flexShrink: 0,
                }}
              >
                <Edit2 size={12} /> Change
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ═══════════ SECTION 2: Shareholder + share details ═══════════ */}
      <section style={{ ...cardStyle, opacity: pick ? 1 : 0.5, pointerEvents: pick ? "auto" : "none" }}>
        <div style={sectionHeading}>Shareholder + share details</div>
        {!pick && (
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0 0 0.75rem", fontStyle: "italic" }}>
            Find your corporation above first — then fill in the shareholder and share details for this certificate.
          </p>
        )}

        <FieldRow>
          <Field label="Shareholder legal name" required>
            <input
              value={details.shareholderName}
              onChange={(e) => setDetails({ ...details, shareholderName: e.target.value })}
              placeholder="e.g. Jane Elizabeth Smith"
              style={inputStyle}
            />
          </Field>
          <Field label="Shareholder mailing address" required>
            <input
              value={details.shareholderAddress}
              onChange={(e) => setDetails({ ...details, shareholderAddress: e.target.value })}
              placeholder="Street, City, Province, Postal"
              style={inputStyle}
            />
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label="Share class" required hint="Common, Class A, Preferred, etc. — from your articles of incorporation.">
            <input
              value={details.shareClass}
              onChange={(e) => setDetails({ ...details, shareClass: e.target.value })}
              placeholder="Common"
              style={inputStyle}
              list="share-class-suggestions"
            />
            <datalist id="share-class-suggestions">
              <option value="Common" />
              <option value="Class A" />
              <option value="Class B" />
              <option value="Class C" />
              <option value="Preferred" />
              <option value="Voting" />
              <option value="Non-voting" />
            </datalist>
          </Field>
          <Field label="Number of shares" required>
            <input
              type="number"
              min={1}
              value={details.numShares || ""}
              onChange={(e) => setDetails({ ...details, numShares: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              placeholder="e.g. 100"
              style={inputStyle}
            />
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label="Number of certificates" required hint="One certificate per allotment is standard; increase if you need split issuances.">
            <input
              type="number"
              min={1}
              value={details.numCertificates || ""}
              onChange={(e) => setDetails({ ...details, numCertificates: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              style={inputStyle}
            />
          </Field>
          <Field label="Issue date" required>
            <input
              type="date"
              value={details.issueDate}
              onChange={(e) => setDetails({ ...details, issueDate: e.target.value })}
              style={inputStyle}
            />
          </Field>
        </FieldRow>

        <FieldRow>
          <Field label="Signing officer name" required hint="The director or officer whose signature goes on the certificate.">
            <input
              value={details.signingOfficerName}
              onChange={(e) => setDetails({ ...details, signingOfficerName: e.target.value })}
              placeholder="e.g. John A. Director"
              style={inputStyle}
            />
          </Field>
          <Field label="Signing officer role" required>
            <select
              value={details.signingOfficerRole}
              onChange={(e) => setDetails({ ...details, signingOfficerRole: e.target.value })}
              style={inputStyle}
            >
              <option value="Director">Director</option>
              <option value="President">President</option>
              <option value="Secretary">Secretary</option>
              <option value="Treasurer">Treasurer</option>
              <option value="Officer">Officer</option>
            </select>
          </Field>
        </FieldRow>

        {/* Optional: consideration + transfer restrictions */}
        <details style={{ marginTop: "0.75rem" }}>
          <summary style={{ cursor: "pointer", fontSize: "0.85rem", color: "var(--text-muted)", padding: "0.5rem 0" }}>
            Optional details (consideration paid, transfer restrictions, notes)
          </summary>
          <div style={{ marginTop: "0.5rem" }}>
            <FieldRow>
              <Field label="Consideration paid ($ CAD)" hint="How much the shareholder paid. Fulfillment will confirm if left blank.">
                <input
                  type="number"
                  min={0}
                  value={details.consideration ?? ""}
                  onChange={(e) => setDetails({ ...details, consideration: e.target.value ? Math.max(0, parseFloat(e.target.value)) : undefined })}
                  placeholder="e.g. 100"
                  style={inputStyle}
                />
              </Field>
              <Field label="Transfer restrictions">
                <select
                  value={details.transferRestrictions || "standard"}
                  onChange={(e) => setDetails({ ...details, transferRestrictions: e.target.value as ShareCertificateDetails["transferRestrictions"] })}
                  style={inputStyle}
                >
                  <option value="standard">Standard (from articles)</option>
                  <option value="custom">Custom legend</option>
                </select>
              </Field>
            </FieldRow>
            {details.transferRestrictions === "custom" && (
              <Field label="Custom transfer restriction text" required>
                <textarea
                  value={details.customRestrictionText || ""}
                  onChange={(e) => setDetails({ ...details, customRestrictionText: e.target.value })}
                  placeholder="Paste the exact legend text as it should appear on the certificate…"
                  style={{ ...inputStyle, minHeight: "4rem", resize: "vertical" }}
                />
              </Field>
            )}
            <Field label="Notes for the specialist (optional)">
              <textarea
                value={details.notes || ""}
                onChange={(e) => setDetails({ ...details, notes: e.target.value })}
                placeholder="Anything the specialist should know — timing, delivery preferences, etc."
                style={{ ...inputStyle, minHeight: "4rem", resize: "vertical" }}
              />
            </Field>
          </div>
        </details>
      </section>

      {/* ═══════════ SECTION 3: Contact + pay ═══════════ */}
      <section style={{ ...cardStyle, opacity: pick ? 1 : 0.5, pointerEvents: pick ? "auto" : "none" }}>
        <div style={sectionHeading}>Your contact + payment</div>

        <FieldRow>
          <Field label="Your full name" required>
            <input
              value={contact.name}
              onChange={(e) => setContact({ ...contact, name: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <Field label="Email" required>
            <input
              type="email"
              value={contact.email}
              onChange={(e) => setContact({ ...contact, email: e.target.value })}
              style={inputStyle}
            />
          </Field>
        </FieldRow>

        <Field label="Phone" required>
          <input
            type="tel"
            value={contact.phone}
            onChange={(e) => setContact({ ...contact, phone: e.target.value })}
            style={{ ...inputStyle, maxWidth: 260 }}
          />
        </Field>

        <button
          onClick={submit}
          disabled={!canPay || paying}
          style={{
            marginTop: "1.25rem",
            padding: "0.85rem 1.5rem",
            background: canPay && !paying ? "var(--primary)" : "var(--border)",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "0.45rem",
            fontSize: "0.98rem",
            fontWeight: 700,
            cursor: canPay && !paying ? "pointer" : "not-allowed",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          {paying ? <><Loader2 size={16} className="crs-spin" /> Redirecting to Stripe…</> : <>{config.buttonLabel} <ArrowRight size={16} /></>}
        </button>

        {payErr && (
          <div style={{ marginTop: "0.9rem", padding: "0.6rem 0.8rem", background: "rgba(220,38,38,0.08)", color: "#B91C1C", fontSize: "0.85rem", borderRadius: "0.4rem", display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
            <AlertCircle size={14} style={{ marginTop: "0.1rem", flexShrink: 0 }} />
            <span>{payErr}</span>
          </div>
        )}

        <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.75rem", lineHeight: 1.55 }}>
          {config.deliveryPromise} Assumes you have the corporation&apos;s latest profile report and articles of incorporation on hand — if we need to fetch them from the registry, additional fees are quoted before we start.
        </p>
      </section>

      <HelpFooter serviceLabel={config.label} />
    </div>
  );
}

/* ═══════════════════════════ UI helpers ═══════════════════════════ */

function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
      {children}
    </div>
  );
}

function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: "0.5rem" }}>
      <span style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.3rem" }}>
        {label}{required && <span style={{ color: "#B91C1C" }}> *</span>}
      </span>
      {children}
      {hint && <span style={{ display: "block", fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.25rem", lineHeight: 1.45 }}>{hint}</span>}
    </label>
  );
}

function HelpFooter({ serviceLabel }: { serviceLabel: string }) {
  return (
    <div style={{ marginTop: "1.5rem", padding: "0.85rem 1rem", background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: "0.4rem", display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", fontSize: "0.82rem", color: "var(--text-muted)" }}>
      <MessageCircle size={14} />
      <span>Not sure? Ask us — the fulfillment team can walk you through the {serviceLabel} order.</span>
      <a href="mailto:support@corporateregistryservices.ca" style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", color: "var(--secondary)", textDecoration: "none", fontWeight: 700 }}>
        <Mail size={13} /> Email us
      </a>
    </div>
  );
}

/* ═══════════════════════════ Styles ═══════════════════════════ */

const cardStyle: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.55rem",
  padding: "1.25rem 1.4rem",
  marginBottom: "1rem",
};

const sectionHeading: React.CSSProperties = {
  fontFamily: "var(--font-mono), monospace",
  fontSize: "0.7rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  fontWeight: 700,
  marginBottom: "0.9rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.85rem",
  border: "1px solid var(--border)",
  borderRadius: "0.4rem",
  fontSize: "0.9rem",
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "inherit",
};

const errTextStyle: React.CSSProperties = {
  fontSize: "0.82rem",
  color: "#B91C1C",
  marginTop: "0.5rem",
  marginBottom: 0,
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: 0,
  right: 0,
  marginTop: "0.25rem",
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "0.4rem",
  boxShadow: "0 8px 24px rgba(0, 61, 91, 0.15)",
  maxHeight: "300px",
  overflowY: "auto",
  zIndex: 20,
};

const dropdownItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "0.7rem 0.9rem",
  border: "none",
  borderBottom: "1px solid var(--border)",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  color: "var(--text)",
};

const verifiedCardStyle: React.CSSProperties = {
  padding: "1rem 1.15rem",
  background: "rgba(22,163,74,0.08)",
  border: "1px solid rgba(22,163,74,0.35)",
  borderRadius: "0.45rem",
};
