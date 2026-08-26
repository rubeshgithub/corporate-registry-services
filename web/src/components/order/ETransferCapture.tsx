"use client";

import { useState } from "react";
import { Loader2, Check, AlertCircle, ChevronDown } from "lucide-react";

/**
 * Interac e-Transfer fallback, shown under the pay button on every order flow.
 *
 * Design intent — this is a payment option, not a lead-capture widget:
 *
 *  - Collapsed by default. The card path stays the primary action; this never
 *    competes with it, and a visitor who is happy to pay by card never sees a
 *    form they have to dismiss.
 *  - Email only. Name and phone are optional. Asking for a phone number in
 *    order to receive payment instructions is incongruous and every extra
 *    required field costs completions — the phone can be asked for in the
 *    reply, once they are already engaged.
 *  - Honest trade. They get something concrete they cannot otherwise obtain
 *    (the transfer address, the exact amount, a reference), so the email ask
 *    is earned rather than harvested.
 *  - The address is never rendered here. It is sent by hand, which keeps it
 *    off a public page and lets the operator match the transfer to an order.
 */

/**
 * Minimum order value that justifies offering e-Transfer, in cents.
 *
 * Every e-Transfer is manual work on both sides — we email instructions, they
 * send it, we reconcile it against an order, then we start. On a $49 profile
 * report that handling can cost more than the sale. Above ~$200 the margin
 * carries it, and the customers who genuinely cannot use a card are usually
 * buying the larger services anyway.
 *
 * Applies to the order TOTAL, so a 3-year annual-return catch-up qualifies
 * even though a single year does not.
 */
const MIN_ETRANSFER_CENTS = 20_000;

export type ETransferCompany = {
  name?:            string;
  registryId?:      string;
  businessNumber?:  string;
  jurisdiction?:    string;
  provinceKey?:     string;
};

function sessionIdFromCookie(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|; )crs_session_id=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export default function ETransferCapture({
  service,
  serviceLabel,
  priceLabel,
  priceCents,
  company,
  contact,
  src,
}: {
  service:       string;
  serviceLabel?: string;
  priceLabel?:   string;
  /** Order total in cents. Below MIN_ETRANSFER_CENTS the block does not
   *  render at all — see the constant for why. */
  priceCents?:   number;
  company?:      ETransferCompany;
  /** Anything the visitor already typed on the form — pre-fills the field so
   *  they don't retype an email they just entered. */
  contact?:      { name?: string; email?: string; phone?: string };
  src?:          string;
}) {
  const [open, setOpen]     = useState(false);
  const [email, setEmail]   = useState(contact?.email ?? "");
  const [name, setName]     = useState(contact?.name ?? "");
  const [state, setState]   = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr]       = useState("");

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  /* Below the threshold the option is not offered. Checked after the hooks so
     the hook order stays stable across renders — an order total can change
     mid-flow (adding years to an annual return), and bailing before the
     useState calls would break React's rules. */
  const offered = (priceCents ?? 0) >= MIN_ETRANSFER_CENTS;

  const submit = async () => {
    if (!valid || state === "sending") return;
    setState("sending");
    setErr("");
    try {
      const res = await fetch("/api/order/etransfer", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId:    sessionIdFromCookie(),
          service,
          serviceLabel: serviceLabel ?? service,
          priceLabel,
          path:         typeof window !== "undefined" ? window.location.pathname : "",
          contact:      { email: email.trim(), name: name.trim(), phone: contact?.phone ?? "" },
          company,
          src,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not send. Please try again.");
      setState("sent");
    } catch (e) {
      setState("error");
      setErr(e instanceof Error ? e.message : "Could not send. Please try again.");
    }
  };

  /* Already-submitted state still renders even if the total later drops below
     the threshold — the customer is owed the confirmation they just earned. */
  if (!offered && state !== "sent") return null;

  if (state === "sent") {
    return (
      <div
        style={{
          marginTop: "0.85rem",
          padding: "0.85rem 1rem",
          borderRadius: "0.5rem",
          border: "1px solid var(--secondary)",
          background: "rgba(42,125,143,0.07)",
          display: "flex",
          gap: "0.6rem",
          alignItems: "flex-start",
        }}
      >
        <Check size={16} style={{ color: "var(--secondary)", flexShrink: 0, marginTop: "0.1rem" }} />
        <div style={{ fontSize: "0.82rem", color: "var(--text)", lineHeight: 1.55 }}>
          <strong>Got it.</strong> We&rsquo;ll email your e-Transfer details to{" "}
          <span style={{ fontFamily: "var(--font-mono), monospace" }}>{email.trim()}</span> shortly —
          including the exact amount and a reference to include with the transfer. We send these by
          hand, so please wait for our reply rather than transferring to any address you find
          elsewhere.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "0.85rem" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "var(--text-muted)",
          fontSize: "0.78rem",
          textDecoration: "underline",
          textUnderlineOffset: "3px",
        }}
      >
        Can&rsquo;t pay by card? We also accept Interac e-Transfer
        <ChevronDown
          size={13}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}
        />
      </button>

      {open && (
        <div
          style={{
            marginTop: "0.6rem",
            padding: "0.9rem 1rem",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            background: "var(--card)",
          }}
        >
          <p style={{ fontSize: "0.8rem", color: "var(--text)", margin: "0 0 0.7rem", lineHeight: 1.55 }}>
            Leave your email and we&rsquo;ll send the transfer details — the address, the exact
            amount, and a reference number. We send these by hand rather than publishing them, so
            your payment is matched to your order.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 500, color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                Email <span style={{ color: "var(--gold)" }}>*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
                placeholder="you@company.ca"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 500, color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                Name <span style={{ color: "var(--text-muted)" }}>(optional)</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
                placeholder="Jane Doe"
                style={inputStyle}
              />
            </div>
          </div>

          {state === "error" && (
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "flex-start", marginTop: "0.6rem", color: "#B45309", fontSize: "0.78rem" }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
              <span>{err}</span>
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!valid || state === "sending"}
            style={{
              marginTop: "0.7rem",
              padding: "0.55rem 1.1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: valid ? "var(--secondary)" : "var(--border)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.82rem",
              cursor: valid && state !== "sending" ? "pointer" : "not-allowed",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            {state === "sending"
              ? <><Loader2 size={14} className="crs-spin" /> Sending…</>
              : "Email me e-Transfer details"}
          </button>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.7rem",
  border: "1px solid var(--border)",
  borderRadius: "0.4rem",
  fontSize: "0.85rem",
  background: "var(--bg)",
  color: "var(--text)",
};
