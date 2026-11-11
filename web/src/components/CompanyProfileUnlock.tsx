"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import { formatCents } from "@/lib/price-catalogue";
import { useOrderDraftBeacon } from "@/components/useOrderDraftBeacon";
import TermsAgreement from "@/components/order/TermsAgreement";
import PayGate from "@/components/order/PayGate";

/**
 * The locked Corporate Profile Report on /company (owner, Nov 10 2026 — Flow A).
 *
 * The sections are placeholders: grey bars, never names, because we do not hold the report — it is retrieved from
 * the registry after payment. Which sections appear is decided by the page per jurisdiction, so the blur never
 * promises something that registry's report does not contain.
 *
 * "Unlock" swaps the lock card for "Where should we send the report?" (name, email, optional phone) and then goes
 * to Stripe through the ordinary report checkout. The price is resolved again on the server.
 */

export type ProfileHit = {
  name: string; registryId: string; businessNumber: string; jurisdiction: string; provinceKey: string;
  location: string; entityType: string; status: string; registrationDate: string; statusNotes?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", height: "2.9rem", padding: "0 0.85rem", fontSize: "1rem",
  border: "1px solid var(--border)", borderRadius: "0.6rem", background: "#fff", color: "var(--text)",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.3rem", textAlign: "left" };

export default function CompanyProfileUnlock({
  hit,
  sections,
  priceCents,
}: {
  hit:        ProfileHit;
  sections:   string[];
  priceCents: number | undefined;
}) {
  const [open, setOpen]       = useState(false);
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [agreed, setAgreed]   = useState(false);
  const [paying, setPaying]   = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [err, setErr]         = useState("");

  const canPay = !!contact.name.trim() && EMAIL_RE.test(contact.email.trim());
  const price  = priceCents != null ? `${formatCents(priceCents)} + GST` : "";

  /* Saved as a draft from the moment the profile opens: docu10 counts a visit with a company as "picked". */
  useOrderDraftBeacon({
    service:  "profile-report",
    contact:  open ? contact : undefined,
    company:  { name: hit.name, registryId: hit.registryId, businessNumber: hit.businessNumber, jurisdiction: hit.jurisdiction, provinceKey: hit.provinceKey },
    disabled: redirecting,
  });

  const pay = async () => {
    if (!canPay || !agreed) return;
    setErr("");
    setPaying(true);
    try {
      const res  = await fetch("/api/order/report", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: "profile-report", hit, src: "company-profile", termsAccepted: agreed,
          contact: { name: contact.name.trim(), email: contact.email.trim(), phone: contact.phone.trim() },
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setRedirecting(true);
        window.location.href = data.url;
      } else {
        setErr(data.error || "Could not start payment. Please try again.");
      }
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <section
      id="profile-report"
      style={{
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)", overflow: "hidden", display: "grid", scrollMarginTop: "100px",
      }}
    >
      {/* The report, as placeholders. Hidden from assistive technology: there is nothing in it to read. */}
      <div aria-hidden="true" style={{ gridArea: "1 / 1", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.3rem" }}>
        <div className="card-heading" style={{ fontSize: "1.1rem" }}>Corporate Profile Report</div>
        {sections.map((title, i) => (
          <div key={title} style={{ display: "flex", flexDirection: "column", gap: "0.6rem", paddingTop: "1.1rem", borderTop: "1px solid var(--bg-deep)" }}>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", filter: "blur(5px)" }}>
              <div style={{ height: "0.85rem", width: `${58 + (i * 9) % 20}%`, borderRadius: "0.45rem", background: "#B9C8D3" }} />
              <div style={{ height: "0.85rem", width: `${82 - (i * 7) % 22}%`, borderRadius: "0.45rem", background: "var(--border)" }} />
              <div style={{ height: "0.85rem", width: `${44 + (i * 11) % 18}%`, borderRadius: "0.45rem", background: "var(--border)" }} />
            </div>
          </div>
        ))}
      </div>

      {/* position + zIndex: a blurred element makes its own layer and would otherwise paint over this card. */}
      <div style={{ gridArea: "1 / 1", position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem", background: "rgba(241,245,248,0.55)" }}>
        <div style={{
          maxWidth: open ? "30rem" : "27rem", width: "100%", boxSizing: "border-box", background: "var(--card)",
          border: "1px solid var(--border)", borderRadius: "var(--radius-card)", padding: "1.75rem",
          boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", gap: "0.85rem",
          alignItems: "stretch", textAlign: "center",
        }}>
          {!open ? (
            <>
              <div style={{ width: "3.2rem", height: "3.2rem", borderRadius: "50%", background: "var(--primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", alignSelf: "center" }}>
                <Lock size={22} aria-hidden="true" />
              </div>
              <h2 className="card-heading" style={{ margin: 0, fontSize: "1.25rem", lineHeight: 1.3 }}>Unlock the full Corporate Profile Report</h2>
              <p style={{ margin: 0, fontSize: "0.92rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
                {sections.slice(0, -1).join(", ").toLowerCase()} and {sections[sections.length - 1].toLowerCase()}, straight from the {hit.jurisdiction} registry.
              </p>
              {price && <div style={{ fontSize: "1.35rem", fontWeight: 700 }}>{price}</div>}
              <button
                type="button"
                onClick={() => setOpen(true)}
                style={{
                  height: "3rem", border: 0, borderRadius: "0.6rem", background: "var(--gold)", color: "var(--primary)",
                  fontSize: "1rem", fontWeight: 700, cursor: "pointer",
                }}
              >
                Unlock full report
              </button>
              <p style={{ margin: 0, fontSize: "0.8rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
                We retrieve it from the registry and email it to you within a few business hours.
              </p>
            </>
          ) : (
            <>
              <h2 className="card-heading" style={{ margin: 0, fontSize: "1.25rem", lineHeight: 1.3 }}>Where should we send the report?</h2>
              <p style={{ margin: 0, fontSize: "0.88rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
                We email the Corporate Profile Report for <strong style={{ color: "var(--text)" }}>{hit.name}</strong> as a PDF within a few business hours.
              </p>
              <div>
                <label htmlFor="cp-name" style={labelStyle}>Your full name</label>
                <input id="cp-name" type="text" autoComplete="name" value={contact.name}
                  onChange={(e) => setContact({ ...contact, name: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label htmlFor="cp-email" style={labelStyle}>Email address</label>
                <input id="cp-email" type="email" autoComplete="email" value={contact.email}
                  onChange={(e) => setContact({ ...contact, email: e.target.value })} style={inputStyle} />
              </div>
              <div>
                <label htmlFor="cp-phone" style={labelStyle}>
                  Contact number{" "}
                  <span style={{ marginLeft: "0.4rem", padding: "0.1rem 0.55rem", borderRadius: "999px", background: "var(--bg-deep)", fontSize: "0.7rem", fontWeight: 700 }}>Optional</span>
                </label>
                <input id="cp-phone" data-optional="true" type="text" inputMode="tel" autoComplete="tel" value={contact.phone}
                  onChange={(e) => setContact({ ...contact, phone: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ textAlign: "left" }}>
                <TermsAgreement checked={agreed} onChange={setAgreed} />
              </div>
              <PayGate blocked={!canPay || !agreed}>
                <button
                  type="button"
                  onClick={pay}
                  disabled={!canPay || paying || !agreed}
                  style={{
                    width: "100%", height: "3.2rem", border: 0, borderRadius: "0.6rem",
                    background: canPay && agreed ? "var(--gold)" : "var(--border)", color: "var(--primary)",
                    fontSize: "1.02rem", fontWeight: 700, cursor: canPay && agreed ? "pointer" : "not-allowed",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                  }}
                >
                  {paying ? <Loader2 size={18} className="animate-spin" /> : <>Continue to payment{price ? ` · ${price}` : ""} <ArrowRight size={18} /></>}
                </button>
              </PayGate>
              {err && <p role="alert" style={{ color: "#B42318", fontSize: "0.85rem", margin: 0 }}>{err}</p>}
              <p style={{ margin: 0, fontSize: "0.76rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
                Payment is taken on Stripe&apos;s secure page. If we cannot retrieve the report, you get a full refund.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
