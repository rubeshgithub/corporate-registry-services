import { ArrowRight, CalendarCheck, CheckCircle2 } from "lucide-react";

/**
 * High-visibility CTA card for the /not-for-profit and /nfp-grants clusters.
 * Slots in just below the H1 on every long-form NFP page — pillar and
 * jurisdiction alike. The article body is a long read (2,500+ words on
 * average), and without a pinned CTA the free consultation gets buried.
 *
 * Deliberately larger and more decorated than the [section]/page.tsx
 * orderStrip: this is a lead-gen page, not a paid-order landing, so the
 * consultation *is* the primary action.
 */

export default function NfpConsultationCTA({
  src,
}: {
  /** Attribution — set to the page's slug so we can trace lead source in Mongo. */
  src: string;
}) {
  const href = `/not-for-profit/book-free-consultation?src=${encodeURIComponent(src)}`;

  return (
    <aside
      style={{
        margin: "1.5rem 0 2rem",
        padding: "1.35rem 1.5rem",
        background: "linear-gradient(135deg, var(--card) 0%, var(--bg-deep) 100%)",
        border: "1px solid var(--border)",
        borderLeft: "5px solid var(--gold)",
        borderRadius: "0.6rem",
        boxShadow: "0 4px 14px rgba(0,61,91,0.06)",
        display: "flex",
        flexWrap: "wrap",
        gap: "1.15rem",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ minWidth: 0, flex: "2 1 320px" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)", marginBottom: "0.35rem", fontWeight: 700 }}>
          <CalendarCheck size={13} /> Free 30-min consultation · No obligation
        </div>
        <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.2rem", fontWeight: 700, color: "var(--text)", lineHeight: 1.3, marginBottom: "0.5rem" }}>
          Skip the paperwork — get an incorporation specialist on the call.
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: "0.35rem 1.1rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
          <li style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <CheckCircle2 size={13} style={{ color: "#16A34A", flexShrink: 0 }} /> Your 3 names pre-screened
          </li>
          <li style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <CheckCircle2 size={13} style={{ color: "#16A34A", flexShrink: 0 }} /> Board checked against your registry
          </li>
          <li style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
            <CheckCircle2 size={13} style={{ color: "#16A34A", flexShrink: 0 }} /> Written filing checklist to keep
          </li>
        </ul>
      </div>
      <a
        href={href}
        style={{
          flex: "0 0 auto",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.45rem",
          padding: "0.8rem 1.35rem",
          background: "var(--primary)",
          color: "#FFFFFF",
          fontWeight: 700,
          fontSize: "0.95rem",
          textDecoration: "none",
          borderRadius: "0.5rem",
          boxShadow: "0 4px 12px rgba(0,61,91,0.18)",
          whiteSpace: "nowrap",
        }}
      >
        Book free consultation <ArrowRight size={15} />
      </a>
    </aside>
  );
}
