"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Plus, Trash2, Info, AlertCircle } from "lucide-react";
import { JURISDICTIONS } from "@/lib/service-config";
import PlacesInput, { type ParsedAddress } from "@/components/PlacesInput";

/* ────────────────────────── Types ────────────────────────── */

type CompanyType = "numbered" | "named" | "extra-provincial" | "not-for-profit";

type Address = {
  street:     string;
  city:       string;
  province:   string;
  postalCode: string;
  country:    string;
};

type Person = {
  fullName: string;
  street:   string;
  city:     string;
  province: string;
  postal:   string;
  country:  string;
  email:    string;
  phone:    string;
};

type Shareholder = Person & {
  sharePercent: string; // stored as string to preserve raw input
};

type Relationship = "Director" | "President" | "Legal Representative" | "Accountant" | "Other";

type Incorporator = {
  fullName:      string;
  email:         string;
  phone:         string;
  relationship:  Relationship;
  relationshipOther: string;
};

type FormState = {
  companyType:      CompanyType;
  jurisdictionKey:  string;
  nameOptions:      [string, string, string]; // for "named"
  homeJurisdiction: string;                    // for "extra-provincial"
  existingCorpName: string;                    // for "extra-provincial"

  registeredAddress:      Address;
  recordsSameAsRegistered: boolean;
  recordsAddress:         Address;

  directors:    Person[];
  shareholders: Shareholder[];
  incorporator: Incorporator;

  natureOfBusiness: string;
  fiscalYearEnd:    string; // MM-DD
  restrictions:     string;
};

/* ────────────────────────── Pricing ────────────────────────── */

const PRICING: Record<CompanyType, { label: string; price: number; blurb: string }> = {
  "numbered":         { label: "Numbered Company",       price: 699, blurb: "Government-assigned number name (e.g. 1234567 Ontario Inc.)." },
  "named":            { label: "Named Company",          price: 749, blurb: "Custom business name. Includes NUANS pre-search + filing." },
  "extra-provincial": { label: "Extra-Provincial",       price: 299, blurb: "Register an existing corporation to operate in another province." },
  "not-for-profit":   { label: "Not-for-Profit",         price: 699, blurb: "Non-profit or charitable organization." },
};

const RELATIONSHIPS: Relationship[] = ["Director", "President", "Legal Representative", "Accountant", "Other"];

/* ────────────────────────── Helpers ────────────────────────── */

const EMPTY_ADDRESS: Address = { street: "", city: "", province: "", postalCode: "", country: "Canada" };
const emptyPerson = (): Person => ({ fullName: "", street: "", city: "", province: "", postal: "", country: "Canada", email: "", phone: "" });
const emptyShareholder = (): Shareholder => ({ ...emptyPerson(), sharePercent: "" });

const emailOk = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/* ────────────────────────── Component ────────────────────────── */

const STEPS = ["Company", "Addresses", "People", "Business", "Review & Pay"] as const;

