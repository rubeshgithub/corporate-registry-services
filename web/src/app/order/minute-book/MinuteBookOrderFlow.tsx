"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Search, CheckCircle2, ArrowRight, ArrowLeft, Loader2, AlertCircle,
  ShieldCheck, Lock, FileText, BookOpen,
} from "lucide-react";
import {
  MINUTE_BOOK_COPY, MINUTE_BOOK_TIERS, SELF_SERVE_NOTE, tierForIncorpDate, selfServeAvailable,
  type MinuteBookPath, type MinuteBookPrices, type ReportSource,
} from "@/lib/minute-book-config";
import { useOrderDraftBeacon } from "@/components/useOrderDraftBeacon";
import PaymentStepChatNudge from "@/components/order/PaymentStepChatNudge";
import ETransferCapture from "@/components/order/ETransferCapture";
import { formatCents } from "@/lib/price-catalogue";
import { JURISDICTIONS } from "@/lib/service-config";
import { homeJurisdictionOf, homeRecordsFor, isExtraProvincial } from "@/lib/registry-home";

/**
 * The Minute Book order funnel: Find (search + instant price reveal) →
 * Details → Report → Review & Pay. The corporation's incorporation date
 * from the registry hit drives the price reveal; the API route re-derives
 * the tier server-side so the client never controls the amount.
 */

type RegistryHit = {
  name:             string;
  businessNumber:   string;
  registryId:       string;
  location:         string;
  status:           "Active" | "Inactive";
  statusNotes:      string;
  entityType:       string;
  registrationDate: string;
  jurisdiction:     string;
  provinceKey:      string;
};

const STEPS = ["Find", "Details", "Report", "Review & Pay"] as const;

const PROVINCE_OPTIONS = [{ key: "all", label: "All jurisdictions" }, ...JURISDICTIONS];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "0.6rem 0.85rem", border: "1px solid var(--border)",
  borderRadius: "0.5rem", fontSize: "0.9rem", background: "var(--bg)", color: "var(--text)",
};

const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "0.75rem", fontWeight: 500,
  color: "var(--text-muted)", marginBottom: "0.25rem",
};

const resultStyle: React.CSSProperties = {
  textAlign: "left", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.5rem",
  padding: "0.9rem 1rem", cursor: "pointer", display: "flex", gap: "0.75rem", alignItems: "center", justifyContent: "space-between",
};

const cardStyle: React.CSSProperties = {
  background: "var(--card)", border: "1px solid var(--border)",
  borderRadius: "var(--radius-card)", padding: "1.5rem", boxShadow: "var(--shadow-card)",
};

