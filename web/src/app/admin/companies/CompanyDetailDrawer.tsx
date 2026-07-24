"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink, MapPin, Mail, Phone, Globe, RefreshCcw, Send, AlertTriangle, ArrowUpRight, Loader2, Info, Check } from "lucide-react";

/**
 * Right-side detail drawer for /admin/companies.
 * Fetches full detail from /api/admin/companies/[corpNumber] on open.
 *
 * Layout (top → bottom):
 *   1. Header — name, corp #, status, close button
 *   2. Actions bar — outreach / re-enrich / open profile
 *   3. Registry status + first/last event
 *   4. Contact block — email/phone/website + Places signal + suppression
 *   5. Address block — full address + Google Maps link
 *   6. Event timeline — 25 most-recent events with type + date + issue
 *   7. Outreach history — 20 most-recent sends with click/convert state
 *
 * Escape / backdrop click closes. Body scroll locked while open.
 */

type CompanyDetail = {
  corpNumber:      string;
  name:            string;
  entityType:      string;
  slug:            string;
  firstEventDate:  string | null;
  status: {
    derived:       string;
    lastEventDate: string | null;
    lastIssue:     string;
    lastIssueDate: string | null;
    live:          string | null;
    liveCheckedAt: string | null;
  };
  address: { full: string; city: string; postal: string };
  contact: {
    email:          string | null;
    emailSourceUrl: string | null;
    website:        string | null;
    phone:          string | null;
    enrichedAt:     string | null;
    enrichStatus:   string;
    rating:         number | null;
    reviewCount:    number | null;
    businessStatus: string | null;
    mapsUrl:        string | null;
    suppressed:     boolean;
    suppressedAt:   string | null;
  };
  outreachSummary: {
    lastEmailAt:  string | null;
    sequenceStep: number;
    replied:      boolean;
    orderId:      string | null;
  };
  otherData: OtherData | null;
};

type OtherData = {
  matched:      boolean;
  name:         string | null;
  address:      string | null;
  city:         string | null;
  region:       string | null;
  country:      string | null;
  postalCode:   string | null;
  industry:     string | null;
  locationType: string | null;
  fetchedAt:    string | null;
};

type OtherDataCandidate = {
  name:          string;
  address:       string;
  city:          string;
  region:        string;
  country:       string;
  postalCode:    string;
  industry:      string;
  locationType:  string;
  matchStrength: "identical" | "substring";
};

type TimelineEvent = {
  event:      string;
  section:    string;
  eventDate:  string | null;
  issue:      string;
  issueDate:  string | null;
  address:    string;
  city:       string;
  postal:     string;
  entityType: string;
  oldName:    string;
  predecessors: string[];
};

type OutreachRow = {
  tokenId:        string;
  service:        string;
  subject:        string;
  to:             string[];
  sentAt:         string | null;
  bouncedAt:      string | null;
  complainedAt:   string | null;
  clickCount:     number;
  firstClickedAt: string | null;
  ackFiled:       string | null;
  convertedAt:    string | null;
};

type ApiResponse = {
  company:  CompanyDetail;
  events:   TimelineEvent[];
  outreach: OutreachRow[];
};