export default function IncorporationOrderFlow() {
  const params  = useSearchParams();
  const jurisdictionParam = params.get("jurisdiction") ?? "";
  const typeParam         = (params.get("type") as CompanyType | null);
  const attributionSrc    = params.get("src") ?? "direct";

  const [step, setStep] = useState(0);
  const [state, setState] = useState<FormState>({
    companyType:       typeParam && PRICING[typeParam] ? typeParam : "numbered",
    jurisdictionKey:   jurisdictionParam || "",
    nameOptions:       ["", "", ""],
    homeJurisdiction:  "",
    existingCorpName:  "",
    registeredAddress: { ...EMPTY_ADDRESS },
    recordsSameAsRegistered: true,
    recordsAddress:    { ...EMPTY_ADDRESS },
    directors:         [emptyPerson()],
    shareholders:      [],
    incorporator:      { fullName: "", email: "", phone: "", relationship: "Director", relationshipOther: "" },
    natureOfBusiness:  "",
    fiscalYearEnd:     "",
    restrictions:      "",
  });
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState("");

  const price = PRICING[state.companyType].price;

  /* ─── Field patch helpers ─── */
  const patch = (p: Partial<FormState>) => setState((s) => ({ ...s, ...p }));
  const patchAddr = (key: "registeredAddress" | "recordsAddress", p: Partial<Address>) =>
    setState((s) => ({ ...s, [key]: { ...s[key], ...p } }));
  const patchDirector = (i: number, p: Partial<Person>) =>
    setState((s) => ({ ...s, directors: s.directors.map((d, ix) => ix === i ? { ...d, ...p } : d) }));
  const patchShareholder = (i: number, p: Partial<Shareholder>) =>
    setState((s) => ({ ...s, shareholders: s.shareholders.map((sh, ix) => ix === i ? { ...sh, ...p } : sh) }));
  const patchIncorporator = (p: Partial<Incorporator>) =>
    setState((s) => ({ ...s, incorporator: { ...s.incorporator, ...p } }));

  /* ─── Validation per step ─── */
  const canContinue = useMemo(() => {
    switch (step) {
      case 0: {
        if (!state.jurisdictionKey) return false;
        if (state.companyType === "named") {
          if (!state.nameOptions.some((n) => n.trim())) return false;
        }
        if (state.companyType === "extra-provincial") {
          if (!state.homeJurisdiction || !state.existingCorpName.trim()) return false;
        }
        return true;
      }
      case 1: {
        const r = state.registeredAddress;
        if (!r.street || !r.city || !r.province || !r.postalCode) return false;
        if (!state.recordsSameAsRegistered) {
          const rc = state.recordsAddress;
          if (!rc.street || !rc.city || !rc.province || !rc.postalCode) return false;
        }
        return true;
      }
      case 2: {
        if (!state.directors.length) return false;
        for (const d of state.directors) {
          if (!d.fullName.trim() || !d.street || !d.city || !d.province || !d.postal) return false;
        }
        // Shareholder rows are optional, but if present must be valid
        for (const s of state.shareholders) {
          if (!s.fullName.trim() || !s.sharePercent.trim()) return false;
          if (isNaN(parseFloat(s.sharePercent))) return false;
        }
        // Incorporator required
        const inc = state.incorporator;
        if (!inc.fullName.trim() || !emailOk(inc.email) || !inc.phone.trim()) return false;
        if (inc.relationship === "Other" && !inc.relationshipOther.trim()) return false;
        return true;
      }
      case 3: {
        return !!state.natureOfBusiness.trim();
      }
      case 4: {
        return true;
      }
      default: return false;
    }
  }, [step, state]);

  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);

  const submit = async () => {
    setPayErr("");
    setPaying(true);
    try {
      const res = await fetch("/api/order/incorporation", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ form: state, src: attributionSrc }),
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

  /* ────────────────────────── Render ────────────────────────── */

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
          Incorporation · from ${PRICING.numbered.price} all-in + GST
        </span>
        <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", marginTop: "0.35rem", marginBottom: "0.5rem" }}>
          Incorporate your company
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Filed with the {state.jurisdictionKey ? (JURISDICTIONS.find((j) => j.key === state.jurisdictionKey)?.label ?? "chosen") : "chosen"} registry within 24 hours.
        </p>
      </div>

      {/* Step indicator */}
      <Stepper current={step} />

      {/* Step content */}
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.5rem", boxShadow: "var(--shadow)", marginBottom: "1rem" }}>
        {step === 0 && (
          <StepCompany
            state={state}
            patch={patch}
          />
        )}
        {step === 1 && (
          <StepAddresses
            state={state}
            patch={patch}
            patchAddr={patchAddr}
          />
        )}
        {step === 2 && (
          <StepPeople
            state={state}
            patch={patch}
            patchDirector={patchDirector}
            patchShareholder={patchShareholder}
            patchIncorporator={patchIncorporator}
          />
        )}
        {step === 3 && (
          <StepBusiness state={state} patch={patch} />
        )}
        {step === 4 && (
          <StepReview state={state} price={price} />
        )}
      </div>

      {payErr && (
        <div style={{ padding: "0.75rem 1rem", borderRadius: "0.5rem", background: "rgba(180,83,9,0.08)", color: "#B45309", fontSize: "0.85rem", marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
          <AlertCircle size={16} style={{ marginTop: "0.1rem", flexShrink: 0 }} />
          <span>{payErr}</span>
        </div>
      )}

      {/* Nav */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          style={{
            padding: "0.65rem 1rem",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            color: step === 0 ? "var(--text-muted)" : "var(--text)",
            fontWeight: 500,
            fontSize: "0.85rem",
            cursor: step === 0 ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
          }}
        >
          <ArrowLeft size={14} /> Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => canContinue && setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            disabled={!canContinue}
            style={{
              padding: "0.65rem 1.1rem",
              background: canContinue ? "var(--primary)" : "var(--border)",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "0.5rem",
              fontWeight: 700,
              fontSize: "0.9rem",
              cursor: canContinue ? "pointer" : "not-allowed",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
            }}
          >
            Continue <ArrowRight size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={paying}
            style={{
              padding: "0.7rem 1.25rem",
              background: "var(--primary)",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "0.5rem",
              fontWeight: 700,
              fontSize: "0.95rem",
              cursor: paying ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            {paying ? (
              <><Loader2 size={16} className="crs-spin" /> Redirecting…</>
            ) : (
              <>Pay ${price} + GST and file <ArrowRight size={16} /></>
            )}
          </button>
        )}
      </div>

      <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", textAlign: "center", marginTop: "0.75rem" }}>
        Card processed securely by Stripe. Filed with the government registry within 24 hours of payment.
      </p>
    </div>
  );
}

/* ────────────────────────── Sub-components ────────────────────────── */

function Stepper({ current }: { current: number }) {
  return (
    <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
      {STEPS.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div
            key={label}
            style={{
              flex: "1 1 100px",
              minWidth: "80px",
              padding: "0.5rem 0.6rem",
              borderRadius: "0.4rem",
              border: `1px solid ${active ? "var(--gold)" : "var(--border)"}`,
              background: done ? "var(--gold-dim)" : active ? "var(--gold-dim)" : "transparent",
              fontSize: "0.72rem",
              fontFamily: "var(--font-mono), monospace",
              textAlign: "center",
              color: active ? "var(--text)" : "var(--text-muted)",
              fontWeight: active ? 700 : 500,
            }}
          >
            {i + 1}. {label}
          </div>
        );
      })}
    </div>
  );
}