export default function MinuteBookOrderFlow({ prices }: { prices: MinuteBookPrices }) {
  const params         = useSearchParams();
  const attributionSrc = params.get("src") ?? "direct";

  const [step, setStep] = useState(0);

  // Find state
  const [query, setQuery]         = useState(() => params.get("q") ?? "");
  const [province, setProvince]   = useState("all");
  const [results, setResults]     = useState<RegistryHit[]>([]);
  const [searching, setSearching] = useState(() => !!params.get("q"));
  const [searchErr, setSearchErr] = useState("");
  const [pick, setPick]           = useState<RegistryHit | null>(null);
  const [manualDate, setManualDate] = useState("");

  // Details state
  const [contact, setContact] = useState({ name: "", email: "", phone: "", role: "Director" });

  // Report state
  const [reportSource, setReportSource] = useState<ReportSource>("crs_pull");

  // Review state
  const [path, setPath]     = useState<MinuteBookPath>("self");
  const [paying, setPaying] = useState(false);
  const [payErr, setPayErr] = useState("");

  useOrderDraftBeacon({
    service: "minute-book",
    contact: { name: contact.name, email: contact.email, phone: contact.phone },
    company: pick ? {
      name:           pick.name,
      registryId:     pick.registryId,
      businessNumber: pick.businessNumber,
      jurisdiction:   pick.jurisdiction,
      provinceKey:    pick.provinceKey,
    } : undefined,
    disabled: paying,
  });

  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [step]);

  /* Deep link: ?q= pre-runs the search (e.g. from /minute-books or the
     corporate-search page); ?registryId= auto-selects the match. */
  useEffect(() => {
    const q = params.get("q");
    if (!q) return;
    const wantedRegistryId = params.get("registryId") ?? "";
    (async () => {
      try {
        const res  = await fetch(`/api/company-search?q=${encodeURIComponent(q)}&province=${params.get("jurisdiction") ?? "all"}`);
        const data = await res.json();
        const hits: RegistryHit[] = data.results ?? [];
        setResults(hits);
        const match = wantedRegistryId ? hits.find((h) => h.registryId === wantedRegistryId) : (hits.length === 1 ? hits[0] : null);
        if (match) setPick(match);
      } catch {
        setSearchErr("Search is temporarily unavailable. Please try again.");
      } finally {
        setSearching(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = () => search(query.trim(), province);

  const search = async (q: string, prov: string) => {
    if (q.length < 2) {
      setSearchErr("Enter at least 2 characters — a company name, corporate number, or Business Number.");
      return;
    }
    setSearchErr("");
    setSearching(true);
    setPick(null);
    try {
      const res  = await fetch(`/api/company-search?q=${encodeURIComponent(q)}&province=${prov}`);
      const data = await res.json();
      setResults(data.results ?? []);
      if (!data.results?.length) setSearchErr("No matching records. Try the exact registered name, or change jurisdiction.");
    } catch {
      setSearchErr("Search is temporarily unavailable. Please try again.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const effectiveIncorpDate = pick?.registrationDate?.slice(0, 10) || manualDate;
  const tier      = useMemo(() => tierForIncorpDate(effectiveIncorpDate || null), [effectiveIncorpDate]);
  /* Self-serve only where the MinuteBook app reads the profile report;
     everywhere else the book is built by CRS. */
  const selfOk  = pick ? selfServeAvailable(pick.provinceKey) : true;
  const effPath: MinuteBookPath = selfOk ? path : "crs";

  /* A minute book follows the corporation's home jurisdiction, so an
     extra-provincial registration can't be ordered; steer to the home record. */
  const extra = pick ? isExtraProvincial(pick) : false;
  const homes = pick && extra ? homeRecordsFor(pick, results) : [];
  const searchHome = () => {
    if (!pick) return;
    const home = homeJurisdictionOf(pick) ?? "all";
    setQuery(pick.name);
    setProvince(home);
    search(pick.name, home);
  };

  const canFind    = !!pick && !!tier && !extra;
  const canDetails =
    !!contact.name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) &&
    !!contact.phone.trim();
  const canContinue = step === 0 ? canFind : step === 1 ? canDetails : true;

  const goToPayment = async () => {
    if (!pick || !tier) return;
    setPayErr("");
    setPaying(true);
    try {
      const res = await fetch("/api/order/minute-book", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          hit: pick, contact, path: effPath, reportSource,
          manualIncorpDate: pick.registrationDate ? undefined : manualDate,
          src: attributionSrc,
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setPayErr(data.error || "Could not start payment. Please try again.");
      }
    } catch {
      setPayErr("Network error. Please try again.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
          {MINUTE_BOOK_COPY.label} · Every province · Federal
        </span>
        <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", marginTop: "0.35rem", marginBottom: "0.5rem" }}>
          {MINUTE_BOOK_COPY.headline}
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{MINUTE_BOOK_COPY.description}</p>
      </div>

      {/* Stepper */}
      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {STEPS.map((label, i) => {
          const active = i === step, done = i < step;
          return (
            <div key={label} style={{
              flex: "1 1 100px", textAlign: "center", padding: "0.45rem 0.4rem",
              fontFamily: "var(--font-mono), monospace", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.06em",
              borderRadius: "0.4rem",
              border: active || done ? "1px solid var(--gold)" : "1px solid var(--border)",
              background: active || done ? "var(--gold-dim)" : "transparent",
              color: active ? "var(--text)" : "var(--text-muted)",
              fontWeight: active ? 700 : 500,
            }}>
              {done ? "✓ " : `${i + 1}. `}{label}
            </div>
          );
        })}
      </div>

      {/* ───────────── STEP 0 · FIND ───────────── */}
      {step === 0 && (
        <div className="step-enter">
          <div style={cardStyle}>
            <label htmlFor="mb-q" style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem" }}>
              Find your corporation — name, corporate number, or Business Number
            </label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <input
                id="mb-q"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
                placeholder="e.g. Acme Holdings, 2094832, or 123456789RC0001"
                style={{ ...inputStyle, flex: "3 1 240px", width: "auto" }}
              />
              <select
                value={province}
                onChange={(e) => setProvince(e.target.value)}
                style={{ ...inputStyle, flex: "1 1 150px", width: "auto", fontSize: "0.85rem" }}
              >
                {PROVINCE_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <button
                onClick={runSearch}
                disabled={searching}
                style={{ flex: "0 0 auto", padding: "0.65rem 1.1rem", background: "var(--primary)", color: "#FFFFFF", fontWeight: 600, fontSize: "0.9rem", border: "none", borderRadius: "0.5rem", cursor: searching ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: "0.375rem" }}
              >
                {searching ? <Loader2 size={14} className="crs-spin" /> : <Search size={14} />} Find
              </button>
            </div>
            {searchErr && <p style={{ color: "#B45309", fontSize: "0.8rem", marginTop: "0.75rem" }}>{searchErr}</p>}
          </div>

          {results.length > 0 && !pick && (
            <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {results.slice(0, 5).map((hit, i) => (
                <button
                  key={`${hit.provinceKey}-${hit.registryId}-${i}`}
                  onClick={() => setPick(hit)}
                  style={resultStyle}
                >
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.95rem" }}>{hit.name}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "0.15rem" }}>
                      {hit.jurisdiction} · {hit.registryId || "—"} · {hit.status}
                      {hit.registrationDate ? ` · Incorporated ${hit.registrationDate.slice(0, 10)}` : ""}
                    </div>
                    {isExtraProvincial(hit) && (
                      <div style={{ color: "#B45309", fontSize: "0.72rem", marginTop: "0.2rem" }}>Extra-provincial registration — not the home record</div>
                    )}
                  </div>
                  <ArrowRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}

          {/* The price reveal */}
          {pick && (
            <div className="step-enter" style={{ marginTop: "1.25rem" }}>
              <div style={{ ...cardStyle, border: "1px solid var(--gold)", padding: "1.5rem 1.75rem" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                  <CheckCircle2 size={20} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.15rem" }} />
                  <div style={{ flex: 1 }}>
                    <div className="card-heading" style={{ fontSize: "1.15rem" }}>{pick.name}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "0.15rem" }}>
                      {pick.jurisdiction} · {pick.registryId || "—"}
                      {pick.registrationDate ? ` · Incorporated ${pick.registrationDate.slice(0, 10)}` : ""}
                    </div>
                  </div>
                  <button onClick={() => { setPick(null); setManualDate(""); }} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.78rem", cursor: "pointer", padding: 0 }}>
                    Change
                  </button>
                </div>

                {extra && (
                  <div style={{ marginTop: "0.9rem", padding: "0.9rem 1rem", borderRadius: "0.5rem", background: "rgba(180,83,9,0.08)" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.88rem", color: "var(--text)", marginBottom: "0.3rem" }}>
                      This is an extra-provincial registration
                    </div>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>
                      {pick.jurisdiction} keeps this record because the corporation does business there, but it was formed{" "}
                      {homeJurisdictionOf(pick) === "federal" ? "federally, under the Canada Business Corporations Act" : "in another jurisdiction"}.
                      Its minute book follows the law of that home jurisdiction, so it&apos;s ordered against the home registration.
                    </p>
                    {homes.length > 0 ? (
                      <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <div style={labelStyle}>{homeJurisdictionOf(pick) ? "Its home registration" : "Possible home registrations"}</div>
                        {homes.map((h, i) => (
                          <button key={`${h.provinceKey}-${h.registryId}-${i}`} onClick={() => { setPick(h); setManualDate(""); }} style={resultStyle}>
                            <div>
                              <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.9rem" }}>{h.name}</div>
                              <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "0.15rem" }}>
                                {h.jurisdiction} · {h.registryId || "—"} · {h.status}
                                {h.registrationDate ? ` · Incorporated ${h.registrationDate.slice(0, 10)}` : ""}
                              </div>
                            </div>
                            <ArrowRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button onClick={searchHome} style={{ marginTop: "0.75rem", padding: "0.55rem 1rem", background: "var(--primary)", color: "#FFFFFF", fontWeight: 600, fontSize: "0.85rem", border: "none", borderRadius: "0.5rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
                        <Search size={14} /> Find its home registration
                      </button>
                    )}
                  </div>
                )}

                {!extra && !pick.registrationDate && (
                  <div style={{ marginTop: "0.9rem" }}>
                    <label style={labelStyle}>
                      The registry didn&apos;t return an incorporation date — enter it to see your price (we verify it against your profile report)
                    </label>
                    <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} style={{ ...inputStyle, maxWidth: 220 }} />
                  </div>
                )}
              </div>

              {!extra && tier && (
                <>
                  <p style={{ textAlign: "center", margin: "1.25rem 0 0.75rem", fontSize: "0.95rem", color: "var(--text)" }}>
                    Incorporated {effectiveIncorpDate} — your book covers every year since. Your price, revealed before you pay:
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
                    {MINUTE_BOOK_TIERS.map((t) => {
                      const mine = t.key === tier.key;
                      return (
                        <div key={t.key} style={{
                          position: "relative", padding: "1rem",
                          background: mine ? "var(--gold-dim)" : "var(--card)",
                          border: mine ? "1.5px solid var(--gold)" : "1px solid var(--border)",
                          borderRadius: "0.6rem", opacity: mine ? 1 : 0.6,
                        }}>
                          {mine && (
                            <span style={{ position: "absolute", top: "-0.55rem", left: "0.75rem", background: "var(--gold)", color: "#FFFFFF", fontFamily: "var(--font-mono), monospace", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0.15rem 0.5rem", borderRadius: "0.25rem", fontWeight: 700 }}>
                              Your tier
                            </span>
                          )}
                          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>{t.label}</div>
                          <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", margin: "0.2rem 0" }}>{formatCents(prices[t.key][selfOk ? "self" : "crs"])}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{selfOk ? <>self-serve · {formatCents(prices[t.key].crs)} built by CRS</> : "built by CRS"}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", marginTop: "0.9rem", padding: "0.85rem 1rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.5rem" }}>
                    <ShieldCheck size={16} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.1rem" }} />
                    <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                      All-inclusive: your current Corporate Profile Report and every document your book requires. Nothing is added at checkout.
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ───────────── STEP 1 · DETAILS ───────────── */}
      {step === 1 && pick && (
        <div className="step-enter" style={{ ...cardStyle, padding: "1.5rem 1.75rem" }}>
          <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.35rem" }}>
            We&apos;re opening a file for {pick.name}
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: 0, marginBottom: "1rem" }}>
            Your details stay inside this file — we use them to deliver your report and your finished book, nothing else.
          </p>

          <div style={{ marginBottom: "0.65rem" }}>
            <label style={labelStyle}>Full legal name</label>
            <input type="text" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} placeholder="Jane Doe" style={inputStyle} />
          </div>
          <div style={{ marginBottom: "0.65rem" }}>
            <label style={labelStyle}>Your role in the corporation</label>
            <select value={contact.role} onChange={(e) => setContact({ ...contact, role: e.target.value })} style={inputStyle}>
              {["Director", "Officer", "Shareholder", "Accountant / Advisor", "Other"].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px", marginBottom: "0.65rem" }}>
              <label style={labelStyle}>Email</label>
              <input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="jane@company.ca" style={inputStyle} />
            </div>
            <div style={{ flex: "1 1 160px", marginBottom: "0.65rem" }}>
              <label style={labelStyle}>Phone</label>
              <input type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="(403) 555-0123" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", marginTop: "0.5rem", padding: "0.85rem 1rem", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "0.5rem" }}>
            <Lock size={15} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.1rem" }} />
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Stored securely in Canada, PIPEDA-compliant. We never sell or share your details, and you won&apos;t be added to a marketing list.
            </span>
          </div>
        </div>
      )}

      {/* ───────────── STEP 2 · REPORT ───────────── */}
      {step === 2 && (
        <div className="step-enter">
          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.88rem", marginTop: 0, marginBottom: "1.1rem" }}>
            Every book starts with the registry&apos;s own Corporate Profile Report — the one document we won&apos;t build without. It keeps your minute book honest.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.9rem" }}>
            <button
              onClick={() => setReportSource("crs_pull")}
              style={{
                textAlign: "left", position: "relative", padding: "1.25rem",
                background: reportSource === "crs_pull" ? "var(--gold-dim)" : "var(--card)",
                border: reportSource === "crs_pull" ? "1.5px solid var(--gold)" : "1px solid var(--border)",
                borderRadius: "var(--radius-card)", cursor: "pointer",
              }}
            >
              <span style={{ position: "absolute", top: "-0.55rem", left: "0.9rem", background: "var(--gold)", color: "#FFFFFF", fontFamily: "var(--font-mono), monospace", fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0.15rem 0.5rem", borderRadius: "0.25rem", fontWeight: 700 }}>
                Recommended
              </span>
              <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginBottom: "0.5rem" }}>
                <FileText size={18} style={{ color: "var(--gold)" }} />
                <span style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.95rem" }}>Pull it for me — included</span>
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                We order your report directly from the registry and email it to you within one business day. Included in your price — no extra charge, no second checkout.
              </div>
            </button>

            <button
              onClick={() => setReportSource("customer_upload")}
              style={{
                textAlign: "left", padding: "1.25rem",
                background: reportSource === "customer_upload" ? "var(--gold-dim)" : "var(--card)",
                border: reportSource === "customer_upload" ? "1.5px solid var(--gold)" : "1px solid var(--border)",
                borderRadius: "var(--radius-card)", cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", marginBottom: "0.5rem" }}>
                <BookOpen size={18} style={{ color: "var(--gold)" }} />
                <span style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.95rem" }}>I have a recent report</span>
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                Dated within the last 30 days? After checkout, reply to your order confirmation with the PDF attached. Older than 30 days, and we&apos;ll pull a fresh one for you instead — still included.
              </div>
            </button>
          </div>
          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.75rem", marginTop: "1rem" }}>
            Either way, you receive and keep the report.
          </p>
        </div>
      )}

      {/* ───────────── STEP 3 · REVIEW & PAY ───────────── */}
      {step === 3 && pick && tier && (
        <div className="step-enter">
          {/* Path choice */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.9rem", marginBottom: "1.1rem" }}>
            <button
              onClick={() => selfOk && setPath("self")}
              disabled={!selfOk}
              style={{
                textAlign: "left", padding: "1.25rem",
                background: effPath === "self" ? "var(--gold-dim)" : "var(--card)",
                border: effPath === "self" ? "1.5px solid var(--gold)" : "1px solid var(--border)",
                borderRadius: "var(--radius-card)", cursor: selfOk ? "pointer" : "not-allowed",
                opacity: selfOk ? 1 : 0.55,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
                <span style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.95rem" }}>Self-serve online</span>
                <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.25rem", fontWeight: 700, color: "var(--text)" }}>{formatCents(prices[tier.key].self)}</span>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                {selfOk
                  ? "A guided interview (about 20 minutes) collects the few details no registry records. Your book assembles the moment you finish, with a clear checklist of who signs what."
                  : `Not available for ${pick.jurisdiction} corporations yet. ${SELF_SERVE_NOTE}`}
              </div>
            </button>
            <button
              onClick={() => setPath("crs")}
              style={{
                textAlign: "left", padding: "1.25rem",
                background: effPath === "crs" ? "var(--gold-dim)" : "var(--card)",
                border: effPath === "crs" ? "1.5px solid var(--gold)" : "1px solid var(--border)",
                borderRadius: "var(--radius-card)", cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.4rem" }}>
                <span style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.95rem" }}>Built by CRS</span>
                <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.25rem", fontWeight: 700, color: "var(--text)" }}>{formatCents(prices[tier.key].crs)}</span>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                One 15-minute call — we ask, you answer. Our specialists build and quality-check your signature-ready book, typically delivered within 2 business days.
              </div>
            </button>
          </div>

          {/* Order summary */}
          <div style={{ ...cardStyle, border: "1px solid var(--gold)", padding: "1.5rem 1.75rem", marginBottom: "1.1rem" }}>
            <div className="card-heading" style={{ fontSize: "1.05rem", marginBottom: "0.2rem" }}>Your order</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginBottom: "0.9rem" }}>
              {pick.name} · {pick.registryId || "—"} · {pick.jurisdiction}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", borderTop: "1px solid var(--border)", paddingTop: "0.85rem", fontSize: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Corporate Profile Report (current)</span>
                <span style={{ color: "var(--secondary)", fontWeight: 600 }}>Included</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Minute Book — {tier.label} · {effPath === "crs" ? "Built by CRS" : "Self-serve"}</span>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{formatCents(prices[tier.key][effPath])}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Every register, resolution &amp; certificate</span>
                <span style={{ color: "var(--secondary)", fontWeight: 600 }}>Included</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Signature &amp; completion checklist</span>
                <span style={{ color: "var(--secondary)", fontWeight: 600 }}>Included</span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid var(--gold)", marginTop: "0.85rem", paddingTop: "0.85rem" }}>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>Total</span>
              <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.6rem", fontWeight: 700, color: "var(--text)" }}>
                {formatCents(prices[tier.key][effPath])} <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 400 }}>+ tax, CAD</span>
              </span>
            </div>
          </div>

          {/* Guarantee */}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", padding: "1rem 1.25rem", background: "rgba(42,125,143,0.08)", border: "1px solid var(--secondary)", borderRadius: "0.6rem", marginBottom: "1.1rem" }}>
            <ShieldCheck size={20} style={{ color: "var(--secondary)", flexShrink: 0, marginTop: "0.1rem" }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)", marginBottom: "0.2rem" }}>The Complete-Book Guarantee</div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.65 }}>{MINUTE_BOOK_COPY.guarantee}</div>
            </div>
          </div>

          {payErr && (
            <div style={{ padding: "0.75rem 1rem", borderRadius: "0.5rem", background: "rgba(180,83,9,0.08)", color: "#B45309", fontSize: "0.85rem", marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <AlertCircle size={16} style={{ marginTop: "0.1rem", flexShrink: 0 }} />
              <span>{payErr}</span>
            </div>
          )}

          <PaymentStepChatNudge />
          <button
            onClick={goToPayment}
            disabled={paying}
            style={{ width: "100%", padding: "0.85rem 1rem", background: "var(--primary)", color: "#FFFFFF", fontWeight: 700, fontSize: "1rem", border: "none", borderRadius: "0.5rem", cursor: paying ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
          >
            {paying ? <><Loader2 size={16} className="crs-spin" /> Redirecting to secure payment…</> : <>Pay {formatCents(prices[tier.key][effPath])} + tax securely <ArrowRight size={16} /></>}
          </button>
          <p style={{ color: "var(--text-muted)", fontSize: "0.72rem", textAlign: "center", marginTop: "0.75rem" }}>
            Card processed securely by Stripe. {MINUTE_BOOK_COPY.deliveryPromise}
          </p>

          <ETransferCapture
            service="minute-book"
            serviceLabel={`${MINUTE_BOOK_COPY.productName} — ${tier.label} (${effPath === "crs" ? "Built by CRS" : "Self-serve"})`}
            priceLabel={`${formatCents(prices[tier.key][effPath])} + tax`}
            priceCents={prices[tier.key][effPath]}
            company={{
              name:           pick.name,
              registryId:     pick.registryId,
              businessNumber: pick.businessNumber,
              jurisdiction:   pick.jurisdiction,
              provinceKey:    pick.provinceKey,
            }}
            contact={contact}
            src={attributionSrc}
          />
        </div>
      )}

      {/* Nav */}
      {step < 3 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.5rem" }}>
          {step > 0 ? (
            <button onClick={() => setStep(step - 1)} style={{ padding: "0.7rem 1.2rem", background: "none", border: "1px solid var(--border)", borderRadius: "0.5rem", color: "var(--text-muted)", fontSize: "0.9rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
              <ArrowLeft size={15} /> Back
            </button>
          ) : <span />}
          <button
            onClick={() => canContinue && setStep(step + 1)}
            disabled={!canContinue}
            style={{ padding: "0.7rem 1.6rem", background: canContinue ? "var(--primary)" : "var(--border)", color: "#FFFFFF", fontWeight: 600, fontSize: "0.9rem", border: "none", borderRadius: "0.5rem", cursor: canContinue ? "pointer" : "not-allowed", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            Continue <ArrowRight size={15} />
          </button>
        </div>
      )}
      {step === 0 && !pick && (
        <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", textAlign: "center", marginTop: "1.25rem" }}>
          No payment yet — your exact price appears the moment you pick your corporation.
        </p>
      )}
    </div>
  );
}
