"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2, CheckCircle2, AlertCircle, Info } from "lucide-react";

/**
 * Multi-step booking form for /not-for-profit/book-free-consultation.
 *
 * Steps:
 *   1. Contact info
 *   2. Organization (jurisdiction + 3 names + registered office + purpose)
 *   3. Board members (dynamic min directors + min incorporators per jurisdiction)
 *   4. Activities and funding (donations / charity / events / revenue / grants)
 *   5. Review + PIPEDA consent + submit
 *
 * On success, we show a plain "we'll reach out within one business day"
 * confirmation — same pattern as the MinuteBook pilot. No calendar link.
 */

/* ────────────────────────── Types ────────────────────────── */

type Jurisdiction = {
  key:               string;
  label:             string;
  minDirectors:      string;   // human-readable — some jurisdictions are "set by by-laws"
  minIncorporators:  string;
  age:               18 | 19;  // NB + NL require 19
};

// From content/not-for-profit/book-free-consultation.md — table of registry
// minimums. "unknown" is a passthrough so the specialist can advise.
const JURISDICTIONS: Jurisdiction[] = [
  { key: "unknown", label: "Not sure — advise me",         minDirectors: "TBD",                                                      minIncorporators: "TBD",           age: 18 },
  { key: "federal", label: "Federal (CNCA)",               minDirectors: "1 (3 if soliciting donations, incl. 2 non-officers)",     minIncorporators: "1 incorporator", age: 18 },
  { key: "on",      label: "Ontario (ONCA)",               minDirectors: "3",                                                        minIncorporators: "1+ voting member class", age: 18 },
  { key: "bc",      label: "British Columbia",             minDirectors: "3 (ordinary) / 1 (member-funded)",                         minIncorporators: "1 applicant",   age: 18 },
  { key: "ab",      label: "Alberta (Societies Act)",      minDirectors: "Set by by-laws",                                           minIncorporators: "5 members",     age: 18 },
  { key: "sk",      label: "Saskatchewan",                 minDirectors: "1 (membership) / 3 (charitable)",                          minIncorporators: "1 incorporator", age: 18 },
  { key: "mb",      label: "Manitoba",                     minDirectors: "3",                                                        minIncorporators: "Signatories to articles", age: 18 },
  { key: "qc",      label: "Quebec (Companies Act Part III)", minDirectors: "3",                                                     minIncorporators: "3 founders",    age: 18 },
  { key: "ns",      label: "Nova Scotia",                  minDirectors: "Set by by-laws",                                           minIncorporators: "5 subscribers", age: 18 },
  { key: "nb",      label: "New Brunswick",                minDirectors: "3",                                                        minIncorporators: "3 applicants (19+)", age: 19 },
  { key: "pe",      label: "Prince Edward Island",         minDirectors: "3",                                                        minIncorporators: "3 petitioners", age: 18 },
  { key: "nl",      label: "Newfoundland and Labrador",    minDirectors: "3 (19+)",                                                  minIncorporators: "1 incorporator", age: 19 },
  { key: "yt",      label: "Yukon",                        minDirectors: "3 (standard) / 1 (member-funded)",                         minIncorporators: "3 incorporators", age: 18 },
  { key: "nt",      label: "Northwest Territories",        minDirectors: "Set by by-laws",                                           minIncorporators: "5 persons",     age: 18 },
  { key: "nu",      label: "Nunavut",                      minDirectors: "Set by by-laws",                                           minIncorporators: "5 persons",     age: 18 },
];

type ContactInfo = {
  fullName: string;
  email:    string;
  phone:    string;
  contactMethod: "Email" | "Phone" | "Video call";
  timeWindow:    "Morning" | "Afternoon" | "Evening";
  /** "Just want to talk" mode — skips Organization/Board/Activities steps
   *  and goes straight from Contact to Review. For visitors who haven't
   *  decided on names, board, or activities yet. */
  justExploring: boolean;
};

type Address = {
  street:   string;
  city:     string;
  province: string;
  postal:   string;
};

type Organization = {
  jurisdictionKey: string;
  name1:           string;
  name2:           string;
  name3:           string;
  office:          Address;
  nature:          string;
  natureOther:     string;
  purpose:         string;
  serves:          string;
};

type BoardRole = "President" | "Secretary" | "Treasurer" | "Trustee" | "Director (no officer role)";

type BoardMember = {
  fullName:    string;
  role:        BoardRole;
  email:       string;
  phone:       string;
  address:     Address;
  ageOk:       boolean;
};