/* ── Step 0: Company basics ── */
function StepCompany({ state, patch }: { state: FormState; patch: (p: Partial<FormState>) => void }) {
  return (
    <div>
      <SectionHeading title="What are we incorporating?" subtitle="Pick the type that fits — the form adjusts to match." />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem", marginBottom: "1.25rem" }}>
        {(Object.keys(PRICING) as CompanyType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => patch({ companyType: t })}
            style={{
              padding: "0.85rem 0.9rem",
              textAlign: "left",
              border: `1.5px solid ${state.companyType === t ? "var(--gold)" : "var(--border)"}`,
              background: state.companyType === t ? "var(--gold-dim)" : "transparent",
              borderRadius: "0.5rem",
              cursor: "pointer",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text)" }}>{PRICING[t].label}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.15rem", lineHeight: 1.4 }}>{PRICING[t].blurb}</div>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--gold)", marginTop: "0.4rem" }}>${PRICING[t].price} all-in + GST</div>
          </button>
        ))}
      </div>

      <Field label="Jurisdiction" required>
        <select
          value={state.jurisdictionKey}
          onChange={(e) => patch({ jurisdictionKey: e.target.value })}
          style={inputStyle}
        >
          <option value="">Select…</option>
          {JURISDICTIONS.map((j) => (
            <option key={j.key} value={j.key}>{j.label}</option>
          ))}
        </select>
      </Field>

      {state.companyType === "named" && (
        <div style={{ marginTop: "0.75rem" }}>
          <SectionSubheading
            title="Three name options in your preferred order"
            subtitle="We'll run NUANS on your first choice; if it's already taken we try #2, then #3. This is the fastest path to approval."
          />
          {[0, 1, 2].map((i) => (
            <Field key={i} label={`Option ${i + 1}${i === 0 ? " (preferred)" : ""}`} required={i === 0}>
              <input
                type="text"
                value={state.nameOptions[i]}
                onChange={(e) => {
                  const next = [...state.nameOptions] as [string, string, string];
                  next[i] = e.target.value;
                  patch({ nameOptions: next });
                }}
                placeholder="e.g. Maple Holdings Inc."
                style={inputStyle}
              />
            </Field>
          ))}
        </div>
      )}

      {state.companyType === "extra-provincial" && (
        <div style={{ marginTop: "0.75rem" }}>
          <Field label="Existing corporation name" required>
            <input
              type="text"
              value={state.existingCorpName}
              onChange={(e) => patch({ existingCorpName: e.target.value })}
              placeholder="Legal name of the corporation you're registering"
              style={inputStyle}
            />
          </Field>
          <Field label="Home jurisdiction" required>
            <select
              value={state.homeJurisdiction}
              onChange={(e) => patch({ homeJurisdiction: e.target.value })}
              style={inputStyle}
            >
              <option value="">Select where it's currently incorporated…</option>
              {JURISDICTIONS.map((j) => (
                <option key={j.key} value={j.key}>{j.label}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
    </div>
  );
}

/* ── Step 1: Addresses ── */
function StepAddresses({
  state, patch, patchAddr,
}: {
  state: FormState;
  patch: (p: Partial<FormState>) => void;
  patchAddr: (key: "registeredAddress" | "recordsAddress", p: Partial<Address>) => void;
}) {
  return (
    <div>
      <SectionHeading
        title="Corporate addresses"
        subtitle="Where your corporation officially lives on paper. These go on the public registry."
      />

      <InfoNote>
        <strong>Registered address</strong> — the corporation&apos;s legal address on file with the government. Legal documents (lawsuits, tax notices) get delivered here. Must be a physical address in the jurisdiction of incorporation (no PO boxes for federal / most provinces).
      </InfoNote>

      <AddressBlock
        legend="Registered address"
        value={state.registeredAddress}
        onChange={(p) => patchAddr("registeredAddress", p)}
      />

      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1rem", fontSize: "0.88rem", color: "var(--text)", cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={state.recordsSameAsRegistered}
          onChange={(e) => {
            patch({ recordsSameAsRegistered: e.target.checked });
            if (e.target.checked) patch({ recordsAddress: { ...state.registeredAddress } });
          }}
        />
        Records address is the same as registered address
      </label>

      {!state.recordsSameAsRegistered && (
        <>
          <InfoNote>
            <strong>Records address</strong> — where the corporation keeps its official books (minute book, registers of directors and shareholders). Often the same as registered, but can differ (e.g. accountant&apos;s or lawyer&apos;s office).
          </InfoNote>
          <AddressBlock
            legend="Records address"
            value={state.recordsAddress}
            onChange={(p) => patchAddr("recordsAddress", p)}
          />
        </>
      )}
    </div>
  );
}

/* ── Step 2: People ── */
function StepPeople({
  state, patch, patchDirector, patchShareholder, patchIncorporator,
}: {
  state: FormState;
  patch: (p: Partial<FormState>) => void;
  patchDirector: (i: number, p: Partial<Person>) => void;
  patchShareholder: (i: number, p: Partial<Shareholder>) => void;
  patchIncorporator: (p: Partial<Incorporator>) => void;
}) {
  return (
    <div>
      <SectionHeading title="Who is involved?" subtitle="At least one director is required. Shareholders can be added now or during your first year's tax filing." />

      <SectionSubheading title="Directors" subtitle="Legal decision-makers of the corporation. Must be at least 18, not bankrupt. Some jurisdictions require Canadian residency — we'll flag if there's an issue." />

      {state.directors.map((d, i) => (
        <PersonCard
          key={i}
          title={`Director ${i + 1}`}
          value={d}
          onChange={(p) => patchDirector(i, p)}
          onRemove={state.directors.length > 1 ? () => patch({ directors: state.directors.filter((_, ix) => ix !== i) }) : undefined}
        />
      ))}
      <AddRow
        label="Add another director"
        onClick={() => patch({ directors: [...state.directors, emptyPerson()] })}
      />

      <div style={{ marginTop: "1.5rem" }}>
        <SectionSubheading
          title="Shareholders (optional)"
          subtitle="Not required at incorporation. If you leave this blank, the incorporator is issued the initial share. Details are reconciled during your first tax filing."
        />

        {state.shareholders.map((sh, i) => (
          <PersonCard
            key={i}
            title={`Shareholder ${i + 1}`}
            value={sh}
            extra={
              <Field label="Share percentage" required>
                <input
                  type="text"
                  value={sh.sharePercent}
                  onChange={(e) => patchShareholder(i, { sharePercent: e.target.value })}
                  placeholder="e.g. 50"
                  style={inputStyle}
                />
              </Field>
            }
            onChange={(p) => patchShareholder(i, p)}
            onRemove={() => patch({ shareholders: state.shareholders.filter((_, ix) => ix !== i) })}
          />
        ))}
        <AddRow
          label={state.shareholders.length === 0 ? "Add a shareholder" : "Add another shareholder"}
          onClick={() => patch({ shareholders: [...state.shareholders, emptyShareholder()] })}
        />
      </div>

      <div style={{ marginTop: "1.5rem" }}>
        <SectionSubheading
          title="Incorporator (this is who we contact)"
          subtitle="The person filing on behalf of the corporation. This is also our primary contact for questions and delivery."
        />
        <Field label="Full legal name" required>
          <input
            type="text"
            value={state.incorporator.fullName}
            onChange={(e) => patchIncorporator({ fullName: e.target.value })}
            placeholder="Jane Doe"
            style={inputStyle}
          />
        </Field>
        <div style={twoCol}>
          <Field label="Email" required>
            <input
              type="email"
              value={state.incorporator.email}
              onChange={(e) => patchIncorporator({ email: e.target.value })}
              placeholder="jane@company.ca"
              style={inputStyle}
            />
          </Field>
          <Field label="Phone" required>
            <input
              type="tel"
              value={state.incorporator.phone}
              onChange={(e) => patchIncorporator({ phone: e.target.value })}
              placeholder="(403) 555-0123"
              style={inputStyle}
            />
          </Field>
        </div>
        <Field label="Relationship to the corporation" required>
          <select
            value={state.incorporator.relationship}
            onChange={(e) => patchIncorporator({ relationship: e.target.value as Relationship })}
            style={inputStyle}
          >
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>
        {state.incorporator.relationship === "Other" && (
          <Field label="Please specify" required>
            <input
              type="text"
              value={state.incorporator.relationshipOther}
              onChange={(e) => patchIncorporator({ relationshipOther: e.target.value })}
              placeholder="e.g. Shareholder, family member…"
              style={inputStyle}
            />
          </Field>
        )}
      </div>
    </div>
  );
}

/* ── Step 3: Business nature ── */
function StepBusiness({ state, patch }: { state: FormState; patch: (p: Partial<FormState>) => void }) {
  return (
    <div>
      <SectionHeading title="Business details" subtitle="A short description of what the corporation actually does." />
      <Field label="Nature of business" required>
        <textarea
          value={state.natureOfBusiness}
          onChange={(e) => patch({ natureOfBusiness: e.target.value })}
          rows={4}
          placeholder="e.g. Real-estate holding company. Software consulting. Retail sale of specialty coffee. General investment activities."
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      </Field>

      <div style={twoCol}>
        <Field label="Fiscal year end (optional)">
          <input
            type="text"
            value={state.fiscalYearEnd}
            onChange={(e) => patch({ fiscalYearEnd: e.target.value })}
            placeholder="MM-DD, e.g. 12-31"
            style={inputStyle}
          />
        </Field>
      </div>

      <Field label="Restrictions on business (optional)">
        <textarea
          value={state.restrictions}
          onChange={(e) => patch({ restrictions: e.target.value })}
          rows={2}
          placeholder="e.g. Restricted to activities described above. Restricted from banking, insurance…"
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      </Field>
    </div>
  );
}

/* ── Step 4: Review ── */
function StepReview({ state, price }: { state: FormState; price: number }) {
  const cfg = PRICING[state.companyType];
  const jur = JURISDICTIONS.find((j) => j.key === state.jurisdictionKey);
  return (
    <div>
      <SectionHeading title="Review & pay" subtitle="Confirm everything looks right — then we file within 24 hours of payment." />

      <ReviewRow label="Type"          value={cfg.label} />
      <ReviewRow label="Jurisdiction"  value={jur?.label ?? "—"} />
      {state.companyType === "named" && (
        <ReviewRow label="Name options" value={state.nameOptions.filter((n) => n.trim()).join(" · ") || "—"} />
      )}
      {state.companyType === "extra-provincial" && (
        <>
          <ReviewRow label="Existing name"     value={state.existingCorpName} />
          <ReviewRow label="Home jurisdiction" value={JURISDICTIONS.find((j) => j.key === state.homeJurisdiction)?.label ?? "—"} />
        </>
      )}
      <ReviewRow label="Registered address"    value={fmtAddr(state.registeredAddress)} />
      <ReviewRow label="Records address"       value={state.recordsSameAsRegistered ? "Same as registered" : fmtAddr(state.recordsAddress)} />
      <ReviewRow label={`Directors (${state.directors.length})`} value={state.directors.map((d) => d.fullName).join(", ") || "—"} />
      <ReviewRow label={`Shareholders (${state.shareholders.length})`} value={state.shareholders.length ? state.shareholders.map((s) => `${s.fullName} (${s.sharePercent}%)`).join(", ") : "Deferred to first year"} />
      <ReviewRow label="Incorporator"          value={`${state.incorporator.fullName} · ${state.incorporator.relationship === "Other" ? state.incorporator.relationshipOther : state.incorporator.relationship}`} />
      <ReviewRow label="Nature of business"    value={state.natureOfBusiness} />

      <div style={{ marginTop: "1.25rem", padding: "1rem 1.25rem", background: "var(--gold-dim)", borderRadius: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontWeight: 700, color: "var(--text)" }}>Total</span>
        <span style={{ fontWeight: 800, color: "var(--text)", fontSize: "1.05rem" }}>${price} + GST</span>
      </div>
    </div>
  );
}

function fmtAddr(a: Address) {
  const line = [a.street, a.city, a.province, a.postalCode].filter(Boolean).join(", ");
  return line || "—";
}

/* ────────────────────────── Small UI atoms ────────────────────────── */

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.15rem", fontWeight: 700, color: "var(--text)" }}>{title}</div>
      {subtitle && <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0.2rem 0 0" }}>{subtitle}</p>}
    </div>
  );
}

function SectionSubheading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ marginTop: "0.5rem", marginBottom: "0.75rem" }}>
      <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)" }}>{title}</div>
      {subtitle && <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.15rem 0 0", lineHeight: 1.45 }}>{subtitle}</p>}
    </div>
  );
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.25rem" }}>
        {label}{required && <span style={{ color: "#B45309", marginLeft: "0.2rem" }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", gap: "0.5rem", alignItems: "flex-start",
      padding: "0.7rem 0.85rem",
      background: "var(--bg-deep)",
      border: "1px solid var(--border)",
      borderRadius: "0.4rem",
      fontSize: "0.78rem",
      color: "var(--text-muted)",
      lineHeight: 1.5,
      marginBottom: "0.75rem",
    }}>
      <Info size={14} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.15rem" }} />
      <div>{children}</div>
    </div>
  );
}