export default function CompanyDetailDrawer({ corpNumber, onClose }: {
  corpNumber: string;
  onClose:    () => void;
}) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [reEnriching, setReEnriching] = useState(false);
  const [otherDataLoading, setOtherDataLoading] = useState(false);
  const [otherDataCandidates, setOtherDataCandidates] = useState<OtherDataCandidate[] | null>(null);
  const [otherDataErr, setOtherDataErr] = useState("");

  /* Fetch detail whenever corpNumber changes. */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    setData(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/companies/${encodeURIComponent(corpNumber)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ApiResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Load failed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [corpNumber]);

  /* Escape closes; body scroll locked while open. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const reEnrich = async () => {
    if (!data) return;
    setReEnriching(true);
    try {
      const res = await fetch("/api/admin/outreach/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:       data.company.name,
          city:       data.company.address.city,
          postalCode: data.company.address.postal || undefined,
          corpNumber: data.company.corpNumber,
          forceRefresh: true,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Reload the detail so the freshly-enriched contact shows up.
      const refetch = await fetch(`/api/admin/companies/${encodeURIComponent(corpNumber)}`);
      if (refetch.ok) setData(await refetch.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Re-enrich failed.");
    } finally {
      setReEnriching(false);
    }
  };

  const fetchOtherData = async (forceRefresh: boolean) => {
    if (!data) return;
    setOtherDataLoading(true);
    setOtherDataErr("");
    setOtherDataCandidates(null);
    try {
      const res = await fetch("/api/admin/companies/other-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:       data.company.name,
          corpNumber: data.company.corpNumber,
          forceRefresh,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

      if (json.mode === "candidates") {
        setOtherDataCandidates(json.candidates as OtherDataCandidate[]);
      } else {
        /* Modes "cached", "picked", "no_match" all persisted server-side —
         *  refetch the drawer detail so otherData shows up in the section. */
        const refetch = await fetch(`/api/admin/companies/${encodeURIComponent(corpNumber)}`);
        if (refetch.ok) setData(await refetch.json());
      }
    } catch (e) {
      setOtherDataErr(e instanceof Error ? e.message : "Fetch failed.");
    } finally {
      setOtherDataLoading(false);
    }
  };

  const pickOtherDataCandidate = async (picked: OtherDataCandidate | null) => {
    if (!data) return;
    setOtherDataLoading(true);
    setOtherDataErr("");
    try {
      const res = await fetch("/api/admin/companies/other-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:       data.company.name,
          corpNumber: data.company.corpNumber,
          picked:     picked ?? undefined,
          noMatch:    picked === null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setOtherDataCandidates(null);
      const refetch = await fetch(`/api/admin/companies/${encodeURIComponent(corpNumber)}`);
      if (refetch.ok) setData(await refetch.json());
    } catch (e) {
      setOtherDataErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setOtherDataLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{ position: "fixed", inset: 0, background: "rgba(0, 61, 91, 0.20)", zIndex: 40 }}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Corporation detail"
        style={{
          position:     "fixed",
          top: 0, right: 0, bottom: 0,
          width:        "min(760px, 100vw)",
          background:   "var(--card)",
          borderLeft:   "1px solid var(--border)",
          boxShadow:    "-8px 0 32px rgba(0, 61, 91, 0.20)",
          overflowY:    "auto",
          zIndex:       50,
        }}
      >
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)", gap: "0.4rem" }}>
            <Loader2 size={16} className="crs-spin" /> loading…
          </div>
        )}

        {err && (
          <div style={{ padding: "2rem 1.5rem", color: "#B91C1C" }}>
            <div style={{ fontWeight: 700 }}>Couldn&apos;t load</div>
            <div style={{ fontSize: "0.85rem", marginTop: "0.4rem" }}>{err}</div>
            <button onClick={onClose} style={pillBtn(false)}>Close</button>
          </div>
        )}

        {data && (
          <>
            <StickyHeader
              company={data.company}
              onClose={onClose}
            />

            <div style={{ padding: "0 1.5rem 2rem" }}>
              <ActionsBar
                company={data.company}
                reEnriching={reEnriching}
                onReEnrich={reEnrich}
                otherDataLoading={otherDataLoading}
                onFetchOtherData={() => fetchOtherData(false)}
              />

              <StatusBlock company={data.company} />

              <ContactBlock company={data.company} />

              <AddressBlock company={data.company} />

              <OtherDataBlock
                otherData={data.company.otherData}
                candidates={otherDataCandidates}
                loading={otherDataLoading}
                err={otherDataErr}
                onPick={pickOtherDataCandidate}
                onRefresh={() => fetchOtherData(true)}
              />

              <EventTimeline events={data.events} />

              <OutreachHistory rows={data.outreach} />
            </div>
          </>
        )}
      </aside>
    </>
  );
}

/* ── Sticky header ─────────────────────────────────────────────── */

