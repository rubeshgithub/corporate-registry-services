"use client";

import type { WizardState } from "@/lib/wizard-types";
import type { ServiceBucket } from "@/lib/service-config";
import { JURISDICTIONS } from "@/lib/service-config";

type Props = {
  state: WizardState;
  bucket: ServiceBucket;
  onTermsChange: (v: boolean) => void;
  submitting: boolean;
};

export default function StepReview({ state, bucket, onTermsChange, submitting }: Props) {
  const selectedServices = bucket.services.filter((s) =>
    state.serviceKeys.includes(s.key)
  );
  const jurisdiction = JURISDICTIONS.find((j) => j.key === state.jurisdictionKey);

  /* Multi-year annual-return catch-up is billed per year — the wizard
     collects the count in details.yearsOwing. */
  const qtyFor = (key: string) => {
    if (key !== "annual-return-multiple") return 1;
    const n = parseInt(state.details.yearsOwing ?? "", 10);
    return Number.isFinite(n) && n >= 2 && n <= 10 ? n : 2;
  };

  /* Every selected service must be directly purchasable for this to be a
     checkout rather than a quote — one that isn't (not-for-profit routes to
     a consultation) sends the whole basket down the quote path, so the copy
     has to follow suit. */
  const priced      = selectedServices.map((s) => ({ svc: s, qty: qtyFor(s.key) }));
  const allPurchasable = priced.every(({ svc }) => typeof svc.priceCents === "number");
  const totalCents  = allPurchasable
    ? priced.reduce((sum, { svc, qty }) => sum + (svc.priceCents ?? 0) * qty, 0)
    : 0;
  const fmt = (c: number) => `$${(c / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div className="step-enter">
      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Step 5 of 5 — Review
      </p>
      <h2 className="card-heading" style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>
        Review your order
      </h2>
      <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
        {allPurchasable
          ? "Pay securely and we start straight away — no waiting on a quote."
          : "One of your selections needs a specialist, so we'll send a custom quote within 1 hour."}
      </p>

      {/* Summary box */}
      <div style={{ borderRadius: "0.625rem", border: "1px solid var(--border)", background: "var(--bg)", padding: "0.875rem", marginBottom: "1rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        <ReviewRow label="Category" value={bucket.label} />
        {jurisdiction && <ReviewRow label="Jurisdiction" value={jurisdiction.label} />}
        <ReviewRow
          label="Services"
          value={selectedServices.map((s) => s.label).join(", ")}
        />
        {Object.entries(state.details).length > 0 && (
          <ReviewRow
            label="Details"
            value={Object.entries(state.details)
              .filter(([, v]) => v)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          />
        )}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.625rem", marginTop: "0.125rem" }} />
        <ReviewRow label="Name" value={state.customer.fullName} />
        <ReviewRow label="Email" value={state.customer.email} />
        <ReviewRow label="Phone" value={state.customer.phone} />
        {state.customer.company && <ReviewRow label="Company" value={state.customer.company} />}
        <ReviewRow label="Contact via" value={state.customer.preferredContact} />
      </div>

      {allPurchasable && (
        <div style={{ borderRadius: "0.625rem", border: "1px solid var(--gold)", background: "var(--gold-dim)", padding: "0.875rem", marginBottom: "1rem" }}>
          {priced.map(({ svc, qty }) => (
            <div key={svc.key} style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", fontSize: "0.82rem", color: "var(--text)", marginBottom: "0.35rem" }}>
              <span>{svc.label}{qty > 1 ? ` × ${qty}` : ""}</span>
              <span style={{ fontFamily: "var(--font-mono), monospace", whiteSpace: "nowrap" }}>
                {fmt((svc.priceCents ?? 0) * qty)}
              </span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.12)", marginTop: "0.5rem", paddingTop: "0.5rem", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "0.9rem", color: "var(--text)" }}>
            <span>Total</span>
            <span style={{ fontFamily: "var(--font-mono), monospace" }}>{fmt(totalCents)} + GST</span>
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
            All government fees included. GST calculated at checkout.
          </div>
        </div>
      )}

      {/* Terms */}
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.625rem",
          cursor: "pointer",
          fontSize: "0.78rem",
          color: "var(--text-muted)",
          lineHeight: 1.5,
        }}
      >
        <input
          type="checkbox"
          checked={state.consents.terms}
          onChange={(e) => onTermsChange(e.target.checked)}
          style={{ marginTop: "0.15rem", accentColor: "var(--gold)", flexShrink: 0 }}
        />
        I agree to CRS&apos;s{" "}
        <a href="/terms" style={{ color: "var(--gold)", textDecoration: "none" }}>
          Terms of Service
        </a>{" "}
        and understand this is a request for a quote, not a completed purchase.
      </label>

      {submitting && (
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.75rem", textAlign: "center" }}>
          Sending your request…
        </p>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
      <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", width: "5rem", flexShrink: 0, paddingTop: "0.1rem" }}>
        {label}
      </span>
      <span style={{ fontSize: "0.82rem", color: "var(--text)", lineHeight: 1.4 }}>{value}</span>
    </div>
  );
}
