"use client";

import { useState } from "react";
import { Search, CheckCircle2, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { calculateAnnualReturnDeadline, type DueStatus } from "@/lib/annual-return-deadlines";

/**
 * Inline "look up your company + order right here" widget dropped into
 * article pages so high-intent visitors don't have to click through to a
 * separate order page. Two supported services for now — annual return and
 * profile report — the two article families with real GSC impressions.
 *
 * Deliberately simpler than the dedicated /order/* flows: no "what changed"
 * capture, no multi-year selector. If a visitor needs those, the article's
 * conversion strip below still deep-links to the full flow.
 */

type Service = "annual-return" | "profile-report";

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

const HEADLINES: Record<Service, { title: string; sub: string; priceLabel: string; buttonLabel: string; ctaSubline: string }> = {
  "annual-return": {
    title:      "Check your company's annual return status and due date",
    sub:        "Look up your Canadian corporation and file its annual return without leaving this page — $99 all-in + GST, filed within 24 hours.",
    priceLabel: "$99 all-in + GST",
    buttonLabel: "Pay $99 + GST and file",
    ctaSubline: "Government fee included. Filed within 24 hours.",
  },
  "profile-report": {
    title:      "Check if your company is active and order a profile report",
    sub:        "Look up your Canadian corporation and get its official profile report — $49 all-in + GST, delivered as a PDF within one business hour.",
    priceLabel: "$49 all-in + GST",
    buttonLabel: "Pay $49 + GST and order",
    ctaSubline: "Government fee included. Delivered by email within one business hour.",
  },
};

export default function InlineLookupOrder({
  service,
  provinceKey,
  srcTag,
}: {
  service:     Service;
  provinceKey: string | null;   // from inferServiceContext.jurisdictionKey
  srcTag:      string;          // e.g. "inline-article-how-to-file-...-alberta"
}) {
  const copy = HEADLINES[service];

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

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchErr("Enter at least 2 characters — a company name, Corporate Access Number, or Business Number.");
      return;
    }
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
      if (!hits.length) setSearchErr("No matching records. Try the exact registered name, or scroll down to search all of Canada.");
    } catch {
      setSearchErr("Search is temporarily unavailable. Please try again.");
      setResults([]);
      trackSearch(q, provinceKey ?? "all", 0);
    } finally {
      setSearching(false);
    }
  };

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
              service: "profile-report",
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
      style={{
        margin:       "0 0 2rem",
        border:       "1px solid var(--border)",
        borderLeft:   "4px solid var(--gold)",
        borderRadius: "0.75rem",
        background:   "var(--card)",
        padding:      "1.25rem 1.5rem",
      }}
    >
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
        Do it right here · {copy.priceLabel}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display), Georgia, serif",
          fontSize:   "1.15rem",
          fontWeight: 700,
          color:      "var(--text)",
          margin:     "0.35rem 0 0.5rem",
          lineHeight: 1.3,
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
              onClick={runSearch}
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

          {results.length > 0 && (
            <div style={{ marginTop: "0.85rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {results.slice(0, 3).map((hit, i) => (
                <ResultCard
                  key={`${hit.provinceKey}-${hit.registryId}-${i}`}
                  hit={hit}
                  service={service}
                  onSelect={() => setPick(hit)}
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
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.95rem" }}>{pick.name}</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.76rem", marginTop: "0.15rem" }}>
                  {pick.jurisdiction} · {pick.registryId || "—"} · {pick.status}{pick.entityType ? ` · ${pick.entityType}` : ""}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPick(null)}
              style={{ marginTop: "0.4rem", background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.72rem", cursor: "pointer", padding: 0 }}
            >
              ← Pick a different company
            </button>
          </div>

          {service === "profile-report" && pick.status !== "Active" && (
            <div style={{ padding: "0.6rem 0.85rem", background: "rgba(180,83,9,0.08)", color: "#B45309", fontSize: "0.78rem", borderRadius: "0.4rem", marginBottom: "0.75rem" }}>
              Heads-up — this corporation is not currently active. The profile report will reflect its actual registry status.
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

  const buttonLabel = isAnnualReturn ? "File Annual Return" : "Order Profile Report";

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
          <div style={{ color: "var(--text-muted)", fontSize: "0.73rem", marginTop: "0.15rem" }}>
            {hit.jurisdiction} · {hit.registryId || "—"} · {hit.status}
          </div>
          {incorpLabel && (
            <div style={{ color: "var(--text-muted)", fontSize: "0.73rem", marginTop: "0.1rem" }}>
              Incorporated {incorpLabel}
            </div>
          )}
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

function StatusDot({ status }: { status: DueStatus }) {
  if (status === "overdue") {
    return <span className="crs-pulse-red" style={{ width: 8, height: 8, borderRadius: "50%", background: "#DC2626", flexShrink: 0 }} />;
  }
  const color = status === "due_soon" ? "#B45309" : status === "on_track" ? "#16A34A" : "var(--text-muted)";
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />;
}