function StickyHeader({ company, onClose }: { company: CompanyDetail; onClose: () => void }) {
  return (
    <div
      style={{
        position:     "sticky",
        top: 0,
        background:   "var(--card)",
        zIndex:       2,
        padding:      "1.25rem 1.5rem 0.9rem",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gold)", fontWeight: 700 }}>
            {company.corpNumber} · {company.entityType || "Corporation"}
          </div>
          <div className="card-heading" style={{ fontSize: "1.1rem", marginTop: "0.2rem", lineHeight: 1.3 }}>
            {company.name}
          </div>
        </div>
        <button
          onClick={onClose}
          title="Close (Esc)"
          style={{
            background: "var(--bg-deep)", border: "1px solid var(--border)",
            borderRadius: "0.4rem", cursor: "pointer",
            padding: "0.35rem 0.55rem", color: "var(--text-muted)",
            display: "inline-flex", alignItems: "center", gap: "0.3rem",
            fontSize: "0.78rem",
            flexShrink: 0,
          }}
        >
          <X size={14} /> Close
        </button>
      </div>
    </div>
  );
}

/* ── Actions bar ───────────────────────────────────────────────── */

function ActionsBar({ company, reEnriching, onReEnrich, otherDataLoading, onFetchOtherData }: {
  company:          CompanyDetail;
  reEnriching:      boolean;
  onReEnrich:       () => void;
  otherDataLoading: boolean;
  onFetchOtherData: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", padding: "1rem 0", borderBottom: "1px dotted var(--border)", marginBottom: "1rem" }}>
      <a
        href={`/admin/outreach?corp=${encodeURIComponent(company.corpNumber)}`}
        title="Draft an outreach email for this corporation"
        style={pillBtn(true)}
      >
        <Send size={13} /> Send outreach →
      </a>
      <button
        onClick={onReEnrich}
        disabled={reEnriching}
        style={pillBtn(false)}
        title="Re-run Google Places + email crawl for this corporation"
      >
        {reEnriching ? <Loader2 size={13} className="crs-spin" /> : <RefreshCcw size={13} />}
        Re-enrich
      </button>
      <button
        onClick={onFetchOtherData}
        disabled={otherDataLoading || !!company.otherData}
        style={pillBtn(false)}
        title={company.otherData
          ? "Already fetched — see Other Data section below (use refresh to re-check)"
          : "Look up additional public-directory data for this corporation"}
      >
        {otherDataLoading ? <Loader2 size={13} className="crs-spin" /> : <Info size={13} />}
        Fetch other data
      </button>
      <a
        href={`/corporation/${encodeURIComponent(company.corpNumber)}`}
        target="_blank"
        rel="noreferrer"
        style={pillBtn(false)}
      >
        <ArrowUpRight size={13} /> Public profile
      </a>
    </div>
  );
}

/* ── Status ─────────────────────────────────────────────────────── */

function StatusBlock({ company }: { company: CompanyDetail }) {
  const s = company.status;
  const c = statusColor(s.derived);
  return (
    <section style={sectionStyle}>
      <SectionHeader>Registry status</SectionHeader>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.65rem" }}>
        <StatCell label="Current status" value={s.derived || "unknown"} valueColor={c} bold />
        <StatCell label="Last event"       value={fmtDate(s.lastEventDate) ?? "—"} />
        <StatCell label="First event"      value={fmtDate(company.firstEventDate) ?? "—"} hint="~incorp date" />
        <StatCell label="Last gazette"     value={s.lastIssue || "—"} mono />
      </div>
      {s.live && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.72rem", color: "var(--text-muted)", fontStyle: "italic" }}>
          Live check ({fmtDate(s.liveCheckedAt)}): {s.live}
        </div>
      )}
    </section>
  );
}

/* ── Contact ────────────────────────────────────────────────────── */

/** Registry statuses where the corp is defunct or on the way out — a
 *  CLOSED_PERMANENTLY Places match on one of these is a POSITIVE
 *  revival-lead signal, not a "skip outreach" warning. */
const DEFUNCT_REGISTRY_STATUSES_DRAWER = new Set([
  "Dissolved/Struck Off",
  "Liable For Dissolution",
  "Intent To Dissolve",
]);

