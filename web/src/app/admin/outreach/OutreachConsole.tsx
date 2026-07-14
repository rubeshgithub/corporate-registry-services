"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Send, Loader2, X, CheckCircle2, AlertCircle, Copy, Mail, ExternalLink } from "lucide-react";

/**
 * Admin outreach console.
 *
 *   Left column: company search + results table.
 *   Right drawer: template picker + recipient fields + live preview + send.
 *   Below: last-20 sent log.
 *
 * Everything server-authoritative — the preview renders on the server so we
 * can't drift from what the send endpoint actually sends. The UI just wires
 * the fields together.
 */

type Result = {
  name:             string;
  businessNumber:   string;
  registryId:       string;
  location:         string;
  status:           string;
  statusNotes:      string;
  entityType:       string;
  registrationDate: string;
  jurisdiction:     string;
  provinceKey:      string;
};

type Service =
  | "annual-return"
  | "profile-report"
  | "good-standing"
  | "dissolution"
  | "revival"
  | "general";

const SERVICES: Array<{ key: Service; label: string }> = [
  { key: "annual-return",  label: "Annual Return — filing reminder" },
  { key: "general",        label: "General — intro to CRS services (multi-CTA)" },
  { key: "profile-report", label: "Corporate Profile Report" },
  { key: "good-standing",  label: "Certificate of Good Standing" },
  { key: "dissolution",    label: "Voluntary Dissolution" },
  { key: "revival",        label: "Corporate Revival" },
];

const REGISTRIES = [
  { key: "all",     label: "All provinces" },
  { key: "bc",      label: "British Columbia" },
  { key: "ab",      label: "Alberta" },
  { key: "on",      label: "Ontario" },
  { key: "federal", label: "Federal" },
  { key: "mb",      label: "Manitoba" },
  { key: "sk",      label: "Saskatchewan" },
  { key: "ns",      label: "Nova Scotia" },
  { key: "nb",      label: "New Brunswick" },
  { key: "nl",      label: "Newfoundland" },
  { key: "pe",      label: "Prince Edward Island" },
  { key: "nt",      label: "NWT" },
  { key: "yt",      label: "Yukon" },
  { key: "nu",      label: "Nunavut" },
];

type SentRow = {
  tokenId:         string;
  service:         string;
  companyName:     string;
  registryId:      string;
  to:              string[];
  subject:         string;
  sentAt:          string;
  clickCount:      number;
  firstClickAt:    string | null;
  convertedAt:     string | null;
  ackFiled:        string | null;
  clickedServices: string[];
};

type EnrichmentPayload = {
  email:          string | null;
  emailSourceUrl: string | null;
  website:        string | null;
  phone:          string | null;
  enrichedAt:     string;
  enrichStatus:   "found" | "phone_or_web_only" | "not_found" | "skip_numbered" | "pending";
};

type PlaceCandidate = {
  displayName:      string;
  formattedAddress: string;
  phone:            string | null;
  website:          string | null;
  similarity:       number;
};

type EnrichmentState =
  | { mode: "idle" }
  | { mode: "loading" }
  | { mode: "candidates"; candidates: PlaceCandidate[] }
  | { mode: "picking";    candidates: PlaceCandidate[]; picking: PlaceCandidate }
  | { mode: "resolved";   contact: EnrichmentPayload; note?: string }
  | { mode: "error";      message: string };

