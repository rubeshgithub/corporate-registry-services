"use client";

import { useState } from "react";
import { Search, CheckCircle2, AlertCircle, Loader2, Mail } from "lucide-react";

type Summary = {
  status:       "paid" | "unpaid" | "unknown";
  company:      string;
  jurisdiction: string;
  amount:       string;
};

export default function StatusLookup() {
  const [ref, setRef]         = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<Summary | null>(null);
  const [err, setErr]         = useState("");

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const id = ref.trim();
    if (!id.startsWith("cs_")) {
      setErr("That doesn't look like a reference number. It should start with cs_ — check your confirmation email.");
      return;
    }
    setErr("");
    setResult(null);
    setLoading(true);
    try {
      const res  = await fetch(`/api/order/session?id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed.");
      setResult(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Lookup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 620, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div
          style={{
            fontFamily: "var(--font-mono), monospace",
            fontSize: "0.7rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--gold)",
            marginBottom: "0.35rem",
          }}
        >
          Order lookup
        </div>
        <h1
          style={{
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: "1.75rem",
            fontWeight: 700,
            color: "var(--text)",
            margin: "0 0 0.5rem",
          }}
        >
          Check the status of your CRS order
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.92rem", lineHeight: 1.55, margin: 0 }}>
          Enter the reference number from your confirmation email to see whether your payment
          was received and your filing is in progress.
        </p>
      </div>

      {/* Form card */}
      <div
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          padding: "1.75rem",
          boxShadow: "var(--shadow-card)",
          marginBottom: "1.25rem",
        }}
      >
        <form onSubmit={lookup}>
          <label
            htmlFor="ref"
            style={{
              display: "block",
              fontSize: "0.72rem",
              fontFamily: "var(--font-mono), monospace",
              fontWeight: 600,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              marginBottom: "0.4rem",
            }}
          >
            Reference number
          </label>
          <div style={{ position: "relative" }}>
            <input
              id="ref"
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="cs_test_a1B2c3D4…"
              autoComplete="off"
              className="field-input"
              style={{ paddingRight: "6.5rem", fontFamily: "var(--font-mono), monospace" }}
            />
            <button
              type="submit"
              disabled={loading || !ref.trim()}
              className="btn-primary"
              style={{
                position: "absolute",
                right: "0.375rem",
                top: "50%",
                transform: "translateY(-50%)",
                height: "2.25rem",
                fontSize: "0.82rem",
              }}
            >
              {loading ? <Loader2 size={14} className="crs-spin" /> : <Search size={14} />}
              {loading ? "Checking…" : "Check"}
            </button>
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "0.6rem 0 0", lineHeight: 1.55 }}>
            Look for a line like <span style={{ fontFamily: "var(--font-mono), monospace", color: "var(--text)" }}>Reference: cs_test_…</span> in the payment confirmation email we sent you.
          </p>
        </form>

        {err && (
          <div
            role="alert"
            style={{
              marginTop: "1rem",
              padding: "0.6rem 0.85rem",
              background: "rgba(180,83,9,0.08)",
              color: "#B45309",
              fontSize: "0.82rem",
              borderRadius: "0.4rem",
              display: "flex",
              gap: "0.4rem",
              alignItems: "flex-start",
            }}
          >
            <AlertCircle size={14} style={{ marginTop: "0.1rem", flexShrink: 0 }} />
            <span>{err}</span>
          </div>
        )}
      </div>

      {/* Result */}
      {result && <ResultPanel summary={result} refId={ref.trim()} />}

      {/* Fallback help */}
      <div
        style={{
          marginTop: "1.5rem",
          padding: "1.25rem 1.5rem",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)",
          display: "flex",
          gap: "0.75rem",
          alignItems: "flex-start",
        }}
      >
        <Mail size={16} style={{ color: "var(--gold)", marginTop: "0.15rem", flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.15rem" }}>
            Can&apos;t find your reference number?
          </div>
          <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.55 }}>
            Email <a href="mailto:support@corporateregistryservices.ca" style={{ color: "var(--secondary)" }}>support@corporateregistryservices.ca</a>{" "}
            with the email address you used at checkout and we&apos;ll pull it up for you within
            one business hour.
          </p>
        </div>
      </div>
    </div>
  );
}

function ResultPanel({ summary, refId }: { summary: Summary; refId: string }) {
  const paid = summary.status === "paid";
  return (
    <div
      style={{
        background: "var(--card)",
        border: `1px solid ${paid ? "var(--secondary)" : "var(--border)"}`,
        borderLeft: `3px solid ${paid ? "var(--secondary)" : "var(--gold)"}`,
        borderRadius: "var(--radius-card)",
        padding: "1.5rem 1.75rem",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <CheckCircle2 size={18} style={{ color: paid ? "var(--secondary)" : "var(--gold)" }} />
        <span
          className="card-heading"
          style={{ fontSize: "1.15rem" }}
        >
          {paid ? "Payment received — filing in progress" : "Payment not yet received"}
        </span>
        <StatusPill status={summary.status} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: "0.75rem 1.5rem",
          marginBottom: "1rem",
        }}
      >
        <MetaRow label="Reference"    value={refId} mono />
        <MetaRow label="Amount"       value={summary.amount || "—"} />
        <MetaRow label="Company"      value={summary.company || "—"} />
        <MetaRow label="Jurisdiction" value={summary.jurisdiction || "—"} />
      </div>

      <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.55 }}>
        {paid
          ? "Our team files with the registry within 24 hours of payment. You'll receive a filing confirmation email once it's complete. If it's been more than a business day, reply to your confirmation email and we'll check in."
          : "If you were charged but this still says unpaid, Stripe may still be processing. Wait a few minutes and try again — or contact support and we'll investigate."}
      </p>
    </div>
  );
}

function StatusPill({ status }: { status: Summary["status"] }) {
  const paid   = status === "paid";
  return (
    <span
      style={{
        fontSize: "0.68rem",
        fontWeight: 700,
        padding: "0.2rem 0.55rem",
        borderRadius: "9999px",
        fontFamily: "var(--font-mono), monospace",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        background: paid ? "rgba(42,125,143,0.1)" : "var(--gold-dim)",
        color: paid ? "var(--secondary)" : "var(--gold)",
        border: `1px solid ${paid ? "var(--secondary)" : "var(--gold)"}`,
      }}
    >
      {status}
    </span>
  );
}

function MetaRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontFamily: "var(--font-mono), monospace",
          fontSize: "0.68rem",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
          marginBottom: "0.2rem",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: mono ? "0.8rem" : "0.9rem",
          fontFamily: mono ? "var(--font-mono), monospace" : "inherit",
          fontWeight: 600,
          color: "var(--text)",
          wordBreak: "break-all",
        }}
      >
        {value}
      </div>
    </div>
  );
}
