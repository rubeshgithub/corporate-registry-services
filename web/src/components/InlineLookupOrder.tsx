"use client";

import { useEffect, useRef, useState } from "react";
import { Search, CheckCircle2, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { calculateAnnualReturnDeadline, type DueStatus } from "@/lib/annual-return-deadlines";
import { REGISTRY_CLOSURE_NOTE } from "@/lib/sla";
import { swapPrice } from "@/lib/price-catalogue";
import RegistryAccessField from "@/components/order/RegistryAccessField";
import RegistrySearchZeroResultsHelp from "@/components/RegistrySearchZeroResultsHelp";
import SnapshotCapture from "@/components/SnapshotCapture";
import RegistrySearchZeroResultsModal from "@/components/RegistrySearchZeroResultsModal";
import { type RegistryAccessState } from "@/lib/registry-access";
import { JURISDICTIONS } from "@/lib/service-config";
import { parseRegistryDate } from "@/lib/dates";

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
    ctaSubline: "Government fee included. Filed within 1 business day.",
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

/* ── Federal fallback on provincial pages ────────────────────────────────
   A visitor on a provincial page who finds nothing is often not mistyping —
   they have a FEDERAL corporation and assume it belongs to the province it
   operates in (a Vancouver CBCA company on the BC annual-report page). When
   the provincial search comes back empty we re-check Corporations Canada
   only, and show a hit only if it is plainly the company they typed: every
   significant word of the query in the name, or — for a number query — the
   number itself. A widened search that returns lookalikes reads as an answer
   and is not (see 7773621), so near-misses stay out. */
const FEDERAL_NOTE: Record<Service, string> = {
  "annual-return":  "Federally incorporated companies file their annual return with Corporations Canada, not the provincial registry — pick it below and we'll file the federal return instead.",
  "profile-report": "A federal corporation's profile report comes from Corporations Canada — pick it below and we'll order that one instead.",
  "good-standing":  "A federal corporation's certificate is issued by Corporations Canada — pick it below and we'll order that one instead.",
};

const NAME_NOISE = new Set([
  "inc", "incorporated", "ltd", "limited", "corp", "corporation", "co", "company",
  "ltee", "limitee", "the", "and", "et",
]);

function nameTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !NAME_NOISE.has(t));
}

