"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { formatCents } from "@/lib/price-catalogue";
import { annualReturnPriceKey } from "@/lib/annual-return-price";
import { quoteDocuments } from "@/lib/corporate-documents-pricing";
import { JURISDICTIONS } from "@/lib/service-config";
import { MANUAL_REGISTRY_NAME } from "@/lib/pei-budget";
import { useOrderDraftBeacon } from "@/components/useOrderDraftBeacon";
import TermsAgreement from "@/components/order/TermsAgreement";
import PayGate from "@/components/order/PayGate";

/**
 * Order form for the jurisdictions we cannot search (lib/pei-budget NO_LIVE_SEARCH: PEI, Newfoundland and
 * Labrador, New Brunswick, the three territories).
 *
 * Owner, Nov 10 2026: a search box that cannot find the visitor's corporation tells them it does not exist. On a
 * page for one of these jurisdictions the visitor instead types the corporation's name, ticks what they need and
 * pays — or asks for a free snapshot first, when they are not sure the corporation is registered (the same
 * hand-lookup request the zero-results popup makes, /api/notify/search-help; a request, so docu10 may email them).
 *
 * Nobody has verified the corporation when the order is paid: the order says so ("Unverified"), and the copy
 * promises a full refund if staff cannot locate it.
 *
 * One service → that service's own checkout route with a typed "hit" (the routes only need a name), so the order
 * and its emails look like every other one. Two or more, or document copies → the basket checkout.
 */

type ServiceKey = "annual-return" | "profile-report" | "corporate-documents" | "good-standing";

const SERVICES: Array<{ key: ServiceKey; label: string; when: string }> = [
  { key: "annual-return",       label: "Annual return",                when: "Filed within 1 business day" },
  { key: "profile-report",      label: "Profile report",               when: "Emailed within a few business hours" },
  { key: "corporate-documents", label: "Corporate documents",          when: "Emailed within 1 business day" },
  { key: "good-standing",       label: "Certificate of good standing", when: "Emailed within 1 business day" },
];

/* The documents sold one by one, and the full set (owner, Nov 10 2026: not the full set only). Same keys and
   pricing as /order/corporate-documents: per document, capped at the full-set price. */