type Activities = {
  donations:   "Yes" | "No" | "Not sure" | "";
  charity:     "Yes" | "No" | "Not sure" | "";
  eventsPerYear: "0-2" | "3-6" | "7-12" | ">12" | "";
  annualRevenue: "<$10k" | "$10k-$50k" | "$50k-$250k" | ">$250k" | "";
  grants:      "Yes" | "No" | "Not sure" | "";
};

const NATURE_OPTIONS = [
  "Community services",
  "Sports & recreation",
  "Arts & culture",
  "Religious",
  "Educational",
  "Health & wellness",
  "Environmental",
  "Professional or trade association",
  "Housing",
  "Other",
];

const emptyAddress = (): Address => ({ street: "", city: "", province: "", postal: "" });
const emptyBoardMember = (): BoardMember => ({
  fullName: "", role: "Director (no officer role)", email: "", phone: "", address: emptyAddress(), ageOk: false,
});

const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const phoneOk = (s: string) => s.replace(/\D/g, "").length === 10;

/* ────────────────────────── Component ────────────────────────── */

const STEPS = ["Contact", "Organization", "Board", "Activities", "Review"] as const;

export default function NfpConsultationForm() {
  const [step, setStep] = useState(0);

  const [contact, setContact] = useState<ContactInfo>({
    fullName: "", email: "", phone: "", contactMethod: "Email", timeWindow: "Morning",
    justExploring: false,
  });

  const [org, setOrg] = useState<Organization>({
    jurisdictionKey: "",
    name1: "", name2: "", name3: "",
    office: emptyAddress(),
    nature: "", natureOther: "",
    purpose: "", serves: "",
  });

  const [board, setBoard] = useState<BoardMember[]>([emptyBoardMember(), emptyBoardMember(), emptyBoardMember()]);

  const [activities, setActivities] = useState<Activities>({
    donations: "", charity: "", eventsPerYear: "", annualRevenue: "", grants: "",
  });

  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr]   = useState("");
  const [success, setSuccess]       = useState(false);

  const jurisdiction = JURISDICTIONS.find((j) => j.key === org.jurisdictionKey);

  /* Skip the Organization/Board/Activities steps for visitors who tick
     "I just want to talk". Contact → Review directly. */
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
        if (!org.jurisdictionKey) return false;
        if (!org.name1.trim() || !org.name2.trim() || !org.name3.trim()) return false;
        const a = org.office;
        if (!a.street || !a.city || !a.province || !a.postal) return false;
        if (!org.nature) return false;
        if (org.nature === "Other" && !org.natureOther.trim()) return false;
        if (org.purpose.trim().length < 50) return false;
        if (org.serves.trim().length < 30) return false;
        return true;
      }
      case 2: {
        const filled = board.filter((b) => b.fullName.trim() && emailOk(b.email) && b.address.street);
        if (filled.length < 3) return false;
        // At least one President, one Secretary, one Treasurer across filled members
        const roles = filled.map((b) => b.role);
        if (!roles.includes("President") || !roles.includes("Secretary") || !roles.includes("Treasurer")) return false;
        if (!filled.every((b) => b.ageOk)) return false;
        return true;
      }
      case 3:
        return !!(activities.donations && activities.charity && activities.eventsPerYear && activities.annualRevenue && activities.grants);
      case 4:
        return consent;
      default:
        return false;
    }
  }, [step, contact, org, board, activities, consent]);

  /* ─── Submit ─── */
  const submit = async () => {
    setSubmitting(true);
    setSubmitErr("");
    try {
      const exploring = contact.justExploring;
      const res = await fetch("/api/not-for-profit/consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact,
          explorationMode: exploring,
          organization: exploring ? null : {
            ...org,
            jurisdictionLabel: jurisdiction?.label ?? org.jurisdictionKey,
          },
          board:      exploring ? [] : board.filter((b) => b.fullName.trim()),
          activities: exploring ? null : activities,
          notes: notes.trim() || undefined,
          sourcePath: typeof window !== "undefined" ? window.location.pathname : "/not-for-profit/book-free-consultation",
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
      {/* Stepper — middle steps grey out when the visitor is in
          "just want to talk" mode so they can see the shortcut. */}
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
        {step === 1 && <StepOrganization org={org} setOrg={setOrg} />}
        {step === 2 && <StepBoard board={board} setBoard={setBoard} jurisdiction={jurisdiction} />}
        {step === 3 && <StepActivities activities={activities} setActivities={setActivities} />}
        {step === 4 && (
          <StepReview
            contact={contact} org={org} board={board} activities={activities}
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
        <input type="email" style={inputStyle} value={contact.email} onChange={(e) => set({ email: e.target.value })} placeholder="you@yourorg.ca" />
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

      {/* Escape hatch for early-stage visitors — skips the org/board/
          activities steps and goes straight to Review. */}
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
          <strong>I just want to talk first.</strong> I haven't finalised names, a board, or activities yet — I'd like a preliminary call to figure out what my organisation actually needs.
          <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            Skips the organization, board, and activities steps.
          </span>
        </span>
      </label>
    </>
  );
}

function StepOrganization({ org, setOrg }: { org: Organization; setOrg: (o: Organization) => void }) {
  const set = (p: Partial<Organization>) => setOrg({ ...org, ...p });
  const setAddr = (p: Partial<Address>) => setOrg({ ...org, office: { ...org.office, ...p } });
  return (
    <>
      <StepHeading title="Your organization" sub="Registries reject names that conflict with existing corporations or trademarks — three ranked options let us fall through without restarting the search." />

      <Field label="Jurisdiction of incorporation" hint="Federal or one of Canada's 13 provinces / territories.">
        <select style={inputStyle} value={org.jurisdictionKey} onChange={(e) => set({ jurisdictionKey: e.target.value })}>
          <option value="">Select a jurisdiction…</option>
          {JURISDICTIONS.map((j) => (
            <option key={j.key} value={j.key}>{j.label}</option>
          ))}
        </select>
      </Field>

      <Field label="Intended name — option 1"><input style={inputStyle} value={org.name1} onChange={(e) => set({ name1: e.target.value })} placeholder="e.g. Prairie Youth Arts Society" /></Field>
      <Field label="Intended name — option 2"><input style={inputStyle} value={org.name2} onChange={(e) => set({ name2: e.target.value })} /></Field>
      <Field label="Intended name — option 3"><input style={inputStyle} value={org.name3} onChange={(e) => set({ name3: e.target.value })} /></Field>

      <div style={{ padding: "0.85rem 1rem", background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: "0.4rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>Registered office address</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <input style={inputStyle} placeholder="Street address" value={org.office.street} onChange={(e) => setAddr({ street: e.target.value })} />
          <input style={inputStyle} placeholder="City" value={org.office.city} onChange={(e) => setAddr({ city: e.target.value })} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <input style={inputStyle} placeholder="Province" value={org.office.province} onChange={(e) => setAddr({ province: e.target.value })} />
          <input style={inputStyle} placeholder="Postal code" value={org.office.postal} onChange={(e) => setAddr({ postal: e.target.value })} />
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
          Must be a physical address in the chosen jurisdiction. Most registries do not accept a PO box alone.
        </div>
      </div>

      <Field label="Nature of the not-for-profit">
        <select style={inputStyle} value={org.nature} onChange={(e) => set({ nature: e.target.value })}>
          <option value="">Select…</option>
          {NATURE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </Field>
      {org.nature === "Other" && (
        <Field label="Describe the nature"><input style={inputStyle} value={org.natureOther} onChange={(e) => set({ natureOther: e.target.value })} /></Field>
      )}

      <Field label="What will the organization do?" hint={`${org.purpose.length}/1000 · minimum 50 characters. Becomes the draft "purposes / objects" clause.`}>
        <textarea style={{ ...inputStyle, minHeight: "5.5rem", resize: "vertical" }} maxLength={1000} value={org.purpose} onChange={(e) => set({ purpose: e.target.value })} />
      </Field>

      <Field label="Who will it serve?" hint={`${org.serves.length}/500 · minimum 30 characters. Community served, membership base.`}>
        <textarea style={{ ...inputStyle, minHeight: "4rem", resize: "vertical" }} maxLength={500} value={org.serves} onChange={(e) => set({ serves: e.target.value })} />
      </Field>
    </>
  );
}

function StepBoard({ board, setBoard, jurisdiction }: { board: BoardMember[]; setBoard: (b: BoardMember[]) => void; jurisdiction: Jurisdiction | undefined }) {
  const setMember = (i: number, p: Partial<BoardMember>) => {
    setBoard(board.map((m, ix) => ix === i ? { ...m, ...p } : m));
  };
  const setMemberAddr = (i: number, p: Partial<Address>) => {
    setBoard(board.map((m, ix) => ix === i ? { ...m, address: { ...m.address, ...p } } : m));
  };
  const add = () => setBoard([...board, emptyBoardMember()]);
  const remove = (i: number) => setBoard(board.length > 3 ? board.filter((_, ix) => ix !== i) : board);

  return (
    <>
      <StepHeading title="Board and officers" sub="Every not-for-profit needs a founding board. Requirements vary by jurisdiction — we'll flag anything missing before you file." />

      {jurisdiction && jurisdiction.key !== "unknown" && (
        <div style={{ padding: "0.75rem 1rem", background: "rgba(196,158,90,0.1)", borderLeft: "3px solid var(--gold)", borderRadius: "0.3rem", marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
          <Info size={14} style={{ color: "var(--gold)", marginTop: "0.2rem", flexShrink: 0 }} />
          <div style={{ fontSize: "0.82rem", color: "var(--text)", lineHeight: 1.5 }}>
            <strong>{jurisdiction.label}:</strong> minimum directors — {jurisdiction.minDirectors}. Minimum incorporators — {jurisdiction.minIncorporators}. Directors must be {jurisdiction.age}+.
          </div>
        </div>
      )}

      <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
        Add at least three members with these roles across the board: President, Secretary, Treasurer. Add more if your jurisdiction requires it.
      </div>

      {board.map((m, i) => (
        <div key={i} style={{ padding: "1rem 1.15rem", border: "1px solid var(--border)", borderRadius: "0.5rem", marginBottom: "0.75rem", background: "var(--bg-deep)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <strong style={{ fontSize: "0.85rem", color: "var(--text)" }}>Board member {i + 1}</strong>
            {board.length > 3 && (
              <button onClick={() => remove(i)} title="Remove" style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "0.25rem" }}>
                <Trash2 size={14} />
              </button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <input style={inputStyle} placeholder="Full legal name" value={m.fullName} onChange={(e) => setMember(i, { fullName: e.target.value })} />
            <select style={inputStyle} value={m.role} onChange={(e) => setMember(i, { role: e.target.value as BoardRole })}>
              <option value="President">President</option>
              <option value="Secretary">Secretary</option>
              <option value="Treasurer">Treasurer</option>
              <option value="Trustee">Trustee</option>
              <option value="Director (no officer role)">Director (no officer role)</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <input type="email" style={inputStyle} placeholder="Email" value={m.email} onChange={(e) => setMember(i, { email: e.target.value })} />
            <input type="tel" style={inputStyle} placeholder="Phone (optional)" value={m.phone} onChange={(e) => setMember(i, { phone: e.target.value })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <input style={inputStyle} placeholder="Residential street" value={m.address.street} onChange={(e) => setMemberAddr(i, { street: e.target.value })} />
            <input style={inputStyle} placeholder="City" value={m.address.city} onChange={(e) => setMemberAddr(i, { city: e.target.value })} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginBottom: "0.6rem" }}>
            <input style={inputStyle} placeholder="Province" value={m.address.province} onChange={(e) => setMemberAddr(i, { province: e.target.value })} />
            <input style={inputStyle} placeholder="Postal code" value={m.address.postal} onChange={(e) => setMemberAddr(i, { postal: e.target.value })} />
          </div>
          <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.82rem", color: "var(--text)" }}>
            <input type="checkbox" checked={m.ageOk} onChange={(e) => setMember(i, { ageOk: e.target.checked })} />
            {jurisdiction?.age === 19 ? "This person is 19 years or older" : "This person is 18 years or older"}
          </label>
        </div>
      ))}

      <button onClick={add} style={{ padding: "0.55rem 1rem", background: "transparent", border: "1px dashed var(--border)", borderRadius: "0.4rem", cursor: "pointer", color: "var(--text)", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
        <Plus size={14} /> Add another board member
      </button>
    </>
  );
}

function StepActivities({ activities, setActivities }: { activities: Activities; setActivities: (a: Activities) => void }) {
  const set = (p: Partial<Activities>) => setActivities({ ...activities, ...p });

  return (
    <>
      <StepHeading title="Activities and funding" sub="Determines whether you need charity-ready articles, extra directors under the soliciting-corporation rules, or specific licensing." />

      <RadioGroup
        label="Will you accept donations?"
        value={activities.donations}
        onChange={(v) => set({ donations: v as Activities["donations"] })}
        options={["Yes", "No", "Not sure"]}
      />
      {activities.donations === "Yes" && (
        <div style={{ padding: "0.6rem 0.9rem", background: "var(--bg-deep)", borderLeft: "3px solid var(--secondary)", borderRadius: "0.3rem", fontSize: "0.78rem", color: "var(--text-muted)", margin: "-0.35rem 0 1rem", lineHeight: 1.5 }}>
          Federal soliciting corporations need a 3-person board (2 non-officers). Donation tax receipts require a separate CRA charitable registration.
        </div>
      )}

      <RadioGroup
        label="Do you plan to apply for registered charity status (CRA)?"
        value={activities.charity}
        onChange={(v) => set({ charity: v as Activities["charity"] })}
        options={["Yes", "No", "Not sure"]}
      />

      <Field label="Planned events per year">
        <select style={inputStyle} value={activities.eventsPerYear} onChange={(e) => set({ eventsPerYear: e.target.value as Activities["eventsPerYear"] })}>
          <option value="">Select…</option>
          <option value="0-2">0–2</option>
          <option value="3-6">3–6</option>
          <option value="7-12">7–12</option>
          <option value=">12">More than 12</option>
        </select>
      </Field>

      <Field label="Expected annual revenue (first year)">
        <select style={inputStyle} value={activities.annualRevenue} onChange={(e) => set({ annualRevenue: e.target.value as Activities["annualRevenue"] })}>
          <option value="">Select…</option>
          <option value="<$10k">Under $10,000</option>
          <option value="$10k-$50k">$10,000 – $50,000</option>
          <option value="$50k-$250k">$50,000 – $250,000</option>
          <option value=">$250k">Over $250,000</option>
        </select>
      </Field>

      <RadioGroup
        label="Will you apply for government grants?"
        value={activities.grants}
        onChange={(v) => set({ grants: v as Activities["grants"] })}
        options={["Yes", "No", "Not sure"]}
      />
      {activities.grants === "Yes" && (
        <div style={{ padding: "0.6rem 0.9rem", background: "var(--bg-deep)", borderLeft: "3px solid var(--secondary)", borderRadius: "0.3rem", fontSize: "0.78rem", color: "var(--text-muted)", margin: "-0.35rem 0 1rem", lineHeight: 1.5 }}>
          Your specialist will bring the matching grants list from our <a href="/nfp-grants/" style={{ color: "var(--secondary)" }}>grants guides</a>.
        </div>
      )}
    </>
  );
}

function StepReview({
  contact, org, board, activities, notes, setNotes, consent, setConsent, jurisdiction,
}: {
  contact: ContactInfo;
  org: Organization;
  board: BoardMember[];
  activities: Activities;
  notes: string;
  setNotes: (v: string) => void;
  consent: boolean;
  setConsent: (v: boolean) => void;
  jurisdiction: Jurisdiction | undefined;
}) {
  const filledBoard = board.filter((b) => b.fullName.trim());
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
          <strong>Preliminary consultation:</strong> we understand you haven't finalised names, board, or activities yet. The specialist will help you scope those on the call.
        </div>
      )}

      {!exploring && (
      <ReviewBlock title="Organization">
        <div>Jurisdiction: <strong>{jurisdiction?.label ?? "—"}</strong></div>
        <div>Names: {org.name1} · {org.name2} · {org.name3}</div>
        <div>Registered office: {org.office.street}, {org.office.city}, {org.office.province} {org.office.postal}</div>
        <div>Nature: {org.nature === "Other" ? org.natureOther : org.nature}</div>
      </ReviewBlock>
      )}

      {!exploring && (
      <ReviewBlock title={`Board (${filledBoard.length} member${filledBoard.length === 1 ? "" : "s"})`}>
        {filledBoard.map((m, i) => (
          <div key={i}>{i + 1}. {m.fullName} — {m.role} · {m.email}</div>
        ))}
      </ReviewBlock>
      )}

      {!exploring && (
      <ReviewBlock title="Activities">
        <div>Donations: {activities.donations} · Charity registration: {activities.charity}</div>
        <div>Events/year: {activities.eventsPerYear} · First-year revenue: {activities.annualRevenue} · Government grants: {activities.grants}</div>
      </ReviewBlock>
      )}

      <Field label={exploring ? "What would you like to discuss on the call? (optional)" : "Anything else we should know? (optional)"}>
        <textarea
          style={{ ...inputStyle, minHeight: "4rem", resize: "vertical" }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={exploring
            ? "Rough idea of what your organisation will do, questions you'd like answered, anything you're stuck on…"
            : "Deadlines, prior filings, questions for the specialist…"}
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

function RadioGroup({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.4rem" }}>{label}</div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {options.map((o) => (
          <label
            key={o}
            style={{
              padding: "0.5rem 0.9rem",
              border: value === o ? "1px solid var(--primary)" : "1px solid var(--border)",
              background: value === o ? "rgba(0,61,91,0.05)" : "var(--bg)",
              borderRadius: "0.4rem",
              cursor: "pointer",
              fontSize: "0.85rem",
              color: "var(--text)",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <input type="radio" checked={value === o} onChange={() => onChange(o)} style={{ margin: 0 }} />
            {o}
          </label>
        ))}
      </div>
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