/** True only when the federal hit is the corporation the visitor typed. */
function isFederalMatch(q: string, hit: RegistryHit): boolean {
  const numbers = q.match(/\d{6,}/g);
  if (numbers) {
    const hay = [hit.registryId, hit.businessNumber, hit.name].map((v) => (v ?? "").replace(/\s+/g, ""));
    return numbers.some((n) => hay.some((h) => h.includes(n)));
  }
  const want = nameTokens(q);
  if (!want.length) return false;
  const have = new Set(nameTokens(hit.name));
  return want.every((t) => have.has(t));
}

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
  priceCents,
  thirdParty = false,
  prices,
}: {
  service:     Service;
  provinceKey: string | null;   // from inferServiceContext.jurisdictionKey
  srcTag:      string;          // e.g. "inline-article-how-to-file-...-alberta"
  urgency?:    InlineUrgency | null; // subtle deadline reminder inside the card
  eyebrowOverride?: string | null;   // per-article mono chip override
  titleOverride?:   string | null;   // per-article headline override
  subOverride?:     string | null;   // per-article sub-line override
  priceCents?:      number;          // live catalogue price — swaps the "$X" in the pay button
  /* Pages where visitors look up SOMEONE ELSE'S company (registry search,
     verification, due diligence): each result offers the three things such
     a visitor buys — profile report, good standing, document copies — plus a
     line explaining what the paid report adds over the free search. */
  thirdParty?:      boolean;
  prices?:          Record<string, number>;   // live catalogue, needed when thirdParty
}) {
  const base = HEADLINES[service];
  const copy = {
    ...base,
    eyebrow: eyebrowOverride ?? base.eyebrow,
    title:   titleOverride   ?? base.title,
    sub:     subOverride     ?? base.sub,
    /* The literal in HEADLINES is a code default; the server page passes the
       catalogue price so the button never quotes a stale number. */
    buttonLabel: priceCents != null ? swapPrice(base.buttonLabel, priceCents) : base.buttonLabel,
  };

  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState<RegistryHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  /* Set only by an explicit (non-silent) search that came back empty — see
     runSearch. Keyed to the query that produced it so it clears the moment
     the visitor edits the box. */
  const [zeroHelpFor, setZeroHelpFor] = useState<string | null>(null);
  /* Registry name when this jurisdiction cannot be searched at all. */
  const [noLiveRegistry, setNoLiveRegistry] = useState<string | null>(null);
  /* Registries we can't search (PEI, NL, Yukon, NB, NWT, Nunavut): a
     zero-result Find opens a popup offering a free hand-searched snapshot.
     Once closed for a query it stays closed; the inline offer remains. */
  const [popupDismissedFor, setPopupDismissedFor] = useState<string | null>(null);
  /* The results on screen came from the federal fallback, not this page's
     province — drives the "is this your company?" notice. */
  const [federalFallback, setFederalFallback] = useState(false);

  const [pick, setPick]           = useState<RegistryHit | null>(null);
  /* Which product the visitor chose on the card. Defaults to the page's own
     service; a third-party card can switch it to good standing. */
  const [activeService, setActiveService] = useState<Service>(service);
  const activeCents = activeService === service ? priceCents : prices?.[activeService];
  const payLabel    = activeCents != null
    ? swapPrice(HEADLINES[activeService].buttonLabel, activeCents)
    : HEADLINES[activeService].buttonLabel;
  const fmtPrice    = (key: string, fallback: number) => `$${Math.round((prices?.[key] ?? fallback) / 100).toLocaleString()}`;
  const [contact, setContact]     = useState({ name: "", email: "", phone: "" });
  const [hasChanges, setHasChanges]   = useState(false);
  const [changesNote, setChangesNote] = useState("");
  const [paying, setPaying]       = useState(false);
  const [payErr, setPayErr]       = useState("");
  /* The credential the registry needs before it will accept the filing.
     The field renders itself only where the jurisdiction requires one, so
     it is safe to mount unconditionally. */
  const [registryAccess, setRegistryAccess] = useState<RegistryAccessState>({ status: "", code: "" });

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
      /* deep=1 only on an explicit Find. A debounced keystroke must not reach
         the PEI upstream — one call per character is what got that
         integration blocked (see lib/pei-budget.ts). */
      const deep = opts?.silent ? "" : "&deep=1";
      const res  = await fetch(`/api/company-search?q=${encodeURIComponent(q)}&province=${prov}${deep}`);
      const data = await res.json();
      let hits: RegistryHit[] = data.results ?? [];
      trackSearch(q, prov, data.total ?? hits.length);

      /* Provincial page, explicit Find, a real empty answer (not a registry
         we couldn't reach, not one the server already widened to all of
         Canada — that widening includes federal) → check Corporations Canada. */
      let fellBack = false;
      if (
        !hits.length && !opts?.silent &&
        provinceKey && provinceKey !== "federal" &&
        !data?.noLiveSearch && !data?.error
      ) {
        try {
          const fres  = await fetch(`/api/company-search?q=${encodeURIComponent(q)}&province=federal&deep=1`);
          const fdata = await fres.json();
          const fhits = ((fdata.results ?? []) as RegistryHit[])
            .filter((h) => h.provinceKey === "federal" && isFederalMatch(q, h));
          if (fhits.length) { hits = fhits; fellBack = true; }
        } catch { /* the fallback is a bonus — the zero-result path below still runs */ }
      }
      setResults(hits);
      setFederalFallback(fellBack);

      /* This jurisdiction has no searchable index of its own (PEI, NL, NB,
         NWT, Yukon, Nunavut), so the server widened the search to all of
         Canada. Only mention the unreachable registry if that STILL found
         nothing — otherwise we found their company and the jurisdiction
         question never mattered. */
      setNoLiveRegistry(data?.noLiveSearch && !hits.length ? String(data.registryName ?? "that registry") : null);
      // Silent (debounced) fires don't surface the "no matches" copy — that
      // fires only when the user explicitly clicks Find, so we're not
      // chastising them mid-type when they're still assembling the query.
      /* Offer a human only on an explicit Find that found nothing — never on
         a debounced fire, so we don't interrupt someone still typing. Whole
         provinces are missing upstream (Newfoundland isn't in Canada Business
         Registries at all), so "no matches" here often means our data can't
         answer, not that the corporation doesn't exist. */
      if (!hits.length && !opts?.silent) {
        /* Distinguish "we searched and found nothing" from "we couldn't
           search". The API answers a failed upstream with 200-shaped JSON
           carrying `error` (PEI's registry is currently blocked from our
           host), and fetch doesn't throw on it — so without this check the
           visitor is told their corporation has no record when in fact we
           never reached the registry. */
        setSearchErr(
          data?.error
            ? "We couldn't reach that registry just now — so this is a search problem, not a missing corporation."
            : "No matching records. Try the exact registered name, or scroll down to search all of Canada.");
        setZeroHelpFor(q);
      } else if (hits.length) {
        setZeroHelpFor(null);
      }
    } catch {
      if (!opts?.silent) {
        setSearchErr("Search is temporarily unavailable. Please try again.");
      }
      setResults([]);
      setFederalFallback(false);
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
    /* Editing the box invalidates whatever is on screen: clear the results
       and any message, so nothing claims to describe a query that has since
       changed. The search itself waits for Find. */
    if (query.trim() !== lastFiredRef.current && (results.length || searchErr)) {
      setResults([]);
      setSearchErr("");
      setZeroHelpFor(null);
      setFederalFallback(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, pick]);

  const canPay =
    !!pick &&
    !!contact.name.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) &&
    !!contact.phone.trim();

  /* Orders that came through the federal fallback are tagged so the admin
     dashboard can tell whether this path earns its keep. */
  const orderSrc =
    pick?.provinceKey === "federal" && provinceKey && provinceKey !== "federal"
      ? `${srcTag}-federal-fallback`
      : srcTag;

  const submit = async () => {
    if (!pick || !canPay) return;
    setPayErr("");
    setPaying(true);
    try {
      // annual-return has its own dedicated endpoint (multi-year, changes
      // payload). profile-report and good-standing share /api/order/report
      // and are differentiated by the `service` field in the body.
      const endpoint = activeService === "annual-return" ? "/api/order/annual-return" : "/api/order/report";
      const body =
        activeService === "annual-return"
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
              registryAccess,
              src: orderSrc,
            }
          : {
              service: activeService, // "profile-report" | "good-standing"
              hit:     pick,
              contact,
              src:     orderSrc,
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

          {/* Inline only — no auto-opening modal. This widget sits mid-article,
              and the reader hasn't asked for a dialog; the standalone search
              page is the place for that. Rendered only while the failed query
              is still in the box, so editing it dismisses the offer. */}
          {zeroHelpFor && zeroHelpFor === query.trim() && results.length === 0 && (
            <div
              style={{
                marginTop:    "0.85rem",
                paddingTop:   "0.9rem",
                borderTop:    "1px dashed var(--border)",
              }}
            >
              {noLiveRegistry && (
                <p style={{ fontSize: "0.85rem", color: "var(--text)", margin: "0 0 0.7rem", lineHeight: 1.6, fontWeight: 500 }}>
                  {noLiveRegistry} doesn&rsquo;t publish a search we can query — so an empty result here
                  would tell you nothing. Leave the details and we&rsquo;ll check it by hand.
                </p>
              )}
              <RegistrySearchZeroResultsHelp
                query={zeroHelpFor}
                province={provinceKey ?? "all"}
              />
            </div>
          )}

          {federalFallback && results.length > 0 && (
            <div
              style={{
                marginTop:    "0.85rem",
                padding:      "0.75rem 0.9rem",
                border:       "1px solid var(--gold)",
                borderRadius: "0.5rem",
                background:   "var(--bg-deep)",
                fontSize:     "0.84rem",
                lineHeight:   1.55,
                color:        "var(--text)",
              }}
            >
              <strong>
                No {JURISDICTIONS.find((j) => j.key === provinceKey)?.label ?? "provincial"} corporation matched
                {" "}&mdash; but we found {results.length > 1 ? "federal corporations" : "a federal corporation"} with
                {" "}this name. Is {results.length > 1 ? "one of these" : "this"} your company?
              </strong>{" "}
              <span style={{ color: "var(--text-muted)" }}>{FEDERAL_NOTE[service]}</span>
            </div>
          )}

          {thirdParty && results.length > 0 && !federalFallback && (
            <p style={{ margin: "0.85rem 0 0", fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.55 }}>
              <strong style={{ color: "var(--text)" }}>The free search shows status.</strong>{" "}
              The official profile report adds directors, registered office and filing history — a PDF
              from the government registry, accepted by banks and QuickBooks.
            </p>
          )}

          {results.length > 1 && (
            <div style={{ marginTop: "1rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              <strong style={{ color: "var(--text)" }}>
                {results.length > 3 ? `Top 3 of ${results.length} matches` : `${results.length} corporations match`}
              </strong>{" "}
              for &ldquo;{query.trim()}&rdquo;. Check the name and registry details to pick the right one.
            </div>
          )}

          {results.length > 0 && (
            <div style={{ marginTop: results.length > 1 ? "0.6rem" : "0.85rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {results.slice(0, 3).map((hit, i) => (
                <ResultCard
                  key={`${hit.provinceKey}-${hit.registryId}-${i}`}
                  hit={hit}
                  service={service}
                  onSelect={() => {
                    /* Alberta annual returns go to the enriched profile page —
                       its main button IS the annual return, with live status
                       and history. Every other service orders right here: a
                       visitor who clicked "Order Profile Report" must not land
                       on a page selling an annual return. */
                    if (service === "annual-return" && hit.provinceKey === "ab" && hit.registryId) {
                      window.location.href = `/corporation/${hit.registryId}?src=article-${srcTag}`;
                      return;
                    }
                    setActiveService(service);
                    setPick(hit);
                  }}
                  offers={thirdParty ? [
                    {
                      key:     "profile-report",
                      title:   "Profile report",
                      price:   fmtPrice("profile-report", priceCents ?? 6900),
                      blurb:   "Directors, registered office and filing history. PDF within one business hour.",
                      primary: true,
                      onClick: () => { setActiveService("profile-report"); setPick(hit); },
                    },
                    {
                      key:     "good-standing",
                      title:   "Certificate of good standing",
                      price:   fmtPrice("good-standing", 10900),
                      blurb:   "Government proof the corporation is active, for banks, lenders and contracts.",
                      onClick: () => { setActiveService("good-standing"); setPick(hit); },
                    },
                    {
                      key:     "documents",
                      title:   "Copies of documents",
                      price:   `from ${fmtPrice("corporate-document-single", 8900)}`,
                      blurb:   "Articles, certificate of incorporation, annual returns. Priced per document.",
                      href:    `/order/corporate-documents?${new URLSearchParams({
                        q: hit.name, jurisdiction: hit.provinceKey, registryId: hit.registryId || "", src: srcTag,
                      }).toString()}`,
                    },
                  ] : undefined}
                  snapshot={
                    <SnapshotCapture
                      variant="strip"
                      registryId={hit.registryId}
                      provinceKey={hit.provinceKey}
                      name={hit.name}
                      src={srcTag}
                      detailsHref={hit.provinceKey === "ab" && hit.registryId && service !== "annual-return"
                        ? `/corporation/${hit.registryId}?src=${srcTag}&intent=${service}`
                        : undefined}
                    />
                  }
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
            <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "0.45rem" }}>
              Ordering: <strong style={{ color: "var(--text)" }}>
                {activeService === "good-standing" ? "Certificate of Good Standing"
                  : activeService === "annual-return" ? "Annual return filing" : "Corporate Profile Report"}
              </strong>
            </div>
            <button
              type="button"
              onClick={() => setPick(null)}
              style={{ marginTop: "0.4rem", background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.72rem", cursor: "pointer", padding: 0, display: "block" }}
            >
              ← Pick a different company
            </button>
          </div>

          {activeService === "profile-report" && pick.status !== "Active" && (
            <div style={{ padding: "0.6rem 0.85rem", background: "rgba(180,83,9,0.08)", color: "#B45309", fontSize: "0.78rem", borderRadius: "0.4rem", marginBottom: "0.75rem" }}>
              Heads-up — this corporation is not currently active. The profile report will reflect its actual registry status.
            </div>
          )}

          {activeService === "good-standing" && pick.status !== "Active" && (
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
          {activeService === "annual-return" && (
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

          <RegistryAccessField
            service={activeService}
            provinceKey={pick?.provinceKey ?? provinceKey}
            jurisdictionLabel={pick?.jurisdiction}
            value={registryAccess}
            onChange={setRegistryAccess}
          />

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
              <>{payLabel} <ArrowRight size={16} /></>
            )}
          </button>
          <p style={{ color: "var(--text-muted)", fontSize: "0.7rem", textAlign: "center", marginTop: "0.55rem" }}>
            Card processed securely by Stripe. {HEADLINES[activeService].ctaSubline} {REGISTRY_CLOSURE_NOTE}
          </p>
        </>
      )}

      {!pick && noLiveRegistry && provinceKey && zeroHelpFor && zeroHelpFor === query.trim()
        && results.length === 0 && popupDismissedFor !== zeroHelpFor && (
        <RegistrySearchZeroResultsModal
          query={zeroHelpFor}
          province={provinceKey}
          onClose={() => setPopupDismissedFor(zeroHelpFor)}
        />
      )}
    </div>
  );
}

/* ─────────────────────── Enriched result card ─────────────────────── */

type Offer = {
  key:      string;
  title:    string;
  price:    string;
  blurb:    string;
  primary?: boolean;
  onClick?: () => void;
  href?:    string;
};

function ResultCard({
  hit,
  service,
  onSelect,
  offers,
  snapshot,
}: {
  hit:       RegistryHit;
  service:   Service;
  onSelect:  () => void;
  offers?:   Offer[];
  snapshot?: React.ReactNode;
}) {
  const isAnnualReturn = service === "annual-return";
  const deadline = isAnnualReturn
    ? calculateAnnualReturnDeadline(hit.registrationDate, hit.provinceKey)
    : null;

  const incorpLabel = hit.registrationDate
    ? parseRegistryDate(hit.registrationDate)?.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const buttonLabel =
    service === "annual-return"  ? "File annual return" :
    service === "good-standing"  ? "Order certificate" :
                                   "Order profile report";

  const active = hit.status === "Active";

  return (
    <div
      style={{
        background:   "var(--card)",
        border:       `1px solid ${deadline?.status === "overdue" ? "rgba(220, 38, 38, 0.55)" : "var(--border)"}`,
        borderRadius: "0.6rem",
        overflow:     "hidden",
        boxShadow:    "0 1px 2px rgba(0,61,91,0.06), 0 6px 18px rgba(0,61,91,0.07)",
        borderTop:    "3px solid var(--primary)",
      }}
    >
      {/* The record: who the corporation is, as the registry has it. */}
      <div style={{ padding: "0.95rem 1.05rem 0.85rem", display: "flex", gap: "0.9rem", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 16rem" }}>
          <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontWeight: 700, fontSize: "1.08rem", color: "var(--text)", lineHeight: 1.25, overflowWrap: "anywhere" }}>
            {hit.name}
          </div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            {[hit.entityType, hit.jurisdiction].filter(Boolean).join(", ")}
          </div>
          <dl style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem 1.25rem", margin: "0.6rem 0 0", fontSize: "0.78rem" }}>
            <Fact label="Registry ID"   value={hit.registryId} />
            <Fact label="Business no."  value={hit.businessNumber} />
            <Fact label="Incorporated"  value={incorpLabel ?? ""} />
          </dl>
          {deadline && deadline.status !== "unknown" && (
            <div
              style={{
                fontSize:    "0.8rem",
                marginTop:   "0.5rem",
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
            <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
              {deadline.explanation}
            </div>
          )}
          {deadline && deadline.status === "unknown" && (
            <div style={{ fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "0.45rem" }}>
              {deadline.label}
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.6rem", flexShrink: 0 }}>
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.35rem",
              padding: "0.2rem 0.6rem", borderRadius: "9999px",
              fontSize: "0.74rem", fontWeight: 700,
              color:      active ? "#15803D" : "#B45309",
              background: active ? "rgba(22,163,74,0.10)" : "rgba(180,83,9,0.10)",
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: active ? "#16A34A" : "#D97706" }} />
            {hit.status}{!active && hit.statusNotes ? ` (${hit.statusNotes})` : ""}
          </span>
          {!offers && (
            <button type="button" onClick={onSelect} className="crs-card-cta">
              {buttonLabel} <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>

      {/* What you can get: one joined row, the profile report leading. */}
      {offers && (
        <div style={{ padding: "0 1.05rem 1rem" }}>
          <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text)", margin: "0 0 0.5rem" }}>
            Official records for this corporation
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(11.5rem, 1fr))",
              gap: "1px",
              background: "var(--border)",
              border: "1px solid var(--border)",
              borderRadius: "0.55rem",
              overflow: "hidden",
            }}
          >
            {offers.map((o) => {
              const inner = (
                <>
                  <span style={{ display: "block", fontSize: "0.84rem", fontWeight: 700, lineHeight: 1.3 }}>{o.title}</span>
                  <span style={{ display: "block", fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.35rem", fontWeight: 700, lineHeight: 1.15, margin: "0.3rem 0 0.25rem", color: o.primary ? "var(--gold)" : "var(--text)" }}>
                    {o.price}
                  </span>
                  <span style={{ display: "block", fontSize: "0.74rem", lineHeight: 1.45, opacity: o.primary ? 0.85 : 1, color: o.primary ? "#FFFFFF" : "var(--text-muted)" }}>
                    {o.blurb}
                  </span>
                  <span style={{ display: "inline-block", marginTop: "0.6rem", fontSize: "0.78rem", fontWeight: 700, color: o.primary ? "var(--gold)" : "var(--primary)", borderBottom: `1.5px solid ${o.primary ? "var(--gold)" : "var(--primary)"}` }}>
                    {o.href ? "Choose documents" : "Order now"}
                  </span>
                </>
              );
              const cls = `crs-offer${o.primary ? " crs-offer--primary" : ""}`;
              return o.href ? (
                <a key={o.key} href={o.href} className={cls}>{inner}</a>
              ) : (
                <button key={o.key} type="button" onClick={o.onClick} className={cls}>{inner}</button>
              );
            })}
          </div>
        </div>
      )}

      {snapshot && (
        <div style={{ background: "var(--bg-deep)", borderTop: "1px solid var(--border)", padding: "0.8rem 1.05rem" }}>
          {snapshot}
        </div>
      )}

      <style>{`
        .crs-offer {
          display: block; text-align: left; padding: 0.85rem 0.95rem 0.9rem;
          background: var(--card); color: var(--text); border: none; margin: 0;
          font: inherit; cursor: pointer; text-decoration: none;
          transition: background-color 0.15s ease;
        }
        .crs-offer:hover { background: var(--bg-deep); }
        .crs-offer--primary { background: var(--primary); color: #FFFFFF; }
        .crs-offer--primary:hover { background: var(--primary); filter: brightness(1.12); }
        .crs-offer:focus-visible, .crs-card-cta:focus-visible {
          outline: 2px solid var(--gold); outline-offset: -2px;
        }
        .crs-card-cta {
          display: inline-flex; align-items: center; gap: 0.35rem;
          padding: 0.6rem 1rem; border: none; border-radius: 0.45rem;
          background: var(--primary); color: #FFFFFF; font-weight: 700; font-size: 0.86rem;
          cursor: pointer; white-space: nowrap; font-family: inherit;
        }
        @media (prefers-reduced-motion: reduce) { .crs-offer { transition: none; } }
      `}</style>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", gap: "0.35rem", alignItems: "baseline" }}>
      <dt style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd style={{ margin: 0, color: "var(--text)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</dd>
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
