"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2, CheckCircle2, AlertCircle, Info } from "lucide-react";

/**
 * Multi-step booking form for /incorporation/book-free-consultation.
 *
 * Steps:
 *   1. Contact info (with "just want to talk first" escape hatch)
 *   2. Corporation (jurisdiction + named/numbered + names + office + nature + activity)
 *   3. Directors (dynamic min = 1; residency + age flags)
 *   4. Share structure (structure type + shareholder count + special rights)
 *   5. Review + PIPEDA consent + submit
 *
 * On success: plain "we'll reach out within one business day" — no calendar.
 */

/* ────────────────────────── Types ────────────────────────── */

type Jurisdiction = {
  key:              string;
  label:            string;
  residencyNote:    string;
};

const JURISDICTIONS: Jurisdiction[] = [
  { key: "unknown",  label: "Not sure — advise me",           residencyNote: "The specialist will recommend a jurisdiction based on where you operate, who your founders are, and your expansion plans." },
  { key: "federal",  label: "Federal (CBCA)",                 residencyNote: "25% of directors must be Canadian residents (at least 1 if you have 1–3 directors)." },
  { key: "on",       label: "Ontario (OBCA)",                 residencyNote: "No Canadian residency requirement for directors (removed 2023)." },
  { key: "bc",       label: "British Columbia (BCA)",         residencyNote: "No Canadian residency requirement for directors." },
  { key: "ab",       label: "Alberta (ABCA)",                 residencyNote: "No Canadian residency requirement for directors." },
  { key: "qc",       label: "Quebec (QBCA)",                  residencyNote: "No Canadian residency requirement for directors." },
  { key: "sk",       label: "Saskatchewan (SBCA)",            residencyNote: "25% of directors must be Canadian residents — specialist will confirm on the call." },
  { key: "mb",       label: "Manitoba (MCA)",                 residencyNote: "25% of directors must be Canadian residents — specialist will confirm on the call." },
  { key: "ns",       label: "Nova Scotia",                    residencyNote: "Director residency rules apply — specialist will confirm on the call." },
  { key: "nb",       label: "New Brunswick (NBBCA)",          residencyNote: "Director residency rules apply — specialist will confirm on the call." },
  { key: "nl",       label: "Newfoundland and Labrador",      residencyNote: "Director residency rules apply — specialist will confirm on the call." },
  { key: "pe",       label: "Prince Edward Island",           residencyNote: "Director residency rules apply — specialist will confirm on the call." },
  { key: "yt",       label: "Yukon",                          residencyNote: "Specialist will confirm any residency requirements on the call." },
  { key: "nt",       label: "Northwest Territories",          residencyNote: "Specialist will confirm any residency requirements on the call." },
  { key: "nu",       label: "Nunavut",                        residencyNote: "Specialist will confirm any residency requirements on the call." },
];

type ContactInfo = {
  fullName: string;
  email:    string;
  phone:    string;
  contactMethod: "Email" | "Phone" | "Video call";
  timeWindow:    "Morning" | "Afternoon" | "Evening";
  /** "Just want to talk" mode — skips Corporation/Directors/Share steps
   *  and goes straight from Contact to Review. */
  justExploring: boolean;
};

type Address = {
  street:   string;
  city:     string;
  province: string;
  postal:   string;
};

type Corporation = {
  jurisdictionKey: string;
  nameType:        "named" | "numbered";
  name1:           string;
  name2:           string;
  name3:           string;
  office:          Address;
  nature:          string;
  natureOther:     string;
  activity:        string;
};

type Director = {
  fullName:          string;
  email:             string;
  phone:             string;
  address:           Address;
  canadianResident:  boolean;
  ageOk:             boolean;
};

type ShareStructure = {
  structureType:  "" | "simple" | "multiple" | "unsure";
  shareholders:   "" | "1" | "2" | "3-5" | "6-10" | "10+";
  specialRights:  "" | "yes" | "no" | "unsure";
};

