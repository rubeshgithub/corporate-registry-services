"use client";

import type { WizardState } from "@/lib/wizard-types";

type CustomerState = WizardState["customer"];

type Props = {
  customer: CustomerState;
  onChange: (field: keyof CustomerState, value: string) => void;
};

export default function StepContact({ customer, onChange }: Props) {
  return (
    <div className="step-enter">
      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Step 4 of 5 — Your info
      </p>
      <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.25rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.25rem" }}>
        How do we reach you?
      </h2>
      <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
        We&apos;ll send your quote and updates here.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div>
          <label className="field-label">Full name <span style={{ color: "var(--gold)" }}>*</span></label>
          <input
            type="text"
            className="field-input"
            placeholder="Jane Smith"
            value={customer.fullName}
            onChange={(e) => onChange("fullName", e.target.value)}
          />
        </div>

        <div>
          <label className="field-label">Email <span style={{ color: "var(--gold)" }}>*</span></label>
          <input
            type="email"
            className="field-input"
            placeholder="jane@example.com"
            value={customer.email}
            onChange={(e) => onChange("email", e.target.value)}
          />
        </div>

        <div>
          <label className="field-label">Phone <span style={{ color: "var(--gold)" }}>*</span></label>
          <input
            type="tel"
            className="field-input"
            placeholder="+1 (416) 555-0100"
            value={customer.phone}
            onChange={(e) => onChange("phone", e.target.value)}
          />
        </div>

        <div>
          <label className="field-label">Company name <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span></label>
          <input
            type="text"
            className="field-input"
            placeholder="Your company"
            value={customer.company ?? ""}
            onChange={(e) => onChange("company", e.target.value)}
          />
        </div>

        <div>
          <label className="field-label">Preferred contact method</label>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
            {(["Email", "Phone", "Either"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => onChange("preferredContact", opt)}
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  borderRadius: "0.5rem",
                  border: `1.5px solid ${customer.preferredContact === opt ? "var(--gold)" : "var(--border)"}`,
                  background: customer.preferredContact === opt ? "var(--gold-dim)" : "var(--bg)",
                  color: customer.preferredContact === opt ? "var(--gold)" : "var(--text-muted)",
                  fontSize: "0.78rem",
                  fontWeight: customer.preferredContact === opt ? 600 : 400,
                  cursor: "pointer",
                  transition: "border-color 0.15s, background 0.15s, color 0.15s",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