function ContactBlock({ company }: { company: CompanyDetail }) {
  const c = company.contact;
  const isDefunct = DEFUNCT_REGISTRY_STATUSES_DRAWER.has(company.status.derived);
  return (
    <section style={sectionStyle}>
      <SectionHeader>Contact + enrichment</SectionHeader>
      {c.enrichStatus === "needs_review" && (
        <div style={{
          padding: "0.55rem 0.75rem", background: "rgba(212,175,55,0.14)", border: "1px solid rgba(212,175,55,0.55)",
          color: "var(--gold)", fontSize: "0.78rem", fontWeight: 700, borderRadius: "0.35rem", marginBottom: "0.65rem",
          display: "flex", gap: "0.4rem", alignItems: "flex-start",
        }}>
          ⚠ <span style={{ fontWeight: 600, lineHeight: 1.4 }}>
            Flagged for review — this contact is shared with another corporation on our list. Re-enrich to confirm.
          </span>
        </div>
      )}
      {c.suppressed && (
        <div style={{
          padding: "0.55rem 0.75rem", background: "rgba(180,83,9,0.10)", border: "1px solid rgba(180,83,9,0.45)",
          color: "#B45309", fontSize: "0.78rem", fontWeight: 700, borderRadius: "0.35rem", marginBottom: "0.65rem",
          display: "flex", gap: "0.4rem", alignItems: "flex-start",
        }}>
          🚫 <span style={{ fontWeight: 600, lineHeight: 1.4 }}>Unsubscribed — do not email. Send API will block this address.</span>
        </div>
      )}
      {c.businessStatus === "CLOSED_PERMANENTLY" && !isDefunct && (
        <div style={{
          padding: "0.55rem 0.75rem", background: "rgba(220,38,38,0.10)", border: "1px solid rgba(220,38,38,0.45)",
          color: "#B91C1C", fontSize: "0.78rem", fontWeight: 700, borderRadius: "0.35rem", marginBottom: "0.65rem",
          display: "flex", gap: "0.4rem", alignItems: "flex-start",
        }}>
          <AlertTriangle size={14} style={{ marginTop: "0.1rem", flexShrink: 0 }} />
          <span style={{ fontWeight: 600, lineHeight: 1.4 }}>
            Google marks this business CLOSED PERMANENTLY, but the registry still lists it as {company.status.derived || "active"}. Likely a stale match — verify before emailing.
          </span>
        </div>
      )}
      {c.businessStatus === "CLOSED_PERMANENTLY" && isDefunct && (
        <div style={{
          padding: "0.55rem 0.75rem", background: "rgba(212,175,55,0.14)", border: "1px solid rgba(212,175,55,0.55)",
          color: "var(--gold)", fontSize: "0.78rem", fontWeight: 700, borderRadius: "0.35rem", marginBottom: "0.65rem",
          display: "flex", gap: "0.4rem", alignItems: "flex-start",
        }}>
          🎯 <span style={{ fontWeight: 600, lineHeight: 1.4 }}>
            Revival lead — Google confirms the business is closed, matching the registry status. Former director may still be reachable via the historical website; pitch a revival filing.
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        <ContactRow icon={<Mail size={14} />} label="Email" value={c.email} link={c.email ? `mailto:${c.email}` : undefined} />
        <ContactRow icon={<Phone size={14} />} label="Phone" value={c.phone} link={c.phone ? `tel:${c.phone.replace(/[^\d+]/g, "")}` : undefined} />
        <ContactRow icon={<Globe size={14} />} label="Website" value={c.website} link={c.website ?? undefined} external />
      </div>

      {(c.rating != null || c.mapsUrl) && (
        <div style={{ marginTop: "0.85rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", fontSize: "0.72rem", color: "var(--text-muted)" }}>
          {c.rating != null && (
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.2rem",
                padding: "0.15rem 0.45rem",
                background: c.rating >= 4 ? "rgba(22,163,74,0.10)" : c.rating >= 3 ? "rgba(212,175,55,0.15)" : "rgba(180,83,9,0.10)",
                border:     `1px solid ${c.rating >= 4 ? "rgba(22,163,74,0.35)" : c.rating >= 3 ? "rgba(212,175,55,0.35)" : "rgba(180,83,9,0.35)"}`,
                color:      c.rating >= 4 ? "#166534" : c.rating >= 3 ? "var(--gold)" : "#B45309",
                fontWeight: 700, borderRadius: "0.35rem",
              }}
            >
              ★ {c.rating.toFixed(1)}
              {c.reviewCount != null && <span style={{ marginLeft: "0.15rem", color: "var(--text-muted)", fontWeight: 500 }}>({c.reviewCount.toLocaleString()})</span>}
            </span>
          )}
          {c.mapsUrl && (
            <a href={c.mapsUrl} target="_blank" rel="noreferrer" style={{ color: "var(--secondary)", textDecoration: "none", borderBottom: "1px dotted var(--border)", fontSize: "0.72rem" }}>
              🗺 Google Maps →
            </a>
          )}
          <span style={{ fontStyle: "italic" }}>
            Enrichment: <strong style={{ color: "var(--text)" }}>{c.enrichStatus}</strong>
            {c.enrichedAt && <> · {fmtDate(c.enrichedAt)}</>}
          </span>
        </div>
      )}
    </section>
  );
}

