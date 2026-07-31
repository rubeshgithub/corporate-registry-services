"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Mail, ArrowLeft, Clock } from "lucide-react";
import { gaEvent, gaPurchaseOnce } from "@/lib/ga";

type SessionSummary = {
  status:      "paid" | "unpaid" | "unknown";
  company:     string;
  jurisdiction: string;
  amount:      string;
  service:     string;
  value:       number;
  currency:    string;
};

export default function ThanksContent() {
  const params    = useSearchParams();
  const ref       = params.get("ref");
  const sessionId = params.get("session_id");

  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [loading, setLoading] = useState(!!sessionId);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      try {
        const res = await fetch(`/api/order/session?id=${encodeURIComponent(sessionId)}`);
        if (res.ok) setSummary(await res.json());
      } catch {
        // fall through — page still shows a generic thank-you
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId]);

  // GA4 conversion tracking. Paid Stripe session → purchase (deduped per
  // session); quote-style request without a checkout session → generate_lead.
  useEffect(() => {
    if (sessionId && summary?.status === "paid") {
      gaPurchaseOnce({
        sessionId,
        value: summary.value,
        currency: summary.currency,
        service: summary.service,
      });
    }
  }, [sessionId, summary]);

  useEffect(() => {
    if (!sessionId && ref) {
      gaEvent("generate_lead", { method: "order_request", reference: ref });
    }
  }, [sessionId, ref]);

  const paid = summary?.status === "paid";

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
          maxWidth: "520px",
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
          {paid ? "Payment received — filing now" : sessionId ? "Confirming your payment…" : "Request received!"}
        </h1>

        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.25rem", lineHeight: 1.6 }}>
          {paid
            ? `We're filing ${summary?.company ? summary.company : "your annual return"} with the ${summary?.jurisdiction ?? "registry"} now. You'll get a filing confirmation by email within 24 hours.`
            : sessionId
              ? "Give us a moment — we're checking with Stripe."
              : "Thank you for your order. We'll review your request and send a custom quote within 1 hour."}
        </p>

        {/* Reference / session id */}
        {(ref || sessionId) && (
          <div
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "0.5rem",
              padding: "0.75rem 1rem",
              marginBottom: "1.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
            }}
          >
            <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {ref ? "Reference" : "Session"}
            </span>
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.78rem", fontWeight: 600, color: "var(--gold)", wordBreak: "break-all", textAlign: "right" }}>
              {ref ?? sessionId}
            </span>
          </div>
        )}

        {/* Retention hook — recurring annual return reminder */}
        {paid && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.625rem",
              background: "var(--gold-dim)",
              borderRadius: "0.5rem",
              padding: "0.75rem",
              marginBottom: "1.5rem",
              textAlign: "left",
            }}
          >
            <Clock size={16} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.1rem" }} />
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
              We&apos;ll email you 30 days before next year&apos;s anniversary — no more scrambling to remember the deadline.
            </p>
          </div>
        )}

        {!paid && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.625rem",
              background: "var(--gold-dim)",
              borderRadius: "0.5rem",
              padding: "0.75rem",
              marginBottom: "1.75rem",
              textAlign: "left",
            }}
          >
            <Mail size={16} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.1rem" }} />
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
              A confirmation has been sent to your email. Check your spam folder if you don&apos;t see it.
            </p>
          </div>
        )}

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

        {loading && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginTop: "1rem" }}>
            Verifying with Stripe…
          </p>
        )}
      </div>
    </div>
  );
}
