"use client";

import { useEffect, useRef, useState } from "react";
import { Search, CheckCircle2, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { calculateAnnualReturnDeadline, type DueStatus } from "@/lib/annual-return-deadlines";

/**
 * Inline "look up your company + order right here" widget dropped into
 * article + service pages so high-intent visitors don't have to click
 * through to a separate order page. Three supported services — annual
 * return, profile report, and certificate of good standing.
 *
 * Deliberately simpler than the dedicated /order/* flows: no "what changed"
 * capture, no multi-year selector. If a visitor needs those, the article's
 * conversion strip below still deep-links to the full flow.
 */

type Service = "annual-return" | "profile-report" | "good-standing";

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

/**
 * Copy is intentionally search-first: no price mentions in the eyebrow,
 * title, or sub until the visitor has picked a corporation. Price appears
 * with the "Pay $X + GST and file" button, once they've seen their own
 * corp name — that framing makes the number feel earned instead of
 * sticker-shock, and lets us capture their search intent even if they
 * bounce at price.
 */
const HEADLINES: Record<Service, { eyebrow: string; title: string; sub: string; buttonLabel: string; ctaSubline: string }> = {
  "annual-return": {
    eyebrow:    "File your annual return",
    title:      "Check your company's annual return status and due date",
    sub:        "Enter your company name, Corporate Access Number, or Business Number to see its status, due date, and file in one step.",
    buttonLabel: "Pay $99 + GST and file",
    ctaSubline: "Government fee included. Filed within 24 hours.",
  },
  "profile-report": {
    eyebrow:    "Order a profile report",
    title:      "Check if your company is active and order a profile report",
    sub:        "Enter your company name, Corporate Access Number, or Business Number to see its registry status and order its official profile report.",
    buttonLabel: "Pay $49 + GST and order",
    ctaSubline: "Government fee included. Delivered by email within one business hour.",
  },
  "good-standing": {
    eyebrow:    "Order a Certificate of Good Standing",
    title:      "Look up your company and order its Certificate of Good Standing",
    sub:        "Enter your company name, Corporate Access Number, or Business Number to confirm the corporation is active and order its government-issued Certificate of Good Standing.",
    buttonLabel: "Pay $79 + GST and order",
    ctaSubline: "Government fee included. Delivered by email within hours.",
  },
};

export type InlineUrgency = {
  headline: string;
  body:     string;
};

export default function InlineLookupOrder({
  service,
  provinceKey,
  srcTag,
  urgency,
  eyebrowOverride,
  titleOverride,
  subOverride,
}: {
  service:     Service;
  provinceKey: string | null;   // from inferServiceContext.jurisdictionKey
  srcTag:      string;          // e.g. "inline-article-how-to-file-...-alberta"
  urgency?:    InlineUrgency | null; // subtle deadline reminder inside the card
  eyebrowOverride?: string | null;   // per-article mono chip override
  titleOverride?:   string | null;   // per-article headline override
  subOverride?:     string | null;   // per-article sub-line override
}) {
  const base = HEADLINES[service];
  const copy = {
    ...base,
    eyebrow: eyebrowOverride ?? base.eyebrow,
    title:   titleOverride   ?? base.title,
    sub:     subOverride     ?? base.sub,
  };

  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState<RegistryHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");

  const [pick, setPick]           = useState<RegistryHit | null>(null);
  const [contact, setContact]     = useState({ name: "", email: "", phone: "" });
  const [hasChanges, setHasChanges]   = useState(false);
  const [changesNote, setChangesNote] = useState("");
  const [paying, setPaying]       = useState(false);
  const [payErr, setPayErr]       = useState("");

  /** Fire the same search tracking beacon the standalone CompanySearch uses.
      Feeds the admin dashboard's "search intent" section regardless of
      whether the visitor eventually pays. */
  function trackSearch(q: string, prov: string, resultCount: number) {
    try {
      const sessionId = document.cookie.match(/(?:^|; )crs_session_id=([^;]+)/)?.[1] ?? "";
      if (!sessionId || q.trim().length < 2) return;
      const body = JSON.stringify({
        type:        "search",
        query:       q.trim(),
        province:    prov,
        resultCount,
        path:        window.location.pathname,
        sessionId:   decodeURIComponent(sessionId),
      });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    } catch { /* analytics never breaks UX */ }
  }

  /** Track the last query we actually fired so we don't re-request when a
      user types then clicks Find with the same value already in-flight. */
  const lastFiredRef = useRef<string>("");

  const runSearch = async (opts?: { silent?: boolean }) => {
    const q = query.trim();
    if (q.length < 2) {
      if (!opts?.silent) {
        setSearchErr("Enter at least 2 characters — a company name, Corporate Access Number, or Business Number.");
      }
      return;
    }
    lastFiredRef.current = q;
    setSearchErr("");
    setSearching(true);
    setPick(null);
    try {
      const prov = provinceKey ?? "all";
      const res  = await fetch(`/api/company-search?q=${encodeURIComponent(q)}&province=${prov}`);
      const data = await res.json();
      const hits: RegistryHit[] = data.results ?? [];
      setResults(hits);
      trackSearch(q, prov, data.total ?? hits.length);
      // Silent (debounced) fires don't surface the "no matches" copy — that
      // fires only when the user explicitly clicks Find, so we're not
      // chastising them mid-type when they're still assembling the query.
      if (!hits.length && !opts?.silent) {
        setSearchErr("No matching records. Try the exact registered name, or scroll down to search all of Canada.");
      }
    } catch {
      if (!opts?.silent) {
        setSearchErr("Search is temporarily unavailable. Please try again.");
      }
      setResults([]);
      trackSearch(q, provinceKey ?? "all", 0);
    } finally {
      setSearching(false);
    }
  };

  /** Debounced auto-search matches the standalone /canada-corporations-search
      UX — the visitor doesn't have to hit Find; results start appearing 450ms
      after they stop typing. Skipped once they've picked a company (the
      picked-company confirm panel takes over) and once the query is too
      short. */
  useEffect(() => {
    if (pick) return;                          // frozen once a company is picked
    const q = query.trim();
    if (q.length < 2) return;                  // wait for a real query
    if (q === lastFiredRef.current) return;    // avoid re-firing the same query
    const t = setTimeout(() => { void runSearch({ silent: true }); }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, pick]);

  const canPay =
    !!pick &&
    !!contact.name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) &&
    !!contact.phone.trim();

  const submit = async () => {
    if (!pick || !canPay) return;
    setPayErr("");
    setPaying(true);
    try {
      // annual-return has its own dedicated endpoint (multi-year, changes
      // payload). profile-report and good-standing share /api/order/report
      // and are differentiated by the `service` field in the body.
      const endpoint = service === "annual-return" ? "/api/order/annual-return" : "/api/order/report";
      const body =
        service === "annual-return"
          ? {
              hit:     pick,
              years:   1,
              // Only 'other' is captured inline — structured director /
              // shareholder / address changes stay on the full /order flow.
              // The customer's freeform note flows into the fulfillment
              // email so the CRS team files with the correct updates.
              changes: {
                directors: [], shareholders: [],
                registeredAddress: { changed: false, newAddress: "", effectiveDate: "" },
                recordsAddress:    { changed: false, newAddress: "", effectiveDate: "" },
                authorizedAgent:   { changed: false, newAgent:    "", effectiveDate: "" },
                other:             hasChanges ? changesNote.trim() : "",
              },
              contact,
              src: srcTag,
            }
          : {
              service, // "profile-report" | "good-standing"
              hit:     pick,
              contact,
              src:     srcTag,
            };
      const res = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
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
    <div
      id="crs-inline-lookup"
      style={{
        margin:       "0 0 2rem",
        border:       "1px solid var(--border)",
        borderLeft:   "4px solid var(--gold)",
        borderRadius: "var(--radius-card)",
        background:   "var(--card)",
        padding:      "1.5rem 1.75rem",
        boxShadow:    "var(--shadow-card)",
        scrollMarginTop: "100px",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
        {copy.eyebrow}
      </div>
      <div
        className="card-heading"
        style={{
          fontSize:   "1.18rem",
          margin:     "0.35rem 0 0.5rem",
        }}
      >
        {copy.title}
      </div>
      <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0 0 1rem", lineHeight: 1.55 }}>
        {copy.sub}
      </p>

      {/* Search input */}
      {!pick && (
        <>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
              placeholder="Company name, Corporate Access Number, or Business Number"
              style={{
                flex:        "3 1 260px",
                padding:     "0.65rem 0.85rem",
                border:      "1px solid var(--border)",
                borderRadius: "0.5rem",
                fontSize:    "0.9rem",
                background:  "var(--bg)",
                color:       "var(--text)",
              }}
            />
            <button
              onClick={() => { void runSearch(); }}
              disabled={searching}
              style={{
                flex:        "0 0 auto",
                padding:     "0.65rem 1.1rem",
                background:  "var(--primary)",
                color:       "#FFFFFF",
                fontWeight:  600,
                fontSize:    "0.9rem",
                border:      "none",
                borderRadius: "0.5rem",
                cursor:      searching ? "wait" : "pointer",
                display:     "inline-flex",
                alignItems:  "center",
                gap:         "0.4rem",
              }}
            >
              {searching ? <Loader2 size={14} className="crs-spin" /> : <Search size={14} />} Find
            </button>
          </div>
          {searchErr && <p style={{ color: "#B45309", fontSize: "0.8rem", margin: "0.5rem 0 0" }}>{searchErr}</p>}

          {urgency && results.length === 0 && (
            <div
              style={{
                marginTop:    "0.85rem",
                paddingTop:   "0.75rem",
                borderTop:    "1px dashed var(--border)",
                fontSize:     "0.76rem",
                lineHeight:   1.55,
                color:        "var(--text-muted)",
              }}
            >
              <span style={{ color: "#B45309", fontWeight: 600 }}>{urgency.headline}</span>{" "}
              {urgency.body}
            </div>
          )}

          {results.length > 0 && (
            <div style={{ marginTop: "0.85rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {results.slice(0, 3).map((hit, i) => (
                <ResultCard
                  key={`${hit.provinceKey}-${hit.registryId}-${i}`}
                  hit={hit}
                  service={service}
                  onSelect={() => {
                    /* Alberta corps go straight to the enriched profile page —
                       it owns the CTA + shows live status + history, no reason
                       to duplicate the mini form. Other provinces still get
                       the inline mini-form flow. */
                    if (hit.provinceKey === "ab" && hit.registryId) {
                      window.location.href = `/corporation/${hit.registryId}?src=article-${srcTag}`;
                      return;
                    }
                    setPick(hit);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Picked-company confirm + mini order form */}
      {pick && (
        <>
          <div
            style={{
              padding:      "0.85rem 1rem",
              background:   "var(--bg-deep)",
              border:       "1px solid var(--gold)",
              borderRadius: "0.5rem",
              marginBottom: "0.85rem",
            }}
          >
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <CheckCircle2 size={18} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.15rem" }} />
              <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.95rem" }}>{pick.name}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.35rem" }}>
                  <MetaPill label="Registry ID"    value={pick.registryId}     tone="teal"  />
                  <MetaPill label="Business #"     value={pick.businessNumber} tone="slate" />
                  <MetaPill label="Type"           value={pick.entityType}     tone="gold"  />
                  <MetaPill label="Jurisdiction"   value={pick.jurisdiction}   tone="navy"  />
                </div>
              </div>
            </div>
            {/* Alberta corps skip this panel entirely — the ResultCard onSelect
                redirects them to /corporation/[slug] directly. So this panel
                only renders for non-Alberta jurisdictions where the mini-form
                order flow is still the fastest path. */}
            <button
              type="button"
              onClick={() => setPick(null)}
              style={{ marginTop: "0.4rem", background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.72rem", cursor: "pointer", padding: 0, display: "block" }}
            >
              ← Pick a different company
            </button>
          </div>

          {service === "profile-report" && pick.status !== "Active" && (
            <div style={{ padding: "0.6rem 0.85rem", background: "rgba(180,83,9,0.08)", color: "#B45309", fontSize: "0.78rem", borderRadius: "0.4rem", marginBottom: "0.75rem" }}>
              Heads-up — this corporation is not currently active. The profile report will reflect its actual registry status.
            </div>
          )}

          {service === "good-standing" && pick.status !== "Active" && (
            <div style={{ padding: "0.6rem 0.85rem", background: "rgba(180,83,9,0.08)", color: "#B45309", fontSize: "0.78rem", borderRadius: "0.4rem", marginBottom: "0.75rem" }}>
              Heads-up — this corporation is not currently active. The registry generally will not issue a Certificate of Good Standing for an inactive corporation. Consider filing missing annual returns first, or order a Corporate Profile Report instead to see the current status.
            </div>
          )}

          {/* Contact form */}
          {[
            { key: "name",  label: "Full name",  type: "text",  placeholder: "Jane Doe" },
            { key: "email", label: "Email",      type: "email", placeholder: "jane@company.ca" },
            { key: "phone", label: "Phone",      type: "tel",   placeholder: "(403) 555-0123" },
          ].map(({ key, label, type, placeholder }) => (
            <div key={key} style={{ marginBottom: "0.55rem" }}>
              <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.2rem" }}>
                {label}
              </label>
              <input
                type={type}
                value={contact[key as keyof typeof contact]}
                onChange={(e) => setContact({ ...contact, [key]: e.target.value })}
                placeholder={placeholder}
                style={{
                  width:        "100%",
                  padding:      "0.55rem 0.8rem",
                  border:       "1px solid var(--border)",
                  borderRadius: "0.4rem",
                  fontSize:     "0.88rem",
                  background:   "var(--bg)",
                  color:        "var(--text)",
                }}
              />
            </div>
          ))}

          {/* Optional 'any changes?' capture — only for annual return.
              Skips the full structured director / address form (that
              stays on the dedicated /order/annual-return page); a
              freeform note is enough for the fulfillment team to know
              they need to follow up before filing. */}
          {service === "annual-return" && (
            <div style={{ marginTop: "0.5rem", padding: "0.55rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.4rem", background: "var(--bg-deep)" }}>
              <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={hasChanges}
                  onChange={(e) => setHasChanges(e.target.checked)}
                  style={{ marginTop: "0.2rem" }}
                />
                <span style={{ fontSize: "0.82rem", color: "var(--text)" }}>
                  <strong>Anything changed since last year?</strong>{" "}
                  <span style={{ color: "var(--text-muted)" }}>Directors, registered address, share structure — anything the registry should be updated with.</span>
                </span>
              </label>
              {hasChanges && (
                <textarea
                  value={changesNote}
                  onChange={(e) => setChangesNote(e.target.value)}
                  rows={3}
                  placeholder="e.g. Jane Doe resigned Oct 1, 2025. John Smith appointed Oct 15, 2025. New registered office: 123 Main St, Calgary AB T2P 1J9."
                  style={{
                    width:        "100%",
                    marginTop:    "0.5rem",
                    padding:      "0.5rem 0.7rem",
                    border:       "1px solid var(--border)",
                    borderRadius: "0.4rem",
                    fontSize:     "0.82rem",
                    background:   "var(--bg)",
                    color:        "var(--text)",
                    fontFamily:   "inherit",
                    resize:       "vertical",
                  }}
                />
              )}
            </div>
          )}

          {payErr && (
            <div style={{ padding: "0.55rem 0.8rem", background: "rgba(180,83,9,0.08)", color: "#B45309", fontSize: "0.8rem", borderRadius: "0.4rem", marginTop: "0.6rem", display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
              <AlertCircle size={14} style={{ marginTop: "0.1rem", flexShrink: 0 }} />
              <span>{payErr}</span>
            </div>
          )}

          <button
            onClick={submit}
            disabled={!canPay || paying}
            style={{
              width:        "100%",
              marginTop:    "0.85rem",
              padding:      "0.8rem 1rem",
              background:   canPay ? "var(--primary)" : "var(--border)",
              color:        "#FFFFFF",
              fontWeight:   700,
              fontSize:     "0.95rem",
              border:       "none",
              borderRadius: "0.5rem",
              cursor:       canPay && !paying ? "pointer" : "not-allowed",
              display:      "inline-flex",
              alignItems:   "center",
              justifyContent: "center",
              gap:          "0.5rem",
            }}
          >
            {paying ? (
              <><Loader2 size={16} className="crs-spin" /> Redirecting to secure payment…</>
            ) : (
              <>{copy.buttonLabel} <ArrowRight size={16} /></>
            )}
          </button>
          <p style={{ color: "var(--text-muted)", fontSize: "0.7rem", textAlign: "center", marginTop: "0.55rem" }}>
            Card processed securely by Stripe. {copy.ctaSubline}
          </p>
        </>
      )}
    </div>
  );
}

/* ─────────────────────── Enriched result card ─────────────────────── */

function ResultCard({
  hit,
  service,
  onSelect,
}: {
  hit:     RegistryHit;
  service: Service;
  onSelect: () => void;
}) {
  const isAnnualReturn = service === "annual-return";
  const deadline = isAnnualReturn
    ? calculateAnnualReturnDeadline(hit.registrationDate, hit.provinceKey)
    : null;

  const incorpLabel = hit.registrationDate
    ? new Date(hit.registrationDate).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const buttonLabel =
    service === "annual-return"  ? "File Annual Return" :
    service === "good-standing"  ? "Order Certificate" :
                                   "Order Profile Report";

  return (
    <div
      style={{
        background:   "var(--bg-deep)",
        border:       `1px solid ${deadline?.status === "overdue" ? "rgba(220, 38, 38, 0.55)" : "var(--border)"}`,
        borderRadius: "0.5rem",
        padding:      "0.75rem 0.9rem",
        display:      "flex",
        flexDirection: "column",
        gap:          "0.35rem",
      }}
    >
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.92rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {hit.name}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.35rem" }}>
            <MetaPill label="Registry ID"  value={hit.registryId}     tone="teal"  />
            <MetaPill label="Business #"   value={hit.businessNumber} tone="slate" />
            <MetaPill label="Type"         value={hit.entityType}     tone="gold"  />
            <MetaPill label="Jurisdiction" value={hit.jurisdiction}   tone="navy"  />
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.73rem", marginTop: "0.4rem" }}>
            {incorpLabel ? `Incorporated ${incorpLabel} · ` : ""}Status: {hit.status}
          </div>
          {deadline && deadline.status !== "unknown" && (
            <div
              style={{
                fontSize:    "0.78rem",
                marginTop:   "0.35rem",
                display:     "flex",
                alignItems:  "center",
                gap:         "0.45rem",
                color:       deadlineColorText(deadline.status),
                fontWeight:  deadline.status === "overdue" ? 700 : 500,
              }}
            >
              <StatusDot status={deadline.status} />
              <span>{deadline.label}</span>
            </div>
          )}
          {deadline?.explanation && deadline.status !== "unknown" && (
            <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
              {deadline.explanation}
            </div>
          )}
          {deadline && deadline.status === "unknown" && (
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.35rem", fontStyle: "italic" }}>
              {deadline.label}
            </div>
          )}
        </div>
        <button
          onClick={onSelect}
          style={{
            flexShrink:   0,
            padding:      "0.5rem 0.85rem",
            background:   "var(--primary)",
            color:        "#FFFFFF",
            fontWeight:   700,
            fontSize:     "0.78rem",
            border:       "none",
            borderRadius: "0.4rem",
            cursor:       "pointer",
            display:      "inline-flex",
            alignItems:   "center",
            gap:          "0.3rem",
            whiteSpace:   "nowrap",
            alignSelf:    "flex-start",
          }}
        >
          {buttonLabel} <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

function deadlineColorText(status: DueStatus): string {
  if (status === "overdue")  return "#B91C1C";
  if (status === "due_soon") return "#B45309";
  if (status === "on_track") return "var(--text)";
  return "var(--text-muted)";
}

type PillTone = "teal" | "gold" | "navy" | "slate";
const PILL_TONES: Record<PillTone, { bg: string; color: string; border: string }> = {
  teal:  { bg: "rgba(42,125,143,0.10)", color: "var(--secondary)", border: "rgba(42,125,143,0.35)" },
  gold:  { bg: "var(--gold-dim)",       color: "var(--gold)",      border: "rgba(249,172,0,0.45)"  },
  navy:  { bg: "rgba(0,61,91,0.08)",    color: "var(--primary)",   border: "rgba(0,61,91,0.25)"    },
  slate: { bg: "rgba(100,116,139,0.10)", color: "#475569",         border: "rgba(100,116,139,0.35)" },
};

function MetaPill({ label, value, tone }: { label: string; value: string; tone: PillTone }) {
  if (!value || value === "—") return null;
  const t = PILL_TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: "0.3rem",
        padding: "0.18rem 0.5rem",
        borderRadius: "9999px",
        background: t.bg,
        border: `1px solid ${t.border}`,
        fontFamily: "var(--font-mono), monospace",
        fontSize: "0.66rem",
        lineHeight: 1.4,
      }}
    >
      <span style={{ color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "0.58rem" }}>
        {label}
      </span>
      <span style={{ color: t.color, fontWeight: 700 }}>
        {value}
      </span>
    </span>
  );
}

function StatusDot({ status }: { status: DueStatus }) {
  if (status === "overdue") {
    return <span className="crs-pulse-red" style={{ width: 8, height: 8, borderRadius: "50%", background: "#DC2626", flexShrink: 0 }} />;
  }
  const color = status === "due_soon" ? "#B45309" : status === "on_track" ? "#16A34A" : "var(--text-muted)";
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}