const NATURE_OPTIONS = [
  "Professional services / Consulting",
  "Technology / Software",
  "E-commerce / Retail",
  "Real estate / Property",
  "Trades / Construction",
  "Manufacturing",
  "Food & beverage / Hospitality",
  "Healthcare / Wellness",
  "Transportation / Logistics",
  "Media / Creative",
  "Financial services",
  "Other",
];

const emptyAddress = (): Address => ({ street: "", city: "", province: "", postal: "" });
const emptyDirector = (): Director => ({
  fullName: "", email: "", phone: "", address: emptyAddress(), canadianResident: false, ageOk: false,
});

const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const phoneOk = (s: string) => s.replace(/\D/g, "").length === 10;

/* ────────────────────────── Component ────────────────────────── */

const STEPS = ["Contact", "Corporation", "Directors", "Shares", "Review"] as const;

export default function IncorporationConsultationForm() {
  const [step, setStep] = useState(0);

  const [contact, setContact] = useState<ContactInfo>({
    fullName: "", email: "", phone: "", contactMethod: "Email", timeWindow: "Morning",
    justExploring: false,
  });

  const [corp, setCorp] = useState<Corporation>({
    jurisdictionKey: "",
    nameType: "named",
    name1: "", name2: "", name3: "",
    office: emptyAddress(),
    nature: "", natureOther: "",
    activity: "",
  });

  const [directors, setDirectors] = useState<Director[]>([emptyDirector()]);

  const [shares, setShares] = useState<ShareStructure>({
    structureType: "", shareholders: "", specialRights: "",
  });

  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr]   = useState("");
  const [success, setSuccess]       = useState(false);

  const jurisdiction = JURISDICTIONS.find((j) => j.key === corp.jurisdictionKey);

  /* Skip Corporation/Directors/Shares for visitors who tick "I just want
     to talk". Contact → Review directly. */
  const nextStep = (from: number): number => {
    if (contact.justExploring && from === 0) return 4;
    return Math.min(STEPS.length - 1, from + 1);
  };
  const prevStep = (from: number): number => {
    if (contact.justExploring && from === 4) return 0;
    return Math.max(0, from - 1);
  };

  /* ─── Validation per step ─── */
  const canContinue = useMemo(() => {
    switch (step) {
      case 0:
        return contact.fullName.trim().length >= 2
          && emailOk(contact.email)
          && phoneOk(contact.phone);
      case 1: {
        if (!corp.jurisdictionKey) return false;
        if (corp.nameType === "named") {
          if (!corp.name1.trim() || !corp.name2.trim() || !corp.name3.trim()) return false;
        }
        const a = corp.office;
        if (!a.street || !a.city || !a.province || !a.postal) return false;
        if (!corp.nature) return false;
        if (corp.nature === "Other" && !corp.natureOther.trim()) return false;
        if (corp.activity.trim().length < 30) return false;
        return true;
      }
      case 2: {
        const filled = directors.filter((d) => d.fullName.trim() && emailOk(d.email) && d.address.street);
        if (filled.length < 1) return false;
        if (!filled.every((d) => d.ageOk)) return false;
        if (!filled.every((d) => d.address.street && d.address.city && d.address.province && d.address.postal)) return false;
        return true;
      }
      case 3:
        return !!(shares.structureType && shares.shareholders && shares.specialRights);
      case 4:
        return consent;
      default:
        return false;
    }
  }, [step, contact, corp, directors, shares, consent]);

  /* ─── Submit ─── */
  const submit = async () => {
    setSubmitting(true);
    setSubmitErr("");
    try {
      const exploring = contact.justExploring;
      const res = await fetch("/api/incorporation/consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact,
          explorationMode: exploring,
          corporation: exploring ? null : {
            ...corp,
            jurisdictionLabel: jurisdiction?.label ?? corp.jurisdictionKey,
          },
          directors: exploring ? [] : directors.filter((d) => d.fullName.trim()),
          shareStructure: exploring ? null : shares,
          notes: notes.trim() || undefined,
          sourcePath: typeof window !== "undefined" ? window.location.pathname : "/incorporation/book-free-consultation",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSuccess(true);
    } catch (e) {
      setSubmitErr(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 1.5rem 3rem" }}>
        <div
          style={{
            padding: "1.75rem 1.75rem",
            background: "rgba(22,163,74,0.08)",
            border: "1px solid rgba(22,163,74,0.35)",
            borderRadius: "0.6rem",
            display: "flex", gap: "0.85rem", alignItems: "flex-start",
          }}
        >
          <CheckCircle2 size={28} style={{ color: "#16A34A", flexShrink: 0, marginTop: "0.15rem" }} />
          <div>
            <div style={{ fontWeight: 700, color: "#166534", fontSize: "1.15rem", marginBottom: "0.4rem" }}>
              Request received.
            </div>
            <p style={{ fontSize: "0.95rem", color: "var(--text)", margin: 0, lineHeight: 1.6 }}>
              Thanks for booking a free consultation. We'll reach out within one business day at{" "}
              <strong>{contact.email}</strong> to confirm a time and answer any questions in the meantime.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 1.5rem 2rem" }}>
      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {STEPS.map((label, i) => {
          const skipped = contact.justExploring && i > 0 && i < 4;
          return (
            <div
              key={label}
              style={{
                flex: "1 1 100px",
                padding: "0.5rem 0.6rem",
                borderRadius: "0.4rem",
                background: skipped ? "var(--bg-deep)" : i === step ? "var(--primary)" : i < step ? "rgba(22,163,74,0.15)" : "var(--card)",
                color:      skipped ? "var(--text-muted)" : i === step ? "#FFFFFF" : i < step ? "#166534" : "var(--text-muted)",
                border:     "1px solid var(--border)",
                fontSize:   "0.72rem",
                fontFamily: "var(--font-mono), monospace",
                textAlign:  "center",
                fontWeight: 600,
                opacity:    skipped ? 0.5 : 1,
                textDecoration: skipped ? "line-through" : "none",
              }}
            >
              {i + 1}. {label}
            </div>
          );
        })}
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.6rem", padding: "1.5rem 1.75rem" }}>
        {step === 0 && <StepContact contact={contact} setContact={setContact} />}
        {step === 1 && <StepCorporation corp={corp} setCorp={setCorp} jurisdiction={jurisdiction} />}
        {step === 2 && <StepDirectors directors={directors} setDirectors={setDirectors} jurisdiction={jurisdiction} />}
        {step === 3 && <StepShares shares={shares} setShares={setShares} />}
        {step === 4 && (
          <StepReview
            contact={contact} corp={corp} directors={directors} shares={shares}
            notes={notes} setNotes={setNotes}
            consent={consent} setConsent={setConsent}
            jurisdiction={jurisdiction}
          />
        )}

        {submitErr && (
          <div style={{ marginTop: "1rem", padding: "0.7rem 0.9rem", background: "rgba(220,38,38,0.08)", color: "#B91C1C", fontSize: "0.85rem", borderRadius: "0.4rem", display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
            <AlertCircle size={14} style={{ marginTop: "0.15rem", flexShrink: 0 }} />
            <span>{submitErr}</span>
          </div>
        )}

        <div style={{ marginTop: "1.75rem", display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
          <button
            onClick={() => setStep((s) => prevStep(s))}
            disabled={step === 0 || submitting}
            style={{
              padding: "0.7rem 1.1rem",
              background: "transparent",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: "0.4rem",
              fontSize: "0.9rem",
              cursor: step === 0 || submitting ? "not-allowed" : "pointer",
              opacity: step === 0 ? 0.4 : 1,
              display: "inline-flex", alignItems: "center", gap: "0.4rem",
            }}
          >
            <ArrowLeft size={14} /> Back
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => nextStep(s))}
              disabled={!canContinue}
              style={{
                padding: "0.7rem 1.4rem",
                background: canContinue ? "var(--primary)" : "var(--border)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "0.4rem",
                fontSize: "0.9rem",
                fontWeight: 700,
                cursor: canContinue ? "pointer" : "not-allowed",
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
              }}
            >
              Continue <ArrowRight size={14} />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!canContinue || submitting}
              style={{
                padding: "0.7rem 1.4rem",
                background: canContinue && !submitting ? "var(--primary)" : "var(--border)",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "0.4rem",
                fontSize: "0.9rem",
                fontWeight: 700,
                cursor: canContinue && !submitting ? "pointer" : "not-allowed",
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
              }}
            >
              {submitting ? (
                <><Loader2 size={14} className="crs-spin" /> Submitting…</>
              ) : (
                <>Book my free consultation <ArrowRight size={14} /></>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── Steps ────────────────────────── */

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: "1rem" }}>
      <span style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.3rem" }}>{label}</span>
      {children}
      {hint && <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>{hint}</span>}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.85rem",
  border: "1px solid var(--border)",
  borderRadius: "0.4rem",
  fontSize: "0.92rem",
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "inherit",
};

function StepContact({ contact, setContact }: { contact: ContactInfo; setContact: (c: ContactInfo) => void }) {
  const set = (p: Partial<ContactInfo>) => setContact({ ...contact, ...p });
  return (
    <>
      <StepHeading title="Your contact information" sub="Where should we send the consultation confirmation and the written filing checklist afterwards?" />
      <Field label="Full name">
        <input style={inputStyle} value={contact.fullName} onChange={(e) => set({ fullName: e.target.value })} placeholder="Jane Doe" />
      </Field>
      <Field label="Email">
        <input type="email" style={inputStyle} value={contact.email} onChange={(e) => set({ email: e.target.value })} placeholder="you@yourcompany.ca" />
      </Field>
      <Field label="Phone" hint="10 digits, Canadian.">
        <input type="tel" style={inputStyle} value={contact.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="(403) 555-0100" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <Field label="Preferred contact method">
          <select style={inputStyle} value={contact.contactMethod} onChange={(e) => set({ contactMethod: e.target.value as ContactInfo["contactMethod"] })}>
            <option value="Email">Email</option>
            <option value="Phone">Phone</option>
            <option value="Video call">Video call</option>
          </select>
        </Field>
        <Field label="Preferred time window">
          <select style={inputStyle} value={contact.timeWindow} onChange={(e) => set({ timeWindow: e.target.value as ContactInfo["timeWindow"] })}>
            <option value="Morning">Morning</option>
            <option value="Afternoon">Afternoon</option>
            <option value="Evening">Evening</option>
          </select>
        </Field>
      </div>

      <label
        style={{
          display: "flex",
          gap: "0.6rem",
          alignItems: "flex-start",
          padding: "0.9rem 1rem",
          marginTop: "0.5rem",
          background: contact.justExploring ? "rgba(196,158,90,0.10)" : "var(--bg-deep)",
          border: contact.justExploring ? "1px solid var(--gold)" : "1px solid var(--border)",
          borderRadius: "0.5rem",
          cursor: "pointer",
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        <input
          type="checkbox"
          checked={contact.justExploring}
          onChange={(e) => set({ justExploring: e.target.checked })}
          style={{ marginTop: "0.2rem", flexShrink: 0 }}
        />
        <span style={{ fontSize: "0.88rem", color: "var(--text)", lineHeight: 1.55 }}>
          <strong>I just want to talk first.</strong> I haven't decided on federal vs. provincial, a name, directors, or share structure yet — I'd like a preliminary call to figure out what my corporation should look like.
          <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            Skips the corporation, directors, and share-structure steps.
          </span>
        </span>
      </label>
    </>
  );
}

function StepCorporation({ corp, setCorp, jurisdiction }: { corp: Corporation; setCorp: (c: Corporation) => void; jurisdiction: Jurisdiction | undefined }) {
  const set = (p: Partial<Corporation>) => setCorp({ ...corp, ...p });
  const setAddr = (p: Partial<Address>) => setCorp({ ...corp, office: { ...corp.office, ...p } });
  return (
    <>
      <StepHeading title="Your corporation" sub="Jurisdiction, name, registered office, and what the business will do." />

      <Field label="Jurisdiction of incorporation" hint="Federal or one of Canada's 13 provinces / territories. Same $699 all-in fee regardless.">
        <select style={inputStyle} value={corp.jurisdictionKey} onChange={(e) => set({ jurisdictionKey: e.target.value })}>
          <option value="">Select a jurisdiction…</option>
          {JURISDICTIONS.map((j) => (
            <option key={j.key} value={j.key}>{j.label}</option>
          ))}
        </select>
      </Field>

      {jurisdiction && jurisdiction.key !== "unknown" && (
        <div style={{ padding: "0.75rem 1rem", background: "rgba(196,158,90,0.1)", borderLeft: "3px solid var(--gold)", borderRadius: "0.3rem", marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
          <Info size={14} style={{ color: "var(--gold)", marginTop: "0.2rem", flexShrink: 0 }} />
          <div style={{ fontSize: "0.82rem", color: "var(--text)", lineHeight: 1.5 }}>
            <strong>{jurisdiction.label}:</strong> {jurisdiction.residencyNote}
          </div>
        </div>
      )}

      <Field label="Named or numbered?" hint="Numbered corporations skip the NUANS name search — faster and cheaper to set up if you don't need brand identity in the legal name.">
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {(["named", "numbered"] as const).map((v) => (
            <label
              key={v}
              style={{
                flex: "1 1 200px",
                padding: "0.75rem 1rem",
                border: corp.nameType === v ? "1px solid var(--primary)" : "1px solid var(--border)",
                background: corp.nameType === v ? "rgba(0,61,91,0.05)" : "var(--bg)",
                borderRadius: "0.4rem",
                cursor: "pointer",
                fontSize: "0.88rem",
                color: "var(--text)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <input type="radio" checked={corp.nameType === v} onChange={() => set({ nameType: v })} style={{ margin: 0 }} />
              <span>
                <strong style={{ display: "block", marginBottom: "0.15rem" }}>{v === "named" ? "Named" : "Numbered"}</strong>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {v === "named" ? "e.g. Acme Consulting Inc." : "e.g. 1234567 Ontario Inc."}
                </span>
              </span>
            </label>
          ))}
        </div>
      </Field>

      {corp.nameType === "named" && (
        <>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginBottom: "0.75rem", lineHeight: 1.5 }}>
            Registries reject names that conflict with existing corporations or trademarks. Three ranked options let us fall through without restarting the search.
          </div>
          <Field label="Intended name — option 1"><input style={inputStyle} value={corp.name1} onChange={(e) => set({ name1: e.target.value })} placeholder="e.g. Acme Consulting Inc." /></Field>
          <Field label="Intended name — option 2"><input style={inputStyle} value={corp.name2} onChange={(e) => set({ name2: e.target.value })} /></Field>
          <Field label="Intended name — option 3"><input style={inputStyle} value={corp.name3} onChange={(e) => set({ name3: e.target.value })} /></Field>
        </>
      )}

      <div style={{ padding: "0.85rem 1rem", background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: "0.4rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>Registered office address</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <input style={inputStyle} placeholder="Street address" value={corp.office.street} onChange={(e) => setAddr({ street: e.target.value })} />
          <input style={inputStyle} placeholder="City" value={corp.office.city} onChange={(e) => setAddr({ city: e.target.value })} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <input style={inputStyle} placeholder="Province" value={corp.office.province} onChange={(e) => setAddr({ province: e.target.value })} />
          <input style={inputStyle} placeholder="Postal code" value={corp.office.postal} onChange={(e) => setAddr({ postal: e.target.value })} />
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
          Must be a physical address in the jurisdiction of incorporation. Most registries do not accept a PO box alone.
        </div>
      </div>

      <Field label="Nature of business">
        <select style={inputStyle} value={corp.nature} onChange={(e) => set({ nature: e.target.value })}>
          <option value="">Select…</option>
          {NATURE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
      {corp.nature === "Other" && (
        <Field label="Describe the nature"><input style={inputStyle} value={corp.natureOther} onChange={(e) => set({ natureOther: e.target.value })} /></Field>
      )}

      <Field label="What will the business do?" hint={`${corp.activity.length}/800 · minimum 30 characters. A one- or two-sentence plain-English description.`}>
        <textarea style={{ ...inputStyle, minHeight: "5rem", resize: "vertical" }} maxLength={800} value={corp.activity} onChange={(e) => set({ activity: e.target.value })} />
      </Field>
    </>
  );
}

function StepDirectors({ directors, setDirectors, jurisdiction }: { directors: Director[]; setDirectors: (d: Director[]) => void; jurisdiction: Jurisdiction | undefined }) {
  const setDir = (i: number, p: Partial<Director>) => {
    setDirectors(directors.map((d, ix) => ix === i ? { ...d, ...p } : d));
  };
  const setDirAddr = (i: number, p: Partial<Address>) => {
    setDirectors(directors.map((d, ix) => ix === i ? { ...d, address: { ...d.address, ...p } } : d));
  };
  const add = () => setDirectors([...directors, emptyDirector()]);
  const remove = (i: number) => setDirectors(directors.length > 1 ? directors.filter((_, ix) => ix !== i) : directors);

  return (
    <>
      <StepHeading title="Directors" sub="All Canadian jurisdictions allow a single-director corporation. Add more if you already know who they'll be — you can always appoint additional directors later by resolution." />

      {jurisdiction && jurisdiction.key !== "unknown" && (
        <div style={{ padding: "0.75rem 1rem", background: "rgba(196,158,90,0.1)", borderLeft: "3px solid var(--gold)", borderRadius: "0.3rem", marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
          <Info size={14} style={{ color: "var(--gold)", marginTop: "0.2rem", flexShrink: 0 }} />
          <div style={{ fontSize: "0.82rem", color: "var(--text)", lineHeight: 1.5 }}>
            <strong>{jurisdiction.label} residency rule:</strong> {jurisdiction.residencyNote}
          </div>
        </div>
      )}

      {directors.map((d, i) => (
        <div key={i} style={{ padding: "1rem 1.15rem", border: "1px solid var(--border)", borderRadius: "0.5rem", marginBottom: "0.75rem", background: "var(--bg-deep)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <strong style={{ fontSize: "0.85rem", color: "var(--text)" }}>Director {i + 1}</strong>
            {directors.length > 1 && (
              <button onClick={() => remove(i)} title="Remove" style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "0.25rem" }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <input style={inputStyle} placeholder="Full legal name" value={d.fullName} onChange={(e) => setDir(i, { fullName: e.target.value })} />
            <input type="email" style={inputStyle} placeholder="Email" value={d.email} onChange={(e) => setDir(i, { email: e.target.value })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <input type="tel" style={inputStyle} placeholder="Phone (optional)" value={d.phone} onChange={(e) => setDir(i, { phone: e.target.value })} />
            <div style={{ display: "flex", alignItems: "center" }}>
              <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.82rem", color: "var(--text)" }}>
                <input type="checkbox" checked={d.canadianResident} onChange={(e) => setDir(i, { canadianResident: e.target.checked })} />
                Canadian resident
              </label>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <input style={inputStyle} placeholder="Residential street" value={d.address.street} onChange={(e) => setDirAddr(i, { street: e.target.value })} />
            <input style={inputStyle} placeholder="City" value={d.address.city} onChange={(e) => setDirAddr(i, { city: e.target.value })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.6rem" }}>
            <input style={inputStyle} placeholder="Province / State" value={d.address.province} onChange={(e) => setDirAddr(i, { province: e.target.value })} />
            <input style={inputStyle} placeholder="Postal / ZIP" value={d.address.postal} onChange={(e) => setDirAddr(i, { postal: e.target.value })} />
          </div>
          <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.82rem", color: "var(--text)" }}>
            <input type="checkbox" checked={d.ageOk} onChange={(e) => setDir(i, { ageOk: e.target.checked })} />
            This person is 18 years or older
          </label>
        </div>
      ))}

      <button onClick={add} style={{ padding: "0.55rem 1rem", background: "transparent", border: "1px dashed var(--border)", borderRadius: "0.4rem", cursor: "pointer", color: "var(--text)", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
        <Plus size={14} /> Add another director
      </button>
    </>
  );
}

function StepShares({ shares, setShares }: { shares: ShareStructure; setShares: (s: ShareStructure) => void }) {
  const set = (p: Partial<ShareStructure>) => setShares({ ...shares, ...p });
  return (
    <>
      <StepHeading title="Share structure" sub="Determines your articles of incorporation — the specialist will draft share provisions that fit your ownership plan." />

      <div style={{ marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.4rem" }}>What kind of share structure do you need?</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {([
            { v: "simple",   t: "Simple — one class of common voting shares", d: "Most solo founders and simple co-founder splits. Cheapest to set up and maintain." },
            { v: "multiple", t: "Multiple classes — voting, non-voting, preferred, etc.", d: "Family holdings, estate planning, tax-planning splits, investor-ready structures." },
            { v: "unsure",   t: "Not sure — recommend on the call",                        d: "The specialist walks through your ownership and tax plan and picks the right structure." },
          ] as const).map((opt) => (
            <label
              key={opt.v}
              style={{
                padding: "0.75rem 1rem",
                border: shares.structureType === opt.v ? "1px solid var(--primary)" : "1px solid var(--border)",
                background: shares.structureType === opt.v ? "rgba(0,61,91,0.05)" : "var(--bg)",
                borderRadius: "0.4rem",
                cursor: "pointer",
                fontSize: "0.88rem",
                color: "var(--text)",
                display: "flex",
                gap: "0.5rem",
                alignItems: "flex-start",
              }}
            >
              <input type="radio" checked={shares.structureType === opt.v} onChange={() => set({ structureType: opt.v })} style={{ marginTop: "0.15rem" }} />
              <span>
                <strong style={{ display: "block", marginBottom: "0.15rem" }}>{opt.t}</strong>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{opt.d}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <Field label="How many initial shareholders?">
        <select style={inputStyle} value={shares.shareholders} onChange={(e) => set({ shareholders: e.target.value as ShareStructure["shareholders"] })}>
          <option value="">Select…</option>
          <option value="1">1 (sole owner)</option>
          <option value="2">2</option>
          <option value="3-5">3–5</option>
          <option value="6-10">6–10</option>
          <option value="10+">More than 10</option>
        </select>
      </Field>

      <div style={{ marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.4rem" }}>Any special rights or restrictions on the shares?</div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.5rem", lineHeight: 1.5 }}>
          E.g. non-voting classes, dividend preferences, redemption rights, unanimous shareholder agreement, transfer restrictions.
        </div>
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          {(["yes", "no", "unsure"] as const).map((v) => (
            <label
              key={v}
              style={{
                padding: "0.5rem 0.9rem",
                border: shares.specialRights === v ? "1px solid var(--primary)" : "1px solid var(--border)",
                background: shares.specialRights === v ? "rgba(0,61,91,0.05)" : "var(--bg)",
                borderRadius: "0.4rem",
                cursor: "pointer",
                fontSize: "0.85rem",
                color: "var(--text)",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
              }}
            >
              <input type="radio" checked={shares.specialRights === v} onChange={() => set({ specialRights: v })} style={{ margin: 0 }} />
              {v === "yes" ? "Yes" : v === "no" ? "No" : "Not sure"}
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

function StepReview({
  contact, corp, directors, shares, notes, setNotes, consent, setConsent, jurisdiction,
}: {
  contact: ContactInfo;
  corp: Corporation;
  directors: Director[];
  shares: ShareStructure;
  notes: string;
  setNotes: (v: string) => void;
  consent: boolean;
  setConsent: (v: boolean) => void;
  jurisdiction: Jurisdiction | undefined;
}) {
  const filledDirectors = directors.filter((d) => d.fullName.trim());
  const exploring = contact.justExploring;
  return (
    <>
      <StepHeading
        title={exploring ? "One more step" : "Review and consent"}
        sub={exploring
          ? "You've asked for a preliminary call to figure things out. Tell us anything else you'd like the specialist to know, then submit — we'll reach out within one business day."
          : "Confirm everything looks right, then submit — we'll be in touch within one business day."}
      />

      <ReviewBlock title="Contact">
        {contact.fullName} · {contact.email} · {contact.phone} · Prefers {contact.contactMethod.toLowerCase()} in the {contact.timeWindow.toLowerCase()}
      </ReviewBlock>

      {exploring && (
        <div style={{ padding: "0.85rem 1rem", background: "rgba(196,158,90,0.10)", borderLeft: "3px solid var(--gold)", borderRadius: "0.3rem", marginBottom: "0.75rem", fontSize: "0.85rem", color: "var(--text)", lineHeight: 1.55 }}>
          <strong>Preliminary consultation:</strong> we understand you haven't decided on jurisdiction, name, directors, or share structure yet. The specialist will help you scope those on the call.
        </div>
      )}

      {!exploring && (
      <ReviewBlock title="Corporation">
        <div>Jurisdiction: <strong>{jurisdiction?.label ?? "—"}</strong></div>
        <div>Name type: <strong>{corp.nameType === "numbered" ? "Numbered" : "Named"}</strong></div>
        {corp.nameType === "named" && <div>Names: {corp.name1} · {corp.name2} · {corp.name3}</div>}
        <div>Registered office: {corp.office.street}, {corp.office.city}, {corp.office.province} {corp.office.postal}</div>
        <div>Nature: {corp.nature === "Other" ? corp.natureOther : corp.nature}</div>
      </ReviewBlock>
      )}

      {!exploring && (
      <ReviewBlock title={`Directors (${filledDirectors.length})`}>
        {filledDirectors.map((d, i) => (
          <div key={i}>
            {i + 1}. {d.fullName} · {d.email}
            {d.canadianResident ? " · Canadian resident" : " · Non-resident"}
          </div>
        ))}
      </ReviewBlock>
      )}

      {!exploring && (
      <ReviewBlock title="Share structure">
        <div>Structure: {shares.structureType === "simple" ? "Simple (one class of common)" : shares.structureType === "multiple" ? "Multiple classes" : "Not sure — recommend on call"}</div>
        <div>Shareholders: {shares.shareholders} · Special rights: {shares.specialRights === "yes" ? "Yes" : shares.specialRights === "no" ? "No" : "Not sure"}</div>
      </ReviewBlock>
      )}

      <Field label={exploring ? "What would you like to discuss on the call? (optional)" : "Anything else we should know? (optional)"}>
        <textarea
          style={{ ...inputStyle, minHeight: "4rem", resize: "vertical" }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={exploring
            ? "Rough idea of what your business will do, whether you have co-founders or investors, tax questions, anything you're stuck on…"
            : "Deadlines, tax planning, holding structure, questions for the specialist…"}
        />
      </Field>

      <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", fontSize: "0.85rem", color: "var(--text)", padding: "0.85rem 1rem", background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: "0.4rem", lineHeight: 1.55 }}>
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: "0.25rem", flexShrink: 0 }} />
        <span>
          I agree to be contacted by CRS about this consultation and consent to the storage of my information under PIPEDA. See our{" "}
          <a href="/privacy" style={{ color: "var(--secondary)" }} target="_blank" rel="noopener">privacy policy</a>.
        </span>
      </label>
    </>
  );
}

/* ────────────────────────── Small pieces ────────────────────────── */

function StepHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.35rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.35rem" }}>{title}</h2>
      <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.55 }}>{sub}</p>
    </div>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: "0.85rem 1rem", background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: "0.4rem", marginBottom: "0.75rem", fontSize: "0.85rem", color: "var(--text)", lineHeight: 1.55 }}>
      <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", fontWeight: 700, marginBottom: "0.35rem" }}>{title}</div>
      {children}
    </div>
  );
}