/* ── Address ────────────────────────────────────────────────────── */

function AddressBlock({ company }: { company: CompanyDetail }) {
  const a = company.address;
  if (!a.full && !a.city && !a.postal) return null;
  return (
    <section style={sectionStyle}>
      <SectionHeader>Registered address</SectionHeader>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
        <MapPin size={14} style={{ color: "var(--text-muted)", marginTop: "0.2rem", flexShrink: 0 }} />
        <div style={{ fontSize: "0.9rem", color: "var(--text)", lineHeight: 1.55 }}>
          {a.full || `${a.city}${a.postal ? " · " + a.postal : ""}`}
        </div>
      </div>
    </section>
  );
}

/* ── Other data (public-directory enrichment) ──────────────────── */

function OtherDataBlock({ otherData, candidates, loading, err, onPick, onRefresh }: {
  otherData:  OtherData | null;
  candidates: OtherDataCandidate[] | null;
  loading:    boolean;
  err:        string;
  onPick:     (picked: OtherDataCandidate | null) => void;
  onRefresh:  () => void;
}) {
  /* Nothing fetched yet AND no candidates on screen — hide the section.
     The "Fetch other data" button in the actions bar is the entry point. */
  if (!otherData && !candidates && !err && !loading) return null;

  return (
    <section style={sectionStyle}>
      <SectionHeader>Other Data</SectionHeader>

      {err && (
        <div style={{
          padding: "0.55rem 0.75rem", background: "rgba(220,38,38,0.10)", border: "1px solid rgba(220,38,38,0.45)",
          color: "#B91C1C", fontSize: "0.78rem", borderRadius: "0.35rem", marginBottom: "0.65rem",
        }}>
          {err}
        </div>
      )}

      {loading && !candidates && (
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", color: "var(--text-muted)", fontSize: "0.82rem", padding: "0.5rem 0" }}>
          <Loader2 size={13} className="crs-spin" /> Looking up…
        </div>
      )}

      {candidates && candidates.length > 0 && (
        <div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.65rem", lineHeight: 1.5 }}>
            {candidates.length === 1 ? "1 Canadian match found." : `${candidates.length} Canadian matches found.`} Pick the one that matches this corporation, or dismiss if none apply.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {candidates.map((c, i) => (
              <div
                key={i}
                style={{
                  padding: "0.75rem 0.85rem",
                  background: "var(--bg-deep)",
                  border: c.matchStrength === "identical"
                    ? "1.5px solid rgba(22,163,74,0.55)"
                    : "1px solid var(--border)",
                  borderRadius: "0.4rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "flex-start", marginBottom: "0.35rem" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text)", lineHeight: 1.3 }}>{c.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                      {[c.city, c.region, c.country].filter(Boolean).join(", ")}
                    </div>
                  </div>
                  {c.matchStrength === "identical" && (
                    <span style={{
                      padding: "0.15rem 0.45rem", background: "rgba(22,163,74,0.14)", color: "#166534",
                      fontSize: "0.66rem", fontWeight: 700, borderRadius: "0.35rem", whiteSpace: "nowrap",
                      fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.05em",
                    }}>
                      Strong match
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--text)", marginBottom: "0.5rem", lineHeight: 1.5 }}>
                  {c.address && <>{c.address}<br /></>}
                  {c.industry && <span style={{ color: "var(--text-muted)" }}>{c.industry}</span>}
                </div>
                <button
                  onClick={() => onPick(c)}
                  disabled={loading}
                  style={pillBtn(true)}
                >
                  <Check size={13} /> Use this
                </button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.4rem" }}>
            <button onClick={() => onPick(null)} disabled={loading} style={pillBtn(false)}>
              None of these match
            </button>
          </div>
        </div>
      )}

      {otherData && !candidates && (
        <>
          {otherData.matched ? (
            <>
              <div style={{ fontSize: "0.9rem", color: "var(--text)", lineHeight: 1.55, marginBottom: "0.5rem" }}>
                <strong>{otherData.name}</strong>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.5rem 1rem", fontSize: "0.85rem", color: "var(--text)" }}>
                {otherData.address && (
                  <>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>Location</span>
                    <span>
                      {otherData.address}<br />
                      {[otherData.city, otherData.region, otherData.postalCode].filter(Boolean).join(", ")}<br />
                      {otherData.country}
                    </span>
                  </>
                )}
                {otherData.industry && (
                  <>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>Industry</span>
                    <span>{otherData.industry}</span>
                  </>
                )}
                {otherData.locationType && (
                  <>
                    <span style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>Type</span>
                    <span>{otherData.locationType}</span>
                  </>
                )}
              </div>
            </>
          ) : (
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontStyle: "italic", padding: "0.35rem 0" }}>
              No relevant Canadian match found. Sourced from public business directories.
            </div>
          )}
          <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.72rem", color: "var(--text-muted)" }}>
            {otherData.fetchedAt && <span>Checked {fmtDate(otherData.fetchedAt)}</span>}
            <button onClick={onRefresh} disabled={loading} style={{ ...pillBtn(false), padding: "0.25rem 0.55rem", fontSize: "0.72rem" }}>
              {loading ? <Loader2 size={11} className="crs-spin" /> : <RefreshCcw size={11} />} Refresh
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/* ── Event timeline ─────────────────────────────────────────────── */

function EventTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <section style={sectionStyle}>
      <SectionHeader>Event timeline · {events.length} most recent</SectionHeader>
      {events.length === 0 ? (
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "0.5rem 0", fontStyle: "italic" }}>
          No events recorded for this corporation.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {events.map((e, i) => (
            <div
              key={`${e.issue}-${e.event}-${i}`}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: "0.5rem",
                alignItems: "baseline",
                padding: "0.5rem 0.65rem",
                background: "var(--bg-deep)",
                border: "1px solid var(--border)",
                borderRadius: "0.4rem",
              }}
            >
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                {fmtDate(e.eventDate) ?? "—"}
              </span>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 700, color: statusColor(e.event), fontSize: "0.85rem" }}>{e.event}</span>
                {e.oldName && (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "0.4rem" }}>
                    (was: {e.oldName})
                  </span>
                )}
                {e.predecessors && e.predecessors.length > 0 && (
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                    Predecessors: {e.predecessors.slice(0, 3).join(", ")}{e.predecessors.length > 3 ? " …" : ""}
                  </div>
                )}
              </div>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.66rem", color: "var(--text-muted)", whiteSpace: "nowrap" }} title={e.issue}>
                {e.issue.split("/").pop()}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ── Outreach history ───────────────────────────────────────────── */

function OutreachHistory({ rows }: { rows: OutreachRow[] }) {
  return (
    <section style={sectionStyle}>
      <SectionHeader>Outreach history · {rows.length} sends</SectionHeader>
      {rows.length === 0 ? (
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "0.5rem 0", fontStyle: "italic" }}>
          No outreach sent to this corporation yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {rows.map((r) => (
            <div key={r.tokenId} style={{ padding: "0.65rem 0.85rem", background: "var(--bg-deep)", border: "1px solid var(--border)", borderRadius: "0.4rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: "0.86rem", color: "var(--text)" }}>{r.subject}</span>
                <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  {fmtDateTime(r.sentAt) ?? "—"}
                </span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
                {r.service} · to {r.to.join(", ")}
              </div>
              <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                {r.clickCount > 0 && (
                  <span style={smallBadge("secondary")}>
                    {r.clickCount} click{r.clickCount === 1 ? "" : "s"}{r.firstClickedAt ? ` · first ${fmtDate(r.firstClickedAt)}` : ""}
                  </span>
                )}
                {r.convertedAt && <span style={smallBadge("gold")}>Converted {fmtDate(r.convertedAt)}</span>}
                {r.ackFiled     && <span style={smallBadge("muted")}>Ack: already filed</span>}
                {r.bouncedAt    && <span style={smallBadge("red")}>Bounced {fmtDate(r.bouncedAt)}</span>}
                {r.complainedAt && <span style={smallBadge("red")}>Complaint {fmtDate(r.complainedAt)}</span>}
                {r.clickCount === 0 && !r.convertedAt && !r.bouncedAt && !r.complainedAt && (
                  <span style={{ ...smallBadge("muted"), fontStyle: "italic" }}>No engagement</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ═══════════════════════════ helpers ═══════════════════════════ */

function statusColor(status: string): string {
  if (!status) return "var(--text-muted)";
  if (status === "Incorporated" || status === "Registered" || status === "Revived") return "#16A34A";
  if (status === "Dissolved/Struck Off") return "#B91C1C";
  if (status === "Liable For Dissolution" || status === "Intent To Dissolve") return "#B45309";
  return "var(--text)";
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const sectionStyle: React.CSSProperties = {
  padding: "0.85rem 0",
  borderBottom: "1px dotted var(--border)",
  marginBottom: "0.4rem",
};

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.66rem", textTransform: "uppercase", letterSpacing: "0.09em", color: "var(--text-muted)", fontWeight: 700, marginBottom: "0.65rem" }}>
      {children}
    </div>
  );
}

function StatCell({ label, value, hint, valueColor, bold, mono }: {
  label: string; value: string; hint?: string; valueColor?: string; bold?: boolean; mono?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: "0.62rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}{hint ? ` · ${hint}` : ""}
      </div>
      <div style={{
        fontSize: "0.9rem",
        color: valueColor ?? "var(--text)",
        fontWeight: bold ? 700 : 500,
        fontFamily: mono ? "var(--font-mono), monospace" : "inherit",
        marginTop: "0.15rem",
      }}>
        {value}
      </div>
    </div>
  );
}

function ContactRow({ icon, label, value, link, external }: {
  icon: React.ReactNode; label: string; value: string | null; link?: string; external?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.86rem", color: "var(--text)" }}>
      <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: "0.66rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", minWidth: 56 }}>
        {label}
      </span>
      {value ? (
        link ? (
          <a href={link} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} style={{ color: "var(--text)", textDecoration: "none", borderBottom: "1px dotted var(--border)" }}>
            {value} {external && <ExternalLink size={11} style={{ marginLeft: "0.15rem", opacity: 0.6 }} />}
          </a>
        ) : <span>{value}</span>
      ) : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>—</span>}
    </div>
  );
}

function pillBtn(primary: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: "0.35rem",
    padding: "0.4rem 0.75rem",
    background: primary ? "var(--primary)" : "var(--bg-deep)",
    color: primary ? "#fff" : "var(--text)",
    border: `1px solid ${primary ? "var(--primary)" : "var(--border)"}`,
    borderRadius: "0.35rem",
    fontSize: "0.78rem",
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer",
    textDecoration: "none",
    whiteSpace: "nowrap",
  };
}

function smallBadge(tone: "secondary" | "gold" | "red" | "muted"): React.CSSProperties {
  const c = tone === "secondary" ? { bg: "rgba(42,125,143,0.12)", border: "rgba(42,125,143,0.4)", fg: "var(--secondary)" }
          : tone === "gold"      ? { bg: "var(--gold-dim)",       border: "rgba(212,175,55,0.5)", fg: "var(--gold)" }
          : tone === "red"       ? { bg: "rgba(220,38,38,0.10)",  border: "rgba(220,38,38,0.4)",  fg: "#B91C1C" }
          :                        { bg: "var(--bg-deep)",        border: "var(--border)",        fg: "var(--text-muted)" };
  return {
    padding: "0.12rem 0.45rem",
    background: c.bg,
    border: `1px solid ${c.border}`,
    color: c.fg,
    borderRadius: "9999px",
    fontSize: "0.68rem",
    fontFamily: "var(--font-mono), monospace",
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}
