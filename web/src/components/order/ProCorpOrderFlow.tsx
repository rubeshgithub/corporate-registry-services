"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, ArrowRight, Loader2, BadgeCheck, AlertTriangle, Info } from "lucide-react";
import { JURISDICTIONS } from "@/lib/service-config";
import {
  isProfessionalCorporation,
  detectProfession,
  PROFESSION_LABELS,
  PRO_CORP_SERVICES,
  PRO_CORP_EXISTING_SERVICES,
} from "@/lib/professional-corp";

/**
 * Dedicated professional-corporation order flow.
 *
 * Shape: look the corporation up ONCE, then pick the service — the inverse
 * of the per-service flows, which make the customer pick the service first
 * and then search. Professional-corporation owners typically arrive with a
 * corporation and a deadline rather than a service in mind ("my CPSO
 * renewal is due, what do I need?"), so leading with the lookup matches how
 * they actually think.
 *
 * Only services that act on an EXISTING corporation appear here. New-PC
 * setup has nothing to look up, so it is offered as a side-exit instead.
 *
 * Once a service is chosen we hand off to that service's existing order
 * flow with the corporation pre-filled (?q / ?registryId / ?jurisdiction).
 * Those flows already re-derive PC pricing server-side, so there is no
 * second checkout implementation here and no way for the two to drift.
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

type Screen = "lookup" | "services";

export default function ProCorpOrderFlow() {
  const params              = useSearchParams();
  const initialJurisdiction = params.get("jurisdiction") ?? "all";
  const attributionSrc      = params.get("src") ?? "direct";

  const [screen, setScreen]   = useState<Screen>("lookup");
  const [query, setQuery]     = useState("");
  const [province, setProvince] = useState<string>(initialJurisdiction);
  const [results, setResults] = useState<RegistryHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [pick, setPick]       = useState<RegistryHit | null>(null);

  /* Deep-link support: /order/professional-corporation?q=…&registryId=…
     jumps straight to the service picker, same contract the per-service
     flows use. */
  useEffect(() => {
    const q = params.get("q");
    if (!q) return;
    setQuery(q);
    const wantedRegistryId = params.get("registryId") ?? "";
    const wantedProvince   = params.get("jurisdiction") ?? "all";
    (async () => {
      setSearching(true);
      try {
        const res  = await fetch(`/api/company-search?q=${encodeURIComponent(q)}&province=${wantedProvince}`);
        const data = await res.json();
        const hits: RegistryHit[] = data.results ?? [];
        setResults(hits);
        const match = wantedRegistryId
          ? hits.find((h) => h.registryId === wantedRegistryId)
          : (hits.length === 1 ? hits[0] : null);
        if (match) { setPick(match); setScreen("services"); }
      } catch {
        setSearchErr("Search is temporarily unavailable. Please try again.");
      } finally {
        setSearching(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = async () => {
    const q = query.trim();
    if (q.length < 2) {
      setSearchErr("Enter at least 2 characters — a company name, Corporate Access Number, or Business Number.");
      return;
    }
    setSearchErr("");
    setSearching(true);
    try {
      const res  = await fetch(`/api/company-search?q=${encodeURIComponent(q)}&province=${province}`);
      const data = await res.json();
      setResults(data.results ?? []);
      if (!data.results?.length) {
        setSearchErr("No matching records. Try the exact registered name — professional corporations are registered under the practitioner's surname.");
      }
    } catch {
      setSearchErr("Search is temporarily unavailable. Please try again.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const isPC       = isProfessionalCorporation(pick);
  const profession = isPC ? detectProfession(pick) : "general";

  /** Hand off to the chosen service's own order flow, corporation pre-filled. */
  const serviceHref = (key: (typeof PRO_CORP_EXISTING_SERVICES)[number]) => {
    if (!pick) return PRO_CORP_SERVICES[key].href;
    const qs = new URLSearchParams();
    qs.set("q", pick.name);
    qs.set("jurisdiction", pick.provinceKey);
    if (pick.registryId) qs.set("registryId", pick.registryId);
    qs.set("src", `pc-order-${attributionSrc}`);
    return `${PRO_CORP_SERVICES[key].href}?${qs.toString()}`;
  };

  /* ─────────────────── LOOKUP ─────────────────── */

  if (screen === "lookup") {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
            Professional Corporations
          </span>
          <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", marginTop: "0.35rem", marginBottom: "0.5rem" }}>
            Find your professional corporation
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.6 }}>
            Search the registry once, then choose what you need — profile report, annual return,
            change of information, or revival. Priced for the two-track reality of a professional
            corporation: the registry and your regulator.
          </p>
        </div>

        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", padding: "1.5rem", boxShadow: "var(--shadow-card)" }}>
          <label htmlFor="pc-q" style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem" }}>
            Company name, Corporate Access Number, or Business Number
          </label>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input
              id="pc-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
              placeholder="e.g. Smith Medicine Professional Corporation"
              style={{ flex: "3 1 260px", padding: "0.65rem 0.85rem", border: "1px solid var(--border)", borderRadius: "0.5rem", fontSize: "0.9rem", background: "var(--bg)", color: "var(--text)" }}
            />
            <select
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              style={{ flex: "1 1 160px", padding: "0.65rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.5rem", fontSize: "0.85rem", background: "var(--bg)", color: "var(--text)" }}
            >
              <option value="all">All of Canada</option>
              {JURISDICTIONS.map((j) => (
                <option key={j.key} value={j.key}>{j.label}</option>
              ))}
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

        {results.length > 0 && (
          <div style={{ marginTop: "1.25rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {results.slice(0, 8).map((hit, i) => {
              const hitIsPC = isProfessionalCorporation(hit);
              return (
                <button
                  key={`${hit.provinceKey}-${hit.registryId}-${i}`}
                  onClick={() => { setPick(hit); setScreen("services"); }}
                  style={{ textAlign: "left", background: "var(--card)", border: `1px solid ${hitIsPC ? "var(--gold)" : "var(--border)"}`, borderRadius: "0.5rem", padding: "0.9rem 1rem", cursor: "pointer", display: "flex", gap: "0.75rem", alignItems: "center", justifyContent: "space-between" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.95rem" }}>{hit.name}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "0.15rem" }}>
                      {hit.jurisdiction} · {hit.registryId || "—"} · {hit.status}
                      {hit.entityType ? ` · ${hit.entityType}` : ""}
                    </div>
                    {hitIsPC && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", marginTop: "0.4rem", color: "var(--gold)", fontSize: "0.7rem", fontWeight: 700, fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        <BadgeCheck size={11} /> Professional Corporation
                      </span>
                    )}
                  </div>
                  <ArrowRight size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: "1.5rem", padding: "1rem 1.25rem", border: "1px solid var(--border)", borderRadius: "0.5rem", background: "var(--card)", display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          <Info size={16} style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: "0.1rem" }} />
          <div style={{ fontSize: "0.82rem", color: "var(--text)", lineHeight: 1.55 }}>
            Starting a <strong>new</strong> professional corporation? There is nothing to look up yet
            — see{" "}
            <a href={PRO_CORP_SERVICES.setup.href} style={{ color: "var(--text)", borderBottom: "1px solid var(--gold)", textDecoration: "none" }}>
              new PC setup at {PRO_CORP_SERVICES.setup.priceLabel}
            </a>
            , which includes all government and regulator fees.
          </div>
        </div>

        <p style={{ color: "var(--text-muted)", fontSize: "0.75rem", textAlign: "center", marginTop: "1.5rem" }}>
          Data pulled live from federal &amp; provincial registries. QC uses REQ.
        </p>
      </div>
    );
  }

  /* ─────────────────── SERVICE PICKER ─────────────────── */

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <button
          onClick={() => setScreen("lookup")}
          style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.8rem", cursor: "pointer", padding: 0 }}
        >
          ← Pick a different corporation
        </button>
      </div>

      {pick && (
        <div style={{ background: "var(--card)", border: `1px solid ${isPC ? "var(--gold)" : "var(--border)"}`, borderRadius: "var(--radius-card)", padding: "1.5rem 1.75rem", marginBottom: "1.25rem", boxShadow: "var(--shadow-card)" }}>
          <div className="card-heading" style={{ fontSize: "1.15rem" }}>{pick.name}</div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginTop: "0.2rem" }}>
            {pick.jurisdiction} · {pick.registryId || "—"} · {pick.entityType || "—"}
          </div>
          <div style={{ marginTop: "0.5rem", fontSize: "0.82rem", color: pick.status === "Active" ? "var(--text)" : "#B45309", fontWeight: 600 }}>
            {pick.status}{pick.statusNotes && pick.statusNotes !== pick.status ? ` · ${pick.statusNotes}` : ""}
          </div>

          {isPC ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", marginTop: "0.75rem", padding: "0.2rem 0.6rem", borderRadius: "999px", background: "var(--gold-dim)", color: "var(--gold)", fontSize: "0.72rem", fontWeight: 700, fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <BadgeCheck size={12} /> Professional Corporation
              {profession !== "general" ? ` · ${PROFESSION_LABELS[profession]}` : ""}
            </div>
          ) : (
            /* Not a PC. Say so plainly rather than silently charging PC rates —
               the per-service flows will price it as a standard corporation
               anyway, so the screen must not imply otherwise. */
            <div style={{ marginTop: "0.9rem", padding: "0.75rem 1rem", borderRadius: "0.5rem", border: "1px solid rgba(180,83,9,0.35)", background: "rgba(180,83,9,0.06)", display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
              <AlertTriangle size={15} style={{ color: "#B45309", flexShrink: 0, marginTop: "0.1rem" }} />
              <div style={{ fontSize: "0.8rem", color: "var(--text)", lineHeight: 1.55 }}>
                This record does not look like a professional corporation, so it will be handled at
                our standard corporate rates — not the professional-corporation prices shown below.
                If that is wrong, pick a different record or contact us and we will sort it out.
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.1rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.25rem" }}>
        What do you need?
      </div>
      <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0 0 1rem", lineHeight: 1.55 }}>
        {isPC
          ? "Professional-corporation pricing, shown all-in. Your corporation carries through to the next step."
          : "Standard corporate pricing applies to this record. Your corporation carries through to the next step."}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
        {PRO_CORP_EXISTING_SERVICES.map((key) => {
          const svc = PRO_CORP_SERVICES[key];
          return (
            <a
              key={svc.key}
              href={serviceHref(key)}
              style={{ display: "flex", gap: "0.9rem", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.15rem", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", textDecoration: "none", background: "var(--card)", boxShadow: "var(--shadow-card)" }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="card-heading" style={{ fontSize: "0.95rem" }}>{svc.shortLabel}</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", marginTop: "0.2rem", lineHeight: 1.5 }}>
                  {svc.blurb}
                </div>
              </div>
              <div style={{ flexShrink: 0, textAlign: "right" }}>
                {isPC && (
                  <div style={{ fontWeight: 700, color: "var(--gold)", fontSize: "0.9rem", whiteSpace: "nowrap" }}>
                    {svc.priceLabel.replace(" all-in + GST", "")}
                    {svc.perYear ? <span style={{ color: "var(--text-muted)", fontWeight: 500, fontSize: "0.78rem" }}>/yr</span> : null}
                  </div>
                )}
                <ArrowRight size={15} style={{ color: "var(--text-muted)", marginTop: "0.25rem" }} />
              </div>
            </a>
          );
        })}
      </div>

      <div style={{ marginTop: "1.25rem", fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6 }}>
        All prices + GST. Registry filings are the CRS side of the job — your regulator&rsquo;s permit
        or certificate of authorization renews separately.
      </div>
    </div>
  );
}