const DOCS: Array<{ key: string; label: string }> = [
  { key: "certificate",           label: "Certificate of Incorporation" },
  { key: "articles",              label: "Articles of Incorporation" },
  { key: "annual-returns",        label: "Annual returns" },
  { key: "change-of-information", label: "Change of information filings" },
  { key: "other",                 label: "Another document" },
  { key: "full-set",              label: "Full set — everything on file" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", height: "2.9rem", padding: "0 0.85rem", fontSize: "1rem",
  border: "1px solid var(--border)", borderRadius: "0.6rem", background: "#fff", color: "var(--text)",
};
const labelStyle: React.CSSProperties = { display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "0.3rem" };

export default function NoSearchOrderForm({
  service,
  provinceKey,
  prices,
  srcTag,
}: {
  service:     string;                  // the page's own service; preselected when it is one we sell here
  provinceKey: string;                  // a NO_LIVE_SEARCH key
  prices:      Record<string, number>;  // live catalogue
  srcTag:      string;
}) {
  const province = JURISDICTIONS.find((j) => j.key === provinceKey)?.label ?? "this province";
  const registry = MANUAL_REGISTRY_NAME[provinceKey] ?? "the registry";
  const first: ServiceKey = SERVICES.some((s) => s.key === service) ? (service as ServiceKey) : "profile-report";

  const [picked, setPicked]   = useState<ServiceKey[]>([first]);
  const [docs, setDocs]       = useState<string[]>([]);
  const [docNotes, setDocNotes] = useState("");
  const [corp, setCorp]       = useState("");
  const [regNo, setRegNo]     = useState("");
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [agreed, setAgreed]   = useState(false);
  const [paying, setPaying]   = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [payErr, setPayErr]   = useState("");
  const [snap, setSnap]       = useState<"idle" | "sending" | "sent">("idle");
  const [snapErr, setSnapErr] = useState("");

  const perDoc   = prices["corporate-document-single"];
  const fullSet  = prices["corporate-documents"];
  const docQuote = perDoc != null && fullSet != null && docs.length ? quoteDocuments(docs, perDoc, fullSet) : null;
  const wantDocs = picked.includes("corporate-documents");
  const docsOk   = !wantDocs || (docs.length > 0 && (!docs.includes("other") || !!docNotes.trim()));
  const centsOf = (k: ServiceKey) =>
    k === "corporate-documents" ? docQuote?.totalCents : prices[k === "annual-return" ? annualReturnPriceKey(provinceKey) : k];
  const total   = picked.reduce((sum, k) => sum + (centsOf(k) ?? 0), 0);
  const emailOk = EMAIL_RE.test(contact.email.trim());
  const canPay  = picked.length > 0 && docsOk && corp.trim().length >= 2 && !!contact.name.trim() && emailOk && !!contact.phone.trim();
  const src     = `${srcTag}-nosearch`;

  /* Unfinished forms are saved as drafts like every other order form (docu10's leads read them). */
  useOrderDraftBeacon({
    service:  picked[0] ?? first,
    contact,
    company:  corp.trim() ? { name: corp.trim(), registryId: regNo.trim(), jurisdiction: province, provinceKey } : undefined,
    disabled: redirecting,
  });

  const toggle = (k: ServiceKey) =>
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  const pay = async () => {
    if (!canPay || !agreed) return;
    setPayErr("");
    setPaying(true);
    const hit = {
      name: corp.trim(), registryId: regNo.trim(), businessNumber: "", jurisdiction: province, provinceKey,
      location: "", entityType: "", status: "Unverified", registrationDate: "",
    };
    const only = picked.length === 1 ? picked[0] : null;
    let endpoint: string;
    let body: Record<string, unknown>;
    if (only === "annual-return") {
      endpoint = "/api/order/annual-return";
      body = {
        hit, years: 1, contact, src, registryAccess: { status: "", code: "" },
        changes: {
          directors: [], shareholders: [],
          registeredAddress: { changed: false, newAddress: "", effectiveDate: "" },
          recordsAddress:    { changed: false, newAddress: "", effectiveDate: "" },
          authorizedAgent:   { changed: false, newAgent: "", effectiveDate: "" },
          other: "",
        },
      };
    } else if (only === "profile-report" || only === "good-standing") {
      endpoint = "/api/order/report";
      body = { service: only, hit, contact, src };
    } else if (only === "corporate-documents") {
      endpoint = "/api/order/corporate-documents";
      body = { hit, documents: docs, notes: docNotes.trim(), contact, src };
    } else {
      endpoint = "/api/order/wizard-checkout";
      body = {
        serviceKeys: picked, jurisdictionKey: provinceKey, src,
        ...(wantDocs ? { documents: docs, docNotes: docNotes.trim() } : {}),
        customer: { fullName: contact.name.trim(), email: contact.email.trim(), phone: contact.phone.trim(), company: corp.trim() },
        details: {
          corporationName:    corp.trim(),
          registrationNumber: regNo.trim(),
          companyCheck:       `NOT VERIFIED - typed by the client; ${province} has no live search. Confirm with the ${registry} before filing.`,
        },
      };
    }
    try {
      const res  = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, termsAccepted: agreed }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setRedirecting(true);
        window.location.href = data.url;
      } else {
        setPayErr(data.error === "not-directly-purchasable"
          ? "One of these services needs a quote. Untick it, or email support@corporateregistryservices.ca."
          : data.error || "Could not start payment. Please try again.");
      }
    } catch {
      setPayErr("Network error. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  const askSnapshot = async () => {
    setSnapErr("");
    if (corp.trim().length < 2) { setSnapErr("Enter the corporation name first."); return; }
    if (!emailOk)               { setSnapErr("Enter your email address so we can send the snapshot."); return; }
    setSnap("sending");
    try {
      const res  = await fetch("/api/notify/search-help", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: contact.email.trim(), query: corp.trim(), province: provinceKey,
          details: { name: corp.trim(), corpNumber: regNo.trim(), province: provinceKey },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setSnap("sent");
      else { setSnap("idle"); setSnapErr(data.error || "Could not send the request. Please try again."); }
    } catch {
      setSnap("idle");
      setSnapErr("Network error. Please try again.");
    }
  };

  return (
    <div
      id="crs-inline-lookup"
      style={{
        margin: "0 0 2rem", border: "1px solid var(--border)", borderLeft: "4px solid var(--gold)",
        borderRadius: "var(--radius-card)", background: "var(--card)", padding: "1.5rem 1.75rem",
        boxShadow: "var(--shadow-card)", scrollMarginTop: "100px",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
        {province} · order online
      </div>
      <div className="card-heading" style={{ fontSize: "1.18rem", margin: "0.35rem 0 0.5rem" }}>
        Tell us about your corporation
      </div>
      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0 0 1.1rem", lineHeight: 1.55 }}>
        We check your corporation with the {registry} before we start. If we cannot locate it, you get a full refund.
      </p>

      <div style={{ display: "grid", gap: "0.9rem" }}>
        <div>
          <label htmlFor="ns-corp" style={labelStyle}>Corporation name</label>
          <input id="ns-corp" required type="text" value={corp} onChange={(e) => setCorp(e.target.value)}
            placeholder="Exactly as registered, if you can" maxLength={160} style={inputStyle} />
        </div>
        <div>
          <label htmlFor="ns-reg" style={labelStyle}>
            {province} registration number{" "}
            <span style={{ marginLeft: "0.4rem", padding: "0.1rem 0.55rem", borderRadius: "999px", background: "var(--bg-deep)", fontSize: "0.7rem", fontWeight: 700 }}>Optional</span>
          </label>
          <input id="ns-reg" data-optional="true" type="text" value={regNo} onChange={(e) => setRegNo(e.target.value)}
            placeholder="Helps us find the right corporation faster" maxLength={40} style={inputStyle} />
        </div>

        <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
          <legend style={{ ...labelStyle, padding: 0 }}>What do you need?</legend>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))", gap: "0.6rem" }}>
            {SERVICES.map((s) => {
              const on = picked.includes(s.key);
              const cents = centsOf(s.key);
              return (
                <label key={s.key} style={{
                  display: "flex", gap: "0.65rem", alignItems: "flex-start", minHeight: "2.75rem", boxSizing: "border-box",
                  padding: "0.6rem 0.85rem", borderRadius: "0.6rem", cursor: "pointer",
                  border: on ? "2px solid var(--primary)" : "1px solid var(--border)",
                }}>
                  <input type="checkbox" data-optional="true" checked={on} onChange={() => toggle(s.key)}
                    style={{ width: "1.1rem", height: "1.1rem", marginTop: "0.15rem", accentColor: "var(--primary)" }} />
                  <span style={{ fontSize: "0.92rem", lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 600 }}>{s.label}</span>
                    {s.key === "corporate-documents"
                      ? perDoc != null && <span> · from {formatCents(perDoc)} + GST each</span>
                      : cents != null && <span> · {formatCents(cents)} + GST</span>}
                    <span style={{ display: "block", fontSize: "0.76rem", color: "var(--text-muted)" }}>{s.when}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {wantDocs && (
          <fieldset style={{ margin: 0, padding: "0.9rem 1rem", border: "1px solid var(--border)", borderRadius: "0.6rem" }}>
            <legend style={{ ...labelStyle, padding: "0 0.35rem", marginBottom: 0 }}>Which documents?</legend>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))", gap: "0.45rem 1rem" }}>
              {DOCS.map((d) => (
                <label key={d.key} style={{ display: "flex", gap: "0.55rem", alignItems: "center", minHeight: "2.2rem", fontSize: "0.9rem", cursor: "pointer" }}>
                  <input type="checkbox" data-optional="true" checked={docs.includes(d.key)}
                    onChange={() => setDocs((p) => (p.includes(d.key) ? p.filter((x) => x !== d.key) : [...p, d.key]))}
                    style={{ width: "1.05rem", height: "1.05rem", accentColor: "var(--primary)" }} />
                  {d.label}
                </label>
              ))}
            </div>
            {docs.includes("other") && (
              <div style={{ marginTop: "0.6rem" }}>
                <label htmlFor="ns-docnotes" style={labelStyle}>Which other document?</label>
                <input id="ns-docnotes" required type="text" value={docNotes} onChange={(e) => setDocNotes(e.target.value)} maxLength={300} style={inputStyle} />
              </div>
            )}
            <p style={{ margin: "0.6rem 0 0", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
              {docQuote
                ? docQuote.mode === "full-set"
                  ? `Full set: ${formatCents(docQuote.totalCents)} + GST.${docQuote.count > 0 && !docs.includes("full-set") ? " That many single documents cost as much as the full set, so you get the full set." : ""}`
                  : `${docQuote.count} document${docQuote.count === 1 ? "" : "s"}: ${formatCents(docQuote.totalCents)} + GST.`
                : "Tick the documents you need, or the full set."}
            </p>
          </fieldset>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))", gap: "0.9rem" }}>
          <div>
            <label htmlFor="ns-name" style={labelStyle}>Your full name</label>
            <input id="ns-name" type="text" autoComplete="name" value={contact.name}
              onChange={(e) => setContact({ ...contact, name: e.target.value })} style={inputStyle} />
          </div>
          <div>
            <label htmlFor="ns-email" style={labelStyle}>Email address</label>
            <input id="ns-email" type="email" autoComplete="email" value={contact.email}
              onChange={(e) => setContact({ ...contact, email: e.target.value })} style={inputStyle} />
          </div>
        </div>
        <div>
          <label htmlFor="ns-phone" style={labelStyle}>Contact number</label>
          <input id="ns-phone" type="tel" autoComplete="tel" value={contact.phone}
            onChange={(e) => setContact({ ...contact, phone: e.target.value })} style={inputStyle} />
        </div>

        {picked.length > 0 && total > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", padding: "0.8rem 0.9rem", borderRadius: "0.6rem", background: "var(--bg)", fontSize: "0.95rem" }}>
            <span>{picked.length === 1 ? SERVICES.find((s) => s.key === picked[0])?.label : `${picked.length} services`}</span>
            <span style={{ fontWeight: 700 }}>{formatCents(total)} + GST</span>
          </div>
        )}

        <div>
          <TermsAgreement checked={agreed} onChange={setAgreed} />
          <PayGate blocked={!canPay || !agreed}>
            <button
              type="button"
              onClick={pay}
              disabled={!canPay || paying || !agreed}
              style={{
                width: "100%", marginTop: "0.85rem", height: "3.2rem", border: 0, borderRadius: "0.6rem",
                background: canPay && agreed ? "var(--gold)" : "var(--border)", color: "var(--primary)",
                fontSize: "1.02rem", fontWeight: 700, cursor: canPay && agreed ? "pointer" : "not-allowed",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
              }}
            >
              {paying ? <Loader2 size={18} className="animate-spin" /> : <>Continue to payment <ArrowRight size={18} /></>}
            </button>
          </PayGate>
          {payErr && <p role="alert" style={{ color: "#B42318", fontSize: "0.85rem", margin: "0.55rem 0 0" }}>{payErr}</p>}
          <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", textAlign: "center", margin: "0.55rem 0 0" }}>
            Card processed securely by Stripe. Government fees included.
          </p>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem", display: "grid", gap: "0.5rem" }}>
          {snap === "sent" ? (
            <p role="status" style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>
              <CheckCircle2 size={18} style={{ color: "#14532D", flexShrink: 0, marginTop: "0.1rem" }} />
              <span>Request received. We will look up <strong>{corp.trim()}</strong> and email a free snapshot to {contact.email.trim()} within a few business hours.</span>
            </p>
          ) : (
            <>
              <div style={{ fontSize: "0.88rem", lineHeight: 1.5 }}>Not sure the corporation is registered, or which name it is under?</div>
              <button
                type="button"
                onClick={askSnapshot}
                disabled={snap === "sending"}
                style={{
                  height: "2.9rem", border: "2px solid var(--primary)", borderRadius: "0.6rem", background: "#fff",
                  color: "var(--primary)", fontSize: "0.95rem", fontWeight: 700, cursor: "pointer",
                }}
              >
                {snap === "sending" ? "Sending…" : "Send me a free snapshot first"}
              </button>
              <div style={{ fontSize: "0.76rem", lineHeight: 1.5, color: "var(--text-muted)" }}>
                We look it up and email you its status and registration details within a few business hours. No payment. Needs only the corporation name and your email.
              </div>
              {snapErr && <p role="alert" style={{ color: "#B42318", fontSize: "0.85rem", margin: 0 }}>{snapErr}</p>}
            </>
          )}
        </div>

        <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)" }}>
          Registered in another province?{" "}
          <a href="/canada-corporations-search" style={{ color: "var(--primary)", textDecoration: "underline" }}>Search for your company instead</a>.
        </p>
      </div>
    </div>
  );
}
