"use client";

/**
 * A plain Yes / No pair for order-form questions ("Has anything changed?",
 * "Do you have the company password?"). `value` null = not answered yet:
 * neither button is lit, and the form treats it as the safe default.
 */
export default function YesNo({
  value, onChange, name,
}: {
  value:    boolean | null;
  onChange: (v: boolean) => void;
  name:     string;
}) {
  const btn = (on: boolean): React.CSSProperties => ({
    minWidth: 76,
    minHeight: 40,
    padding: "0.45rem 1.1rem",
    borderRadius: "0.5rem",
    border: `1.5px solid ${on ? "var(--gold)" : "var(--border)"}`,
    background: on ? "var(--gold-dim)" : "var(--bg)",
    color: "var(--text)",
    fontWeight: on ? 700 : 500,
    fontSize: "0.88rem",
    cursor: "pointer",
  });
  return (
    <div role="radiogroup" aria-label={name} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      <button type="button" role="radio" aria-checked={value === true} onClick={() => onChange(true)} style={btn(value === true)}>Yes</button>
      <button type="button" role="radio" aria-checked={value === false} onClick={() => onChange(false)} style={btn(value === false)}>No</button>
    </div>
  );
}