function AddressBlock({ legend, value, onChange }: { legend: string; value: Address; onChange: (p: Partial<Address>) => void }) {
  const applyPlace = (p: ParsedAddress) => {
    onChange({
      street:     p.street     || value.street,
      city:       p.city       || value.city,
      province:   p.province   || value.province,
      postalCode: p.postalCode || value.postalCode,
      country:    p.country    || value.country,
    });
  };
  return (
    <div style={{ padding: "0.9rem 1rem", border: "1px solid var(--border)", borderRadius: "0.5rem", marginTop: "0.5rem" }}>
      <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text)", marginBottom: "0.6rem" }}>{legend}</div>
      <Field label="Street" required>
        <PlacesInput
          value={value.street}
          onChange={(e) => onChange({ street: e.target.value })}
          onPlaceSelected={applyPlace}
          style={inputStyle}
          placeholder="Start typing an address…"
        />
      </Field>
      <div style={twoCol}>
        <Field label="City" required>
          <input type="text" value={value.city}     onChange={(e) => onChange({ city:       e.target.value })} style={inputStyle} placeholder="Calgary" />
        </Field>
        <Field label="Province/Territory" required>
          <input type="text" value={value.province} onChange={(e) => onChange({ province:   e.target.value })} style={inputStyle} placeholder="AB" />
        </Field>
      </div>
      <div style={twoCol}>
        <Field label="Postal code" required>
          <input type="text" value={value.postalCode} onChange={(e) => onChange({ postalCode: e.target.value })} style={inputStyle} placeholder="T2P 1J9" />
        </Field>
        <Field label="Country">
          <input type="text" value={value.country}    onChange={(e) => onChange({ country:    e.target.value })} style={inputStyle} placeholder="Canada" />
        </Field>
      </div>
    </div>
  );
}

