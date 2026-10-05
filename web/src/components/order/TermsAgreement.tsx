"use client";

/**
 * "I agree to the Terms and Conditions" — required before any checkout's pay
 * button works (owner, Sep 2026). Links open in a new tab so the order form
 * keeps what was typed. Unticked by default: agreement has to be given.
 */
export default function TermsAgreement({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      style={{
        display: "flex", gap: "0.55rem", alignItems: "flex-start", margin: "0 0 0.75rem",
        fontSize: "0.82rem", color: "var(--text)", lineHeight: 1.5, cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: "0.2rem", width: 16, height: 16, flexShrink: 0, accentColor: "var(--primary)" }}
        aria-describedby="crs-terms-note"
      />
      <span id="crs-terms-note">
        I agree to the{" "}
        <a href="/terms" target="_blank" rel="noopener" style={{ color: "var(--primary)", textDecoration: "underline" }}>Terms and Conditions</a>
        {" "}and{" "}
        <a href="/privacy" target="_blank" rel="noopener" style={{ color: "var(--primary)", textDecoration: "underline" }}>Privacy Policy</a>
        , including the{" "}
        <a href="/terms#refunds" target="_blank" rel="noopener" style={{ color: "var(--primary)", textDecoration: "underline" }}>refund policy</a>
        . Corporate Registry Services is an independent filing agent, not a government office; government fees are included in the price.
      </span>
    </label>
  );
}
