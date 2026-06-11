"use client";

import { useSearchParams } from "next/navigation";
import { CheckCircle2, Mail, ArrowLeft } from "lucide-react";

export default function ThanksContent() {
  const params = useSearchParams();
  const ref = params.get("ref") ?? "—";

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          maxWidth: "480px",
          width: "100%",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "1rem",
          padding: "2.5rem 2rem",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "3.5rem",
            height: "3.5rem",
            borderRadius: "50%",
            background: "var(--gold-dim)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
          }}
        >
          <CheckCircle2 size={28} style={{ color: "var(--gold)" }} />
        </div>

        <h1
          style={{
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "var(--text)",
            marginBottom: "0.5rem",
          }}
        >
          Request received!
        </h1>

        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", marginBottom: "1.5rem", lineHeight: 1.6 }}>
          Thank you for your order. We&apos;ll review your request and send a custom quote within 1 hour.
        </p>

        <div
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            padding: "0.75rem 1rem",
            marginBottom: "1.75rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Reference
          </span>
          <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.875rem", fontWeight: 600, color: "var(--gold)" }}>
            {ref}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.625rem",
            background: "var(--gold-dim)",
            borderRadius: "0.5rem",
            padding: "0.75rem",
            marginBottom: "2rem",
            textAlign: "left",
          }}
        >
          <Mail size={16} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.1rem" }} />
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
            A confirmation has been sent to your email. Check your spam folder if you don&apos;t see it.
          </p>
        </div>

        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
            padding: "0.625rem 1.25rem",
            borderRadius: "0.5rem",
            border: "1.5px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text-muted)",
            fontSize: "0.85rem",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={14} /> Back to home
        </a>
      </div>
    </div>
  );
}