function PersonCard({
  title, value, onChange, onRemove, extra,
}: {
  title: string;
  value: Person;
  onChange: (p: Partial<Person>) => void;
  onRemove?: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div style={{ padding: "0.9rem 1rem", border: "1px solid var(--border)", borderRadius: "0.5rem", marginBottom: "0.6rem", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
        <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text)" }}>{title}</div>
        {onRemove && (
          <button type="button" onClick={onRemove} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem" }}>
            <Trash2 size={13} /> Remove
          </button>
        )}
      </div>
      <Field label="Full legal name" required>
        <input type="text" value={value.fullName} onChange={(e) => onChange({ fullName: e.target.value })} style={inputStyle} placeholder="Jane Doe" />
      </Field>
      <Field label="Street" required>
        <PlacesInput
          value={value.street}
          onChange={(e) => onChange({ street: e.target.value })}
          onPlaceSelected={(p) => onChange({
            street:   p.street   || value.street,
            city:     p.city     || value.city,
            province: p.province || value.province,
            postal:   p.postalCode || value.postal,
            country:  p.country  || value.country,
          })}
          style={inputStyle}
          placeholder="Start typing an address…"
        />
      </Field>
      <div style={twoCol}>
        <Field label="City" required>
          <input type="text" value={value.city} onChange={(e) => onChange({ city: e.target.value })} style={inputStyle} placeholder="Calgary" />
        </Field>
        <Field label="Province/Territory" required>
          <input type="text" value={value.province} onChange={(e) => onChange({ province: e.target.value })} style={inputStyle} placeholder="AB" />
        </Field>
      </div>
      <div style={twoCol}>
        <Field label="Postal code" required>
          <input type="text" value={value.postal} onChange={(e) => onChange({ postal: e.target.value })} style={inputStyle} placeholder="T2P 1J9" />
        </Field>
        <Field label="Country">
          <input type="text" value={value.country} onChange={(e) => onChange({ country: e.target.value })} style={inputStyle} placeholder="Canada" />
        </Field>
      </div>
      <div style={twoCol}>
        <Field label="Email (optional)">
          <input type="email" value={value.email} onChange={(e) => onChange({ email: e.target.value })} style={inputStyle} placeholder="name@company.ca" />
        </Field>
        <Field label="Phone (optional)">
          <input type="tel" value={value.phone} onChange={(e) => onChange({ phone: e.target.value })} style={inputStyle} placeholder="(403) 555-0123" />
        </Field>
      </div>
      {extra}
    </div>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        marginTop: "0.5rem",
        padding: "0.5rem 0.85rem",
        border: "1.5px dashed var(--border)",
        borderRadius: "0.4rem",
        background: "transparent",
        color: "var(--text-muted)",
        fontSize: "0.82rem",
        fontWeight: 500,
        cursor: "pointer",
      }}
    >
      <Plus size={13} /> {label}
    </button>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "1rem", padding: "0.5rem 0", borderBottom: "1px solid var(--border)", alignItems: "start" }}>
      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: "0.85rem", color: "var(--text)", wordBreak: "break-word" }}>{value}</div>
    </div>
  );
}

/* ────────────────────────── Shared styles ────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.75rem",
  border: "1px solid var(--border)",
  borderRadius: "0.4rem",
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: "0.88rem",
};

const twoCol: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.65rem",
};