export default function OutreachConsole() {
  /* ── Search state ──────────────────────────────────────────── */
  const [query, setQuery]       = useState("");
  const [province, setProvince] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pending" | "struck">("all");
  const [results, setResults]   = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [pick, setPick] = useState<Result | null>(null);

  /* ── Draft state ───────────────────────────────────────────── */
  const [service, setService]           = useState<Service>("annual-return");
  const [to, setTo]                     = useState("");
  const [cc, setCc]                     = useState("");
  const [bcc, setBcc]                   = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [campaignId, setCampaignId]     = useState("");
  const [customIntro, setCustomIntro]   = useState("");
  const [subject, setSubject]           = useState("");
  const [subjectTouched, setSubjectTouched] = useState(false);

  /* ── Preview state ─────────────────────────────────────────── */
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  /* ── Send state ────────────────────────────────────────────── */
  const [sending, setSending]     = useState(false);
  const [sendErr, setSendErr]     = useState("");
  const [sentOk, setSentOk]       = useState<{ token: string; landingUrl: string } | null>(null);

  /* ── Sent log ──────────────────────────────────────────────── */
  const [sent, setSent]           = useState<SentRow[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  /* ── Enrichment state — three-mode: candidates list, resolved pick, or loading */
  const [enrich, setEnrich] = useState<EnrichmentState>({ mode: "idle" });

  const previewDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Search fetch ──────────────────────────────────────────── */
  const runSearch = useCallback(async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchErr("");
    try {
      const res  = await fetch(`/api/company-search?q=${encodeURIComponent(query)}&province=${province}&status=${statusFilter}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(data.results ?? []);
    } catch (e) {
      setSearchErr(e instanceof Error ? e.message : "Search failed.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query, province, statusFilter]);

  /* ── Sent log fetch ────────────────────────────────────────── */
  const refreshLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const res = await fetch("/api/admin/outreach/sends?limit=20");
      const data = await res.json();
      if (Array.isArray(data.rows)) setSent(data.rows);
    } catch { /* silent */ }
    finally { setLogLoading(false); }
  }, []);

  useEffect(() => { refreshLog(); }, [refreshLog]);

  /* ── Preview fetch (debounced on every relevant field change) ─ */
  useEffect(() => {
    if (!pick) { setPreviewHtml(""); setPreviewText(""); return; }
    if (previewDebounce.current) clearTimeout(previewDebounce.current);
    previewDebounce.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/admin/outreach/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            service,
            company: companyFromResult(pick),
            recipientEmail: firstEmail(to),
            recipientName,
            customIntro,
            subjectOverride: subjectTouched ? subject : undefined,
          }),
        });
        const data = await res.json();
        if (data.html) setPreviewHtml(data.html);
        if (data.text) setPreviewText(data.text);
        if (!subjectTouched && data.subject) setSubject(data.subject);
      } catch { /* preview failures fall through — user still sees stale content */ }
      finally { setPreviewLoading(false); }
    }, 300);
    return () => { if (previewDebounce.current) clearTimeout(previewDebounce.current); };
  }, [pick, service, recipientName, customIntro, subject, subjectTouched, to]);

  /* ── Draft helpers ─────────────────────────────────────────── */

  /** Fetches enrichment for a corp. Three-mode response:
   *   - cached    → we already have a picked+crawled contact, use it
   *   - candidates → operator picks the right business from Places results
   *   - picked    → operator's picked candidate got crawled + persisted */
  const fetchEnrichment = useCallback(async (r: Result, forceRefresh = false) => {
    setEnrich({ mode: "loading" });
    try {
      /* The company-search result's `location` field is a "City, Province"
         one-liner. Places wants the city on its own. */
      const city = (r.location.split(",")[0] || "").trim();
      const res = await fetch("/api/admin/outreach/enrich", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: r.name, city, corpNumber: r.registryId, forceRefresh }),
      });
      const data = await res.json();
      if (data.mode === "cached") {
        setEnrich({ mode: "resolved", contact: data.contact, note: data.note });
      } else if (data.mode === "candidates") {
        setEnrich({ mode: "candidates", candidates: data.candidates ?? [] });
      } else if (data.error) {
        setEnrich({ mode: "error", message: data.error });
      }
    } catch (e) {
      setEnrich({ mode: "error", message: e instanceof Error ? e.message : "Enrichment request failed." });
    }
  }, []);

  /** Operator picked a candidate — crawl its website for an email and persist. */
  const pickCandidate = useCallback(async (r: Result, candidate: PlaceCandidate) => {
    setEnrich((prev) => (prev.mode === "candidates"
      ? { mode: "picking", candidates: prev.candidates, picking: candidate }
      : { mode: "loading" }));
    try {
      const city = (r.location.split(",")[0] || "").trim();
      const res = await fetch("/api/admin/outreach/enrich", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: r.name, city, corpNumber: r.registryId, picked: candidate }),
      });
      const data = await res.json();
      if (data.contact) setEnrich({ mode: "resolved", contact: data.contact });
      else if (data.error) setEnrich({ mode: "error", message: data.error });
    } catch (e) {
      setEnrich({ mode: "error", message: e instanceof Error ? e.message : "Pick failed." });
    }
  }, []);

  const openDrafter = (r: Result) => {
    setPick(r);
    setSentOk(null);
    setSendErr("");
    setSubjectTouched(false);
    setSubject("");
    setCustomIntro("");
    setRecipientName("");
    // Leave To/CC/BCC as the operator entered them so the same batch can
    // reuse addresses when appropriate — reset only on explicit close.
    /* Fire enrichment in the background — the drawer renders immediately;
       the contact-info panel appears when this resolves. */
    void fetchEnrichment(r);
  };

  const closeDrafter = () => {
    setPick(null);
    setSubject("");
    setCustomIntro("");
    setSubjectTouched(false);
    setSentOk(null);
    setSendErr("");
    setEnrich({ mode: "idle" });
  };

  /* ── Send ──────────────────────────────────────────────────── */
  const submit = async () => {
    if (!pick) return;
    setSending(true);
    setSendErr("");
    setSentOk(null);
    try {
      const res = await fetch("/api/admin/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service,
          company:          companyFromResult(pick),
          to:               splitEmails(to),
          cc:               splitEmails(cc),
          bcc:              splitEmails(bcc),
          recipientName:    recipientName.trim() || undefined,
          campaignId:       campaignId.trim() || undefined,
          customIntro:      customIntro.trim() || undefined,
          subjectOverride:  subjectTouched ? subject : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSendErr(data.error || "Send failed.");
        return;
      }
      setSentOk({ token: data.token, landingUrl: data.landingUrl });
      refreshLog();
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setSending(false);
    }
  };

  const canSend = useMemo(() => {
    if (!pick) return false;
    const toList = splitEmails(to);
    if (!toList.length) return false;
    return toList.every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  }, [pick, to]);

  /* ── Render ────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", padding: "1.5rem" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <TopBar />

        {/* Search bar */}
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", padding: "1.25rem 1.5rem", boxShadow: "var(--shadow-card)", marginBottom: "1rem" }}>
          <form
            onSubmit={(e) => { e.preventDefault(); runSearch(); }}
            style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}
          >
            <div style={{ position: "relative", flex: "1 1 300px" }}>
              <Search size={16} style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search corporation by name, registry ID, or business number"
                className="field-input"
                style={{ paddingLeft: "2.4rem", height: "2.5rem" }}
                autoComplete="off"
              />
            </div>
            <select
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="field-input"
              style={{ width: "auto", flex: "0 0 200px", height: "2.5rem" }}
            >
              {REGISTRIES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
            <button type="submit" className="btn-primary" style={{ height: "2.5rem" }} disabled={searching}>
              {searching ? <Loader2 size={14} className="crs-spin" /> : <Search size={14} />}
              Search
            </button>
          </form>

          {/* Status filter chips */}
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.75rem", alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", fontWeight: 600, marginRight: "0.25rem" }}>
              Status:
            </span>
            {([
              { key: "all",     label: "All" },
              { key: "active",  label: "Active" },
              { key: "pending", label: "About to be struck" },
              { key: "struck",  label: "Struck / Dissolved" },
            ] as const).map(({ key, label }) => {
              const active = statusFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  style={{
                    padding: "0.28rem 0.75rem",
                    borderRadius: "9999px",
                    border: `1.5px solid ${active ? "var(--primary)" : "var(--border)"}`,
                    background: active ? "var(--primary)" : "var(--card)",
                    color: active ? "#FFFFFF" : "var(--text-muted)",
                    fontSize: "0.75rem",
                    fontFamily: "var(--font-mono), monospace",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition: "all 0.12s",
                  }}
                >
                  {label}
                </button>
              );
            })}
            {statusFilter !== "all" && (
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginLeft: "auto", fontStyle: "italic" }}>
                Filter applied after fetch — the upstream registry API caps at ~29 results per query, so unusual statuses may return few matches.
              </span>
            )}
          </div>

          {searchErr && (
            <p style={{ color: "#B45309", fontSize: "0.82rem", marginTop: "0.6rem", marginBottom: 0 }}>{searchErr}</p>
          )}
        </div>

        {/* Table + sent log always full-width; drawer is an overlay */}
        <ResultsTable
          results={results}
          onPick={openDrafter}
          activeId={pick?.registryId ?? null}
          hasQueried={query.trim().length >= 2}
          loading={searching}
          statusFilter={statusFilter}
        />
        <SentLog rows={sent} loading={logLoading} />
      </div>

      {pick && (
        <>
          {/* Dim backdrop — click to close, doesn't hide table content underneath */}
          <div
            onClick={closeDrafter}
            aria-hidden="true"
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0, 61, 91, 0.15)",
              zIndex: 40,
            }}
          />
          <aside
            role="dialog"
            aria-label="Draft outreach email"
            style={{
              position: "fixed",
              top: 0, right: 0, bottom: 0,
              width: "min(560px, 100vw)",
              background: "var(--card)",
              borderLeft: "1px solid var(--border)",
              boxShadow: "-8px 0 32px rgba(0, 61, 91, 0.18)",
              overflowY: "auto",
              zIndex: 50,
            }}
          >
            <Drafter
              pick={pick}
              service={service}
              setService={setService}
              to={to} setTo={setTo}
              cc={cc} setCc={setCc}
              bcc={bcc} setBcc={setBcc}
              recipientName={recipientName} setRecipientName={setRecipientName}
              campaignId={campaignId} setCampaignId={setCampaignId}
              subject={subject}
              setSubject={(v) => { setSubject(v); setSubjectTouched(true); }}
              customIntro={customIntro} setCustomIntro={setCustomIntro}
              previewHtml={previewHtml}
              previewText={previewText}
              previewLoading={previewLoading}
              onClose={closeDrafter}
              onSend={submit}
              sending={sending}
              sendErr={sendErr}
              sentOk={sentOk}
              canSend={canSend}
              enrich={enrich}
              onPickCandidate={(c) => pickCandidate(pick, c)}
              onRefreshEnrich={() => fetchEnrichment(pick, /* forceRefresh */ true)}
              onFillTo={(email) => setTo(email)}
            />
          </aside>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════ Sub-components ═══════════════════════════ */

function TopBar() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", marginBottom: "1.25rem" }}>
      <div>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
          CRS Admin
        </div>
        <h1 className="card-heading" style={{ fontSize: "1.6rem", margin: "0.2rem 0 0" }}>
          Outreach console
        </h1>
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0.35rem 0 0" }}>
          Search a corporation, pick a template, personalize, send. Each email carries a unique link that pre-fills the order flow.
        </p>
      </div>
      <div style={{ display: "flex", gap: "0.35rem" }}>
        <a href="/admin/analytics" style={tabLinkStyle}>Analytics</a>
        <span style={{ ...tabLinkStyle, background: "var(--primary)", color: "#fff", borderColor: "var(--primary)" }}>Outreach</span>
        <a href="/admin/search-performance" style={tabLinkStyle}>Search performance</a>
      </div>
    </div>
  );
}

const tabLinkStyle: React.CSSProperties = {
  padding:      "0.4rem 0.85rem",
  border:       "1px solid var(--border)",
  borderRadius: "0.4rem",
  fontSize:     "0.8rem",
  fontFamily:   "var(--font-mono), monospace",
  color:        "var(--text-muted)",
  background:   "var(--card)",
  textDecoration: "none",
};

function ResultsTable({
  results, onPick, activeId, hasQueried, loading, statusFilter,
}: {
  results: Result[]; onPick: (r: Result) => void; activeId: string | null; hasQueried: boolean; loading: boolean;
  statusFilter: "all" | "active" | "pending" | "struck";
}) {
  if (loading) {
    return <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)", background: "var(--card)", borderRadius: "var(--radius-card)", border: "1px solid var(--border)" }}>Searching…</div>;
  }
  if (!results.length && hasQueried) {
    const filterLabel =
      statusFilter === "active"  ? "Active"                :
      statusFilter === "pending" ? "About to be struck"    :
      statusFilter === "struck"  ? "Struck / Dissolved"    : "";
    return (
      <div style={{ padding: "2.5rem", textAlign: "center", color: "var(--text-muted)", background: "var(--card)", borderRadius: "var(--radius-card)", border: "1px solid var(--border)" }}>
        <div style={{ fontWeight: 600, marginBottom: "0.35rem", color: "var(--text)" }}>No matches.</div>
        {filterLabel && (
          <div style={{ fontSize: "0.82rem" }}>
            None of the top ~29 upstream results have the status <em>{filterLabel}</em>. Try widening the query or switching to <em>All</em>.
          </div>
        )}
      </div>
    );
  }
  if (!results.length) return null;

  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", overflow: "hidden", marginBottom: "1rem" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
          <thead>
            <tr style={{ background: "var(--bg-deep)" }}>
              {["Legal name", "Registry ID", "BN", "Incorp", "Juris.", "Status", "Registered office", "Notes", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={`${r.provinceKey}-${r.registryId}-${r.name}`}
                  style={{ borderTop: "1px solid var(--border)", background: activeId === r.registryId ? "var(--card-hover)" : undefined }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600, color: "var(--text)" }}>{r.name}</div>
                </td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace" }}>{r.registryId || "—"}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace" }}>{r.businessNumber || "—"}</td>
                <td style={tdStyle}>{r.registrationDate || "—"}</td>
                <td style={tdStyle}>{r.jurisdiction || "—"}</td>
                <td style={tdStyle}>
                  <span style={{
                    fontSize: "0.7rem", padding: "0.1rem 0.5rem", borderRadius: "9999px",
                    background: r.status === "Active" ? "rgba(42,125,143,0.10)" : "rgba(0,0,0,0.05)",
                    color: r.status === "Active" ? "var(--secondary)" : "var(--text-muted)",
                    border: `1px solid ${r.status === "Active" ? "var(--secondary)" : "var(--border)"}`,
                  }}>
                    {r.status}
                  </span>
                </td>
                <td style={{ ...tdStyle, maxWidth: 260, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.location}>{r.location || "—"}</td>
                <td style={{ ...tdStyle, maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.statusNotes}>{r.statusNotes || "—"}</td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                  <button
                    onClick={() => onPick(r)}
                    style={{
                      padding: "0.35rem 0.7rem", background: "var(--primary)", color: "#fff",
                      border: "none", borderRadius: "0.35rem", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                      display: "inline-flex", alignItems: "center", gap: "0.3rem",
                    }}
                  >
                    <Mail size={12} /> Draft email
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "0.55rem 0.75rem",
  fontFamily: "var(--font-mono), monospace",
  fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.06em",
  color: "var(--text-muted)", fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  padding: "0.6rem 0.75rem", color: "var(--text)", verticalAlign: "top",
};

function Drafter({
  pick, service, setService,
  to, setTo, cc, setCc, bcc, setBcc,
  recipientName, setRecipientName,
  campaignId, setCampaignId,
  subject, setSubject,
  customIntro, setCustomIntro,
  previewHtml, previewText, previewLoading,
  onClose, onSend, sending, sendErr, sentOk, canSend,
  enrich, onPickCandidate, onRefreshEnrich, onFillTo,
}: {
  pick: Result;
  service: Service; setService: (v: Service) => void;
  to: string; setTo: (v: string) => void;
  cc: string; setCc: (v: string) => void;
  bcc: string; setBcc: (v: string) => void;
  recipientName: string; setRecipientName: (v: string) => void;
  campaignId: string; setCampaignId: (v: string) => void;
  subject: string; setSubject: (v: string) => void;
  customIntro: string; setCustomIntro: (v: string) => void;
  previewHtml: string; previewText: string; previewLoading: boolean;
  onClose: () => void; onSend: () => void;
  sending: boolean; sendErr: string;
  sentOk: { token: string; landingUrl: string } | null;
  canSend: boolean;
  enrich:           EnrichmentState;
  onPickCandidate:  (c: PlaceCandidate) => void;
  onRefreshEnrich:  () => void;
  onFillTo:         (email: string) => void;
}) {
  return (
    <div style={{ padding: "1.25rem 1.5rem" }}>
      {/* Header — sticky within the drawer so the close button stays visible on scroll */}
      <div style={{
        position: "sticky", top: 0, background: "var(--card)", zIndex: 1,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0.35rem 0 0.75rem", marginBottom: "0.5rem",
        borderBottom: "1px solid var(--border)",
      }}>
        <div className="card-heading" style={{ fontSize: "1.05rem" }}>Draft outreach</div>
        <button
          onClick={onClose}
          style={{
            background: "var(--bg-deep)", border: "1px solid var(--border)",
            borderRadius: "0.4rem", cursor: "pointer",
            padding: "0.35rem 0.55rem", color: "var(--text-muted)",
            display: "inline-flex", alignItems: "center", gap: "0.3rem",
            fontSize: "0.78rem",
          }}
          title="Close"
        >
          <X size={14} /> Close
        </button>
      </div>

      {/* Selected company */}
      <div style={{ padding: "0.7rem 0.85rem", background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: "0.5rem", marginBottom: "1rem" }}>
        <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text)" }}>{pick.name}</div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem", fontFamily: "var(--font-mono), monospace" }}>
          {pick.jurisdiction} · {pick.registryId || "—"} · {pick.entityType || "—"}
        </div>
      </div>

      {/* Contact info panel — registered office from the registry + web-search
          enrichment. Three modes: candidates (operator picks the right
          business), resolved (final contact info with copy buttons), or
          loading. */}
      <ContactPanel
        pick={pick}
        enrich={enrich}
        onPickCandidate={onPickCandidate}
        onRefresh={onRefreshEnrich}
        onFillTo={onFillTo}
      />

      {sentOk && (
        <div style={{ padding: "0.85rem 1rem", background: "rgba(42,125,143,0.08)", border: "1px solid var(--secondary)", borderRadius: "0.5rem", marginBottom: "1rem", fontSize: "0.85rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--secondary)", fontWeight: 700, marginBottom: "0.4rem" }}>
            <CheckCircle2 size={16} /> Email sent
          </div>
          <div style={{ color: "var(--text)", fontSize: "0.78rem", marginBottom: "0.4rem" }}>Recipient landing link:</div>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <input
              readOnly
              value={sentOk.landingUrl}
              style={{ flex: 1, fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", padding: "0.3rem 0.5rem", border: "1px solid var(--border)", borderRadius: "0.3rem" }}
            />
            <button
              onClick={() => navigator.clipboard.writeText(sentOk.landingUrl)}
              style={{ padding: "0.3rem 0.55rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.3rem", cursor: "pointer" }}
              title="Copy"
            >
              <Copy size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Fields */}
      <Field label="Template">
        <select
          value={service}
          onChange={(e) => setService(e.target.value as Service)}
          className="field-input"
          style={{ height: "2.5rem", lineHeight: 1.4 }}
        >
          {SERVICES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </Field>

      <Field label="Recipient name (optional)">
        <input
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
          placeholder="e.g. Jane Doe — used in greeting"
          className="field-input"
          style={{ height: "2.2rem" }}
        />
      </Field>

      <Field label="To">
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="jane@company.ca" className="field-input" style={{ height: "2.2rem" }} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <Field label="Cc">
          <input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="optional" className="field-input" style={{ height: "2.2rem" }} />
        </Field>
        <Field label="Bcc">
          <input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="optional" className="field-input" style={{ height: "2.2rem" }} />
        </Field>
      </div>

      <Field label="Subject">
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="auto-generated from template" className="field-input" style={{ height: "2.2rem" }} />
      </Field>

      <Field label="Custom intro paragraph (optional)">
        <textarea
          value={customIntro}
          onChange={(e) => setCustomIntro(e.target.value)}
          placeholder="Optional — inserted after the greeting, before the template body."
          rows={2}
          className="field-input"
          style={{ resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
        />
      </Field>

      <Field label="Campaign tag (optional)">
        <input
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
          placeholder="e.g. gsc-ab-2026-jul"
          className="field-input"
          style={{ height: "2.2rem" }}
        />
      </Field>

      {sendErr && (
        <div style={{ marginTop: "0.6rem", padding: "0.5rem 0.7rem", background: "rgba(180,83,9,0.08)", color: "#B45309", fontSize: "0.8rem", borderRadius: "0.4rem", display: "flex", gap: "0.4rem", alignItems: "flex-start" }}>
          <AlertCircle size={14} style={{ marginTop: "0.1rem", flexShrink: 0 }} />
          <span>{sendErr}</span>
        </div>
      )}

      <button
        onClick={onSend}
        disabled={!canSend || sending}
        className="btn-primary"
        style={{ width: "100%", marginTop: "0.85rem", padding: "0.7rem", opacity: canSend && !sending ? 1 : 0.4, cursor: canSend && !sending ? "pointer" : "not-allowed" }}
      >
        {sending ? <><Loader2 size={14} className="crs-spin" /> Sending…</> : <><Send size={14} /> Send outreach</>}
      </button>

      {/* Live preview */}
      <div style={{ marginTop: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
          <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
            Live preview
          </span>
          {previewLoading && <Loader2 size={12} className="crs-spin" />}
        </div>
        <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "0.5rem", overflow: "hidden", height: 520 }}>
          {previewHtml ? (
            <iframe
              srcDoc={previewHtml}
              title="Email preview"
              style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
            />
          ) : (
            <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.82rem" }}>
              Preview will appear here.
            </div>
          )}
        </div>
        {previewText && (
          <details style={{ marginTop: "0.6rem" }}>
            <summary style={{ fontSize: "0.75rem", color: "var(--text-muted)", cursor: "pointer" }}>Plain-text version</summary>
            <pre style={{ marginTop: "0.4rem", background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: "0.4rem", padding: "0.6rem", fontSize: "0.72rem", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
              {previewText}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "0.6rem" }}>
      <label style={{ display: "block", fontFamily: "var(--font-mono), monospace", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.2rem", fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function SentLog({ rows, loading }: { rows: SentRow[]; loading: boolean }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
      <div style={{ padding: "0.9rem 1.25rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div className="card-heading" style={{ fontSize: "0.95rem" }}>Recent outreach — last 20 sends</div>
        {loading && <Loader2 size={12} className="crs-spin" />}
      </div>
      {rows.length === 0 ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
          No outreach sent yet.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ background: "var(--bg-deep)" }}>
                {["Sent", "Company", "Template", "To", "Subject", "Clicks", "Filed?", "Converted", "Link"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.tokenId} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "var(--text-muted)" }}>
                    {new Date(r.sentAt).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600 }}>{r.companyName}</div>
                    <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>{r.registryId || "—"}</div>
                  </td>
                  <td style={tdStyle}>{r.service}</td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", maxWidth: 200, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.to.join(", ")}>
                    {r.to.join(", ")}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 280, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.subject}>{r.subject}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <div>{r.clickCount || 0}</div>
                    {r.clickedServices.length > 0 && (
                      <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", marginTop: "0.15rem" }} title={r.clickedServices.join(", ")}>
                        {r.clickedServices.slice(0, 2).join(", ")}{r.clickedServices.length > 2 ? "…" : ""}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }} title={r.ackFiled ? new Date(r.ackFiled).toLocaleString("en-CA") : ""}>
                    {r.ackFiled ? (
                      <span style={{ fontSize: "0.7rem", padding: "0.15rem 0.5rem", borderRadius: "9999px", background: "rgba(180,83,9,0.12)", color: "#B45309", border: "1px solid #B45309", fontFamily: "var(--font-mono), monospace", fontWeight: 600 }}>
                        FILED
                      </span>
                    ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {r.convertedAt ? <CheckCircle2 size={14} style={{ color: "var(--secondary)" }} /> : <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                    <a href={`/o/${r.tokenId}`} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", color: "var(--secondary)" }}>
                      {r.tokenId} <ExternalLink size={10} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════ ContactPanel ═══════════════════════════ */

/** Web-verified contact info for the selected corp. Three states:
 *   - loading   → spinner
 *   - candidates → 2-3 Places matches, operator picks the right business
 *   - resolved  → final contact (registered office + website/phone/email)
 *                 with click-to-copy on every value */
function ContactPanel({
  pick, enrich, onPickCandidate, onRefresh, onFillTo,
}: {
  pick:            Result;
  enrich:          EnrichmentState;
  onPickCandidate: (c: PlaceCandidate) => void;
  onRefresh:       () => void;
  onFillTo:        (email: string) => void;
}) {
  return (
    <div style={{
      background: "var(--bg-deep)",
      border: "1px solid var(--border)",
      borderLeft: "3px solid var(--secondary)",
      borderRadius: "0.5rem",
      padding: "0.85rem 1rem",
      marginBottom: "1rem",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", fontWeight: 700 }}>
          Contact info (registry + web search)
        </div>
        <button
          onClick={onRefresh}
          disabled={enrich.mode === "loading" || enrich.mode === "picking"}
          style={{
            background: "none", border: "none",
            cursor: (enrich.mode === "loading" || enrich.mode === "picking") ? "wait" : "pointer",
            fontSize: "0.68rem", color: "var(--secondary)", fontFamily: "var(--font-mono), monospace",
            padding: "0.1rem 0.35rem",
          }}
          title="Re-fetch fresh candidates from Google Places (bypasses cache)"
        >
          {enrich.mode === "loading" ? "…" : "↻ Fresh search"}
        </button>
      </div>

      {/* Registered office — always visible, straight from the registry */}
      <CopyRow icon="📍" label="Registered office" value={pick.location || "—"} />

      {/* Mode-specific body */}
      {enrich.mode === "loading" && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.78rem", color: "var(--text-muted)", padding: "0.5rem 0", fontStyle: "italic" }}>
          <Loader2 size={12} className="crs-spin" />
          Searching Google Places for matching businesses…
        </div>
      )}

      {enrich.mode === "candidates" && (
        <CandidatePicker
          candidates={enrich.candidates}
          picking={null}
          onPick={onPickCandidate}
        />
      )}

      {enrich.mode === "picking" && (
        <CandidatePicker
          candidates={enrich.candidates}
          picking={enrich.picking}
          onPick={onPickCandidate}
        />
      )}

      {enrich.mode === "resolved" && (
        <ResolvedContact contact={enrich.contact} note={enrich.note} onFillTo={onFillTo} />
      )}

      {enrich.mode === "error" && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", color: "#B45309", padding: "0.4rem 0" }}>
          <AlertCircle size={12} />
          {enrich.message}
        </div>
      )}
    </div>
  );
}

/** Candidate cards for operator to pick from — each shows Google's business
 *  name, address, phone, website with a "Use this →" button. When operator
 *  clicks, that card enters "picking" state (spinner) while the website
 *  gets crawled for an email. */
function CandidatePicker({
  candidates, picking, onPick,
}: {
  candidates: PlaceCandidate[];
  picking:    PlaceCandidate | null;
  onPick:     (c: PlaceCandidate) => void;
}) {
  if (!candidates.length) {
    return (
      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", padding: "0.5rem 0", fontStyle: "italic" }}>
        No matches in Google Places for this business name.
      </div>
    );
  }
  return (
    <div style={{ marginTop: "0.35rem" }}>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.5rem", fontStyle: "italic" }}>
        {candidates.length} candidate{candidates.length === 1 ? "" : "s"} from Google Places · pick the right one:
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {candidates.map((c, i) => {
          const isPicking = picking?.displayName === c.displayName && picking?.formattedAddress === c.formattedAddress;
          return (
            <div key={i} style={{
              background: isPicking ? "rgba(42,125,143,0.10)" : "var(--card)",
              border: `1px solid ${isPicking ? "var(--secondary)" : "var(--border)"}`,
              borderRadius: "0.4rem",
              padding: "0.6rem 0.75rem",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "flex-start" }}>
                <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text)", lineHeight: 1.3 }}>
                    {c.displayName}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                    {c.formattedAddress || "no address on file"}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.7rem", marginTop: "0.3rem", fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
                    {c.website && <span>🌐 {new URL(c.website.startsWith("http") ? c.website : `https://${c.website}`).host}</span>}
                    {c.phone   && <span>☎ {c.phone}</span>}
                    <span title="Name-similarity vs the corp legal name">
                      sim {(c.similarity * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onPick(c)}
                  disabled={!!picking}
                  style={{
                    padding: "0.4rem 0.7rem",
                    background: isPicking ? "var(--secondary)" : "var(--primary)",
                    color: "#fff", border: "none", borderRadius: "0.35rem",
                    fontSize: "0.72rem", fontWeight: 700,
                    cursor: picking ? "wait" : "pointer",
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}
                >
                  {isPicking ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                      <Loader2 size={11} className="crs-spin" /> crawling…
                    </span>
                  ) : "Use this →"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Resolved (picked) contact — final email/phone/website with copy buttons. */
function ResolvedContact({
  contact, note, onFillTo,
}: {
  contact:  EnrichmentPayload;
  note?:    string;
  onFillTo: (email: string) => void;
}) {
  const anyValue = contact.website || contact.phone || contact.email;
  return (
    <>
      {contact.website && (
        <CopyRow icon="🌐" label="Website" value={contact.website} link={contact.website} />
      )}
      {contact.phone && (
        <CopyRow icon="☎" label="Phone" value={contact.phone} link={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} />
      )}
      {contact.email && (
        <CopyRow
          icon="✉"
          label="Email"
          value={contact.email}
          link={`mailto:${contact.email}`}
          action={
            <button
              onClick={() => onFillTo(contact.email!)}
              style={{
                fontSize: "0.62rem", padding: "0.1rem 0.4rem",
                background: "var(--secondary)", color: "#fff",
                border: "none", borderRadius: "0.25rem", cursor: "pointer",
                marginLeft: "0.35rem",
                whiteSpace: "nowrap",
              }}
              title="Use as To: recipient"
            >
              → To
            </button>
          }
        />
      )}
      {!anyValue && (
        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", padding: "0.3rem 0", fontStyle: "italic" }}>
          {note || "No public contact info found for this business."}
        </div>
      )}
      <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", marginTop: "0.5rem", fontStyle: "italic" }}>
        Enriched {new Date(contact.enrichedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
        {contact.emailSourceUrl && (
          <>
            {" · "}
            <a href={contact.emailSourceUrl} target="_blank" rel="noreferrer" style={{ color: "var(--text-muted)" }}>
              email source URL
            </a>
          </>
        )}
      </div>
    </>
  );
}

function CopyRow({
  icon, label, value, link, action,
}: {
  icon:   string;
  label:  string;
  value:  string;
  link?:  string;
  action?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard blocked — ignore */ }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.3rem 0", borderTop: "1px dotted var(--border)" }}>
      <span style={{ fontSize: "0.85rem", opacity: 0.7, width: "1.2rem", textAlign: "center" }}>{icon}</span>
      <div style={{ minWidth: 0, flex: "1 1 auto" }}>
        <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "var(--font-mono), monospace" }}>{label}</div>
        {link ? (
          <a href={link} target={link.startsWith("http") ? "_blank" : undefined} rel="noreferrer" style={{ fontSize: "0.82rem", color: "var(--text)", textDecoration: "none", wordBreak: "break-all", display: "block" }}>
            {value}
          </a>
        ) : (
          <div style={{ fontSize: "0.82rem", color: "var(--text)", wordBreak: "break-all" }}>{value}</div>
        )}
      </div>
      <button
        onClick={doCopy}
        style={{
          background: copied ? "var(--secondary)" : "var(--card)",
          color: copied ? "#fff" : "var(--text-muted)",
          border: "1px solid var(--border)", borderRadius: "0.3rem", cursor: "pointer",
          padding: "0.25rem 0.45rem", fontSize: "0.7rem",
          display: "inline-flex", alignItems: "center", gap: "0.2rem",
          flexShrink: 0,
        }}
        title="Copy to clipboard"
      >
        {copied ? "✓ Copied" : <><Copy size={11} /> Copy</>}
      </button>
      {action}
    </div>
  );
}

/* ═══════════════════════════ Helpers ═══════════════════════════ */

function companyFromResult(r: Result) {
  return {
    name:            r.name,
    registryId:      r.registryId,
    businessNumber:  r.businessNumber,
    jurisdiction:    r.jurisdiction,
    provinceKey:     r.provinceKey,
    incorpDate:      r.registrationDate,
    location:        r.location,
    entityType:      r.entityType,
    status:          r.status,
  };
}

function splitEmails(s: string): string[] {
  return s.split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
}

function firstEmail(s: string): string | undefined {
  return splitEmails(s)[0];
}
