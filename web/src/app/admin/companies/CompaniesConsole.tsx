"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, ArrowUpDown, Sparkles } from "lucide-react";

/**
 * /admin/companies — filtered view of the crs.companies collection.
 *
 * Left column: filter panel (status, entity type, first/last event date,
 *   city, text search) + sort selector.
 * Right column: results table + pagination.
 *
 * All state is driven from React state — no URL sync yet (Phase 2 can wire
 * useSearchParams so operators can bookmark filter combos).
 */

type CompanyRow = {
  corpNumber:    string;
  name:          string;
  entityType:    string;
  city:          string;
  postal:        string;
  status:        string;
  lastEventDate: string | null;
  lastIssue:     string;
  firstEventDate: string | null;
  live:          string | null;
  enrichStatus:  string | null;
  suppressed:    boolean;
  email:         string | null;
  phone:         string | null;
  website:       string | null;
};

type ApiResponse = {
  results: CompanyRow[];
  total:   number;
  skip:    number;
  limit:   number;
  hasMore: boolean;
};

/* ── Filter options ────────────────────────────────────────────── */

const STATUSES = [
  "Incorporated",
  "Registered",
  "Renamed",
  "Revived",
  "Amalgamated",
  "Dissolved/Struck Off",
  "Liable For Dissolution",
  "Intent To Dissolve",
];

const ENTITY_TYPES = [
  "Named Alberta Corporation",
  "Numbered Alberta Corporation",
  "Federal Corporation",
  "Other Prov/Territory Corps",
  "Alberta Business Corporation",
  "Alberta Society",
  "Alberta Cooperative",
  "Medical Professional Corporation",
  "Legal Professional Corporation",
  "Dental Professional Corporation",
  "Chiropractic Professional Corporation",
  "Optometric Professional Corporation",
  "Veterinary Professional Corporation",
  "Engineering Professional Corporation",
  "Extra-Provincial",
  "Religious Society",
];

const SORT_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "lastEvent",  label: "Last event" },
  { key: "firstEvent", label: "First event (~incorp)" },
  { key: "name",       label: "Name" },
];

/* ── Preset segments ───────────────────────────────────────────── */

/** Each preset is a URL query-param bag. Clicking a preset button
 *  navigates to /admin/companies?<params>, which resets the state and
 *  re-fetches. Keeps presets composable with URL bookmarking — a preset
 *  URL is just a filter combo the operator can also build by hand. */
type PresetKey = "fresh" | "struck" | "revived" | "not-emailed" | "not-enriched";

type PresetSpec = {
  key:     PresetKey;
  label:   string;
  hint:    string;
  params:  () => Record<string, string>;
};

/** ISO YYYY-MM-DD for N days ago (computed at click time so presets
 *  always mean "today minus N", not "the day the page loaded"). */
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

const PRESETS: PresetSpec[] = [
  {
    key:    "fresh",
    label:  "Fresh registrations (90d)",
    hint:   "Corps incorporated / registered in the last 90 days — their first annual return is coming up.",
    params: () => ({
      status:    "Incorporated,Registered",
      firstFrom: daysAgo(90),
      sort:      "firstEvent",
      dir:       "desc",
    }),
  },
  {
    key:    "struck",
    label:  "Recently struck (90d)",
    hint:   "Corps dissolved or struck off in the last 90 days — reactivation / revival leads. Wider than 30d because the Alberta gazette publishes struck notices with a 30–45 day lag.",
    params: () => ({
      status:   "Dissolved/Struck Off",
      lastFrom: daysAgo(90),
      sort:     "lastEvent",
      dir:      "desc",
    }),
  },
  {
    key:    "revived",
    label:  "Revived (90d)",
    hint:   "Corps that just came back from struck-off in the last 90 days — high-intent (they paid the gov to revive).",
    params: () => ({
      status:   "Revived",
      lastFrom: daysAgo(90),
      sort:     "lastEvent",
      dir:      "desc",
    }),
  },
  {
    key:    "not-emailed",
    label:  "Never emailed",
    hint:   "Corps with a contact email that we've never sent outreach to.",
    params: () => ({
      emailed: "false",
      sort:    "lastEvent",
      dir:     "desc",
    }),
  },
  {
    key:    "not-enriched",
    label:  "Not yet enriched",
    hint:   "Corps whose contact.enrichStatus is pending — enrichment queue.",
    params: () => ({
      enriched: "false",
      sort:     "lastEvent",
      dir:      "desc",
    }),
  },
];

/* ── Component ─────────────────────────────────────────────────── */

const PAGE_SIZE = 50;

export default function CompaniesConsole() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  /* Hydrate filter state from URL on first mount so bookmarked / preset
     URLs work + operators can share filter combos. */
  const initial = readParams(searchParams);

  /* Filter state */
  const [status,    setStatus]    = useState<string[]>(initial.status);
  const [entity,    setEntity]    = useState<string[]>(initial.entity);
  const [firstFrom, setFirstFrom] = useState(initial.firstFrom);
  const [firstTo,   setFirstTo]   = useState(initial.firstTo);
  const [lastFrom,  setLastFrom]  = useState(initial.lastFrom);
  const [lastTo,    setLastTo]    = useState(initial.lastTo);
  const [city,      setCity]      = useState(initial.city);
  const [q,         setQ]         = useState(initial.q);
  const [emailed,   setEmailed]   = useState<"" | "false">(initial.emailed);
  const [enriched,  setEnriched]  = useState<"" | "false">(initial.enriched);
  const [sort,      setSort]      = useState(initial.sort);
  const [dir,       setDir]       = useState<"asc" | "desc">(initial.dir);

  /* Data state */
  const [rows,       setRows]     = useState<CompanyRow[]>([]);
  const [total,      setTotal]    = useState(0);
  const [skip,       setSkip]     = useState(0);
  const [hasMore,    setHasMore]  = useState(false);
  const [loading,    setLoading]  = useState(false);
  const [err,        setErr]      = useState("");

  const fetchPage = useCallback(async (skipOverride?: number) => {
    setLoading(true);
    setErr("");
    try {
      const s = skipOverride ?? skip;
      const url = new URL("/api/admin/companies", window.location.origin);
      if (status.length) url.searchParams.set("status", status.join(","));
      if (entity.length) url.searchParams.set("entity", entity.join(","));
      if (firstFrom) url.searchParams.set("firstFrom", firstFrom);
      if (firstTo)   url.searchParams.set("firstTo",   firstTo);
      if (lastFrom)  url.searchParams.set("lastFrom",  lastFrom);
      if (lastTo)    url.searchParams.set("lastTo",    lastTo);
      if (city)      url.searchParams.set("city",      city);
      if (q)         url.searchParams.set("q",         q);
      if (emailed)   url.searchParams.set("emailed",   emailed);
      if (enriched)  url.searchParams.set("enriched",  enriched);
      url.searchParams.set("sort",  sort);
      url.searchParams.set("dir",   dir);
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("skip",  String(s));

      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ApiResponse = await res.json();
      setRows(data.results);
      setTotal(data.total);
      setSkip(data.skip);
      setHasMore(data.hasMore);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Fetch failed.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, entity, firstFrom, firstTo, lastFrom, lastTo, city, q, emailed, enriched, sort, dir, skip]);

  /* Auto-load the first page on mount. Reads use the state hydrated
     from the URL so bookmarks / preset URLs produce the right first
     fetch. */
  useEffect(() => { void fetchPage(0); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  /* URL sync — reflect current filter state into the URL so the current
     view is bookmarkable + shareable. router.replace (not push) so
     back-button behaviour stays sane; we don't want each filter change to
     stack a browser history entry. */
  const firstSyncRef = useRef(true);
  useEffect(() => {
    if (firstSyncRef.current) { firstSyncRef.current = false; return; }
    const sp = new URLSearchParams();
    if (status.length) sp.set("status", status.join(","));
    if (entity.length) sp.set("entity", entity.join(","));
    if (firstFrom) sp.set("firstFrom", firstFrom);
    if (firstTo)   sp.set("firstTo",   firstTo);
    if (lastFrom)  sp.set("lastFrom",  lastFrom);
    if (lastTo)    sp.set("lastTo",    lastTo);
    if (city)      sp.set("city",      city);
    if (q)         sp.set("q",         q);
    if (emailed)   sp.set("emailed",   emailed);
    if (enriched)  sp.set("enriched",  enriched);
    if (sort !== "lastEvent") sp.set("sort", sort);
    if (dir  !== "desc")      sp.set("dir",  dir);
    const qs = sp.toString();
    router.replace(qs ? `/admin/companies?${qs}` : "/admin/companies", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, entity, firstFrom, firstTo, lastFrom, lastTo, city, q, emailed, enriched, sort, dir]);

  const applyFilters = () => { void fetchPage(0); };
  const nextPage     = () => { const s = skip + PAGE_SIZE; void fetchPage(s); };
  const prevPage     = () => { const s = Math.max(0, skip - PAGE_SIZE); void fetchPage(s); };

  const resetFilters = () => {
    setStatus([]); setEntity([]);
    setFirstFrom(""); setFirstTo(""); setLastFrom(""); setLastTo("");
    setCity(""); setQ("");
    setEmailed(""); setEnriched("");
    setSort("lastEvent"); setDir("desc");
    setTimeout(() => void fetchPage(0), 0);
  };

  /** Preset click — set every filter state at once from a preset spec.
   *  Clears the manual filters we're not overriding so the preset gives a
   *  clean, opinionated view. Then fetches. */
  const applyPreset = (spec: PresetSpec) => {
    const p = spec.params();
    setStatus   (p.status    ? p.status.split(",")    : []);
    setEntity   (p.entity    ? p.entity.split(",")    : []);
    setFirstFrom(p.firstFrom ?? "");
    setFirstTo  (p.firstTo   ?? "");
    setLastFrom (p.lastFrom  ?? "");
    setLastTo   (p.lastTo    ?? "");
    setCity     (p.city      ?? "");
    setQ        (p.q         ?? "");
    setEmailed  ((p.emailed  as "false" | undefined) ?? "");
    setEnriched ((p.enriched as "false" | undefined) ?? "");
    setSort     (p.sort      ?? "lastEvent");
    setDir      ((p.dir      as "asc" | "desc" | undefined) ?? "desc");
    setTimeout(() => void fetchPage(0), 0);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", padding: "2rem 1.5rem" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        <TopBar />
        <PresetBar onApply={applyPreset} loading={loading} />
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "1.25rem", alignItems: "start" }}>
          <FilterPanel
            status={status} setStatus={setStatus}
            entity={entity} setEntity={setEntity}
            firstFrom={firstFrom} setFirstFrom={setFirstFrom}
            firstTo={firstTo}     setFirstTo={setFirstTo}
            lastFrom={lastFrom}   setLastFrom={setLastFrom}
            lastTo={lastTo}       setLastTo={setLastTo}
            city={city} setCity={setCity}
            q={q}       setQ={setQ}
            sort={sort} setSort={setSort}
            dir={dir}   setDir={setDir}
            onApply={applyFilters}
            onReset={resetFilters}
            loading={loading}
          />
          <ResultsPanel
            rows={rows}
            total={total}
            skip={skip}
            hasMore={hasMore}
            loading={loading}
            err={err}
            onNext={nextPage}
            onPrev={prevPage}
          />
        </div>
      </div>
    </div>
  );
}

/* ── URL param hydration ───────────────────────────────────────── */

/** Read the current URL into an initial state bag. Runs once on mount so
 *  bookmarked / preset URLs produce the right initial view. */
function readParams(sp: ReturnType<typeof useSearchParams>) {
  const get = (k: string) => sp?.get(k) ?? "";
  const csv = (k: string) => {
    const v = get(k);
    return v ? v.split(",").map((x) => x.trim()).filter(Boolean) : [];
  };
  const emailedRaw  = get("emailed");
  const enrichedRaw = get("enriched");
  const dirRaw      = get("dir");
  return {
    status:    csv("status"),
    entity:    csv("entity"),
    firstFrom: get("firstFrom"),
    firstTo:   get("firstTo"),
    lastFrom:  get("lastFrom"),
    lastTo:    get("lastTo"),
    city:      get("city"),
    q:         get("q"),
    emailed:   (emailedRaw  === "false" ? "false" : "") as "" | "false",
    enriched:  (enrichedRaw === "false" ? "false" : "") as "" | "false",
    sort:      get("sort") || "lastEvent",
    dir:       (dirRaw === "asc" ? "asc" : "desc") as "asc" | "desc",
  };
}

/* ── Sub-components ────────────────────────────────────────────── */

function PresetBar({ onApply, loading }: {
  onApply: (spec: PresetSpec) => void;
  loading: boolean;
}) {
  return (
    <div
      style={{
        ...cardStyle,
        marginBottom: "1rem",
        display:      "flex",
        flexWrap:     "wrap",
        gap:          "0.4rem",
        alignItems:   "center",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.66rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)", marginRight: "0.4rem" }}>
        <Sparkles size={12} />
        Presets
      </span>
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          disabled={loading}
          onClick={() => onApply(p)}
          title={p.hint}
          style={{
            padding:      "0.32rem 0.65rem",
            fontSize:     "0.75rem",
            background:   "var(--bg-deep)",
            color:        "var(--text)",
            border:       "1px solid var(--border)",
            borderRadius: "9999px",
            cursor:       loading ? "wait" : "pointer",
            fontWeight:   500,
            transition:   "background 0.12s, border-color 0.12s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background   = "var(--gold-dim)";
            (e.currentTarget as HTMLElement).style.borderColor  = "var(--gold)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background  = "var(--bg-deep)";
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
          }}
        >
          {p.label}
        </button>
      ))}
      <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginLeft: "auto", fontStyle: "italic" }}>
        Click to apply · URL updates so you can bookmark
      </span>
    </div>
  );
}

function TopBar() {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
        CRS Admin
      </div>
      <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", margin: "0.2rem 0 0" }}>
        Corporations
      </h1>
      <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.5rem" }}>
        <a href="/admin/analytics"          style={navTab(false)}>Analytics</a>
        <a href="/admin/outreach"           style={navTab(false)}>Outreach</a>
        <a href="/admin/search-performance" style={navTab(false)}>Search performance</a>
        <span style={navTab(true)}>Corporations</span>
      </div>
    </div>
  );
}

function FilterPanel(props: {
  status: string[]; setStatus: (v: string[]) => void;
  entity: string[]; setEntity: (v: string[]) => void;
  firstFrom: string; setFirstFrom: (v: string) => void;
  firstTo: string;   setFirstTo: (v: string) => void;
  lastFrom: string;  setLastFrom: (v: string) => void;
  lastTo: string;    setLastTo: (v: string) => void;
  city: string; setCity: (v: string) => void;
  q: string;    setQ: (v: string) => void;
  sort: string; setSort: (v: string) => void;
  dir: "asc" | "desc"; setDir: (v: "asc" | "desc") => void;
  onApply: () => void;
  onReset: () => void;
  loading: boolean;
}) {
  return (
    <aside style={{ ...cardStyle, position: "sticky", top: "1rem", maxHeight: "calc(100vh - 2rem)", overflowY: "auto" }}>
      <div style={filterHeading}>Text search</div>
      <input
        value={props.q}
        onChange={(e) => props.setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") props.onApply(); }}
        placeholder="Name or corp number"
        style={inputStyle}
      />

      <div style={{ ...filterHeading, marginTop: "1rem" }}>Status</div>
      <ChipSet options={STATUSES} value={props.status} onChange={props.setStatus} />

      <div style={{ ...filterHeading, marginTop: "1rem" }}>Entity type</div>
      <ChipSet options={ENTITY_TYPES} value={props.entity} onChange={props.setEntity} truncateAfter={6} />

      <div style={{ ...filterHeading, marginTop: "1rem" }}>First event (~incorp)</div>
      <DateRange from={props.firstFrom} setFrom={props.setFirstFrom} to={props.firstTo} setTo={props.setFirstTo} />

      <div style={{ ...filterHeading, marginTop: "1rem" }}>Last event</div>
      <DateRange from={props.lastFrom} setFrom={props.setLastFrom} to={props.lastTo} setTo={props.setLastTo} />

      <div style={{ ...filterHeading, marginTop: "1rem" }}>City (prefix)</div>
      <input
        value={props.city}
        onChange={(e) => props.setCity(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") props.onApply(); }}
        placeholder="e.g. Calgary"
        style={inputStyle}
      />

      <div style={{ ...filterHeading, marginTop: "1rem" }}>Sort</div>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        <select value={props.sort} onChange={(e) => props.setSort(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
          {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <button
          type="button"
          onClick={() => props.setDir(props.dir === "desc" ? "asc" : "desc")}
          title={props.dir === "desc" ? "Descending" : "Ascending"}
          style={{ padding: "0.45rem 0.65rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.4rem", cursor: "pointer", color: "var(--text)", fontSize: "0.78rem" }}
        >
          <ArrowUpDown size={14} style={{ verticalAlign: "middle", marginRight: "0.25rem" }} />
          {props.dir === "desc" ? "desc" : "asc"}
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.4rem", marginTop: "1.25rem" }}>
        <button
          onClick={props.onApply}
          disabled={props.loading}
          style={{
            flex: 1, padding: "0.65rem", background: "var(--primary)", color: "#fff",
            border: "none", borderRadius: "0.4rem", fontWeight: 700, fontSize: "0.85rem",
            cursor: props.loading ? "wait" : "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
          }}
        >
          {props.loading ? <Loader2 size={13} className="crs-spin" /> : <Search size={13} />}
          Apply
        </button>
        <button
          onClick={props.onReset}
          style={{ padding: "0.65rem 0.85rem", background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.4rem", cursor: "pointer", color: "var(--text-muted)", fontSize: "0.82rem" }}
        >
          Reset
        </button>
      </div>
    </aside>
  );
}

function ChipSet({ options, value, onChange, truncateAfter }: {
  options: string[]; value: string[]; onChange: (v: string[]) => void; truncateAfter?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = truncateAfter && !expanded ? options.slice(0, truncateAfter) : options;
  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((x) => x !== opt) : [...value, opt]);
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
      {shown.map((opt) => {
        const on = value.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            style={{
              padding:      "0.28rem 0.55rem",
              fontSize:     "0.72rem",
              background:   on ? "var(--gold)" : "var(--card)",
              color:        on ? "var(--primary)" : "var(--text)",
              border:       `1px solid ${on ? "var(--gold)" : "var(--border)"}`,
              borderRadius: "9999px",
              cursor:       "pointer",
              fontWeight:   on ? 700 : 500,
              transition:   "all 0.12s",
            }}
          >
            {opt}
          </button>
        );
      })}
      {truncateAfter && options.length > truncateAfter && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{
            padding: "0.28rem 0.55rem", fontSize: "0.72rem",
            background: "transparent", color: "var(--secondary)",
            border: "1px dashed var(--border)", borderRadius: "9999px",
            cursor: "pointer", fontFamily: "var(--font-mono), monospace",
          }}
        >
          {expanded ? "less" : `+${options.length - truncateAfter}`}
        </button>
      )}
    </div>
  );
}

function DateRange({ from, setFrom, to, setTo }: {
  from: string; setFrom: (v: string) => void;
  to: string;   setTo: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: "0.35rem" }}>
      <input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        style={{ ...inputStyle, flex: 1 }}
      />
      <input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        style={{ ...inputStyle, flex: 1 }}
      />
    </div>
  );
}

function ResultsPanel({ rows, total, skip, hasMore, loading, err, onNext, onPrev }: {
  rows:    CompanyRow[];
  total:   number;
  skip:    number;
  hasMore: boolean;
  loading: boolean;
  err:     string;
  onNext:  () => void;
  onPrev:  () => void;
}) {
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
          Results
        </div>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.78rem", color: "var(--text-muted)" }}>
          {loading ? "loading…" : (
            <>
              <strong style={{ color: "var(--text)" }}>{total.toLocaleString()}</strong> total ·
              {" "}showing {skip + 1}–{skip + rows.length}
            </>
          )}
        </div>
      </div>

      {err && (
        <div style={{ padding: "0.6rem 0.85rem", background: "rgba(220,38,38,0.08)", color: "#B91C1C", fontSize: "0.82rem", borderRadius: "0.4rem", marginBottom: "0.85rem" }}>
          {err}
        </div>
      )}

      {!loading && rows.length === 0 && !err && (
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "1.5rem 0", textAlign: "center", fontStyle: "italic" }}>
          No corporations match these filters.
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ background: "var(--bg-deep)" }}>
                {["Corp #", "Name", "Type", "City", "Status", "Last event", "First event", "Contact", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => <ResultRow key={r.corpNumber} row={r} />)}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "1rem", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          onClick={onPrev}
          disabled={loading || skip === 0}
          style={pagerBtn(loading || skip === 0)}
        >
          ← Previous
        </button>
        <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", color: "var(--text-muted)" }}>
          {skip === 0 ? "first page" : `skip=${skip.toLocaleString()}`}
        </div>
        <button
          onClick={onNext}
          disabled={loading || !hasMore}
          style={pagerBtn(loading || !hasMore)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function ResultRow({ row }: { row: CompanyRow }) {
  const isNumbered  = row.entityType.includes("Numbered");
  const typeShort   =
    row.entityType.includes("Named Alberta")    ? "Named AB"  :
    row.entityType.includes("Numbered Alberta") ? "Numbered"  :
    row.entityType.includes("Federal")          ? "Federal"   :
    row.entityType.includes("Other Prov")       ? "Ex-Prov"   :
    row.entityType.includes("Professional")     ? "Prof"      :
    row.entityType.includes("Society")          ? "Society"   :
    row.entityType.includes("Cooperative")      ? "Coop"      :
                                                  row.entityType.slice(0, 12);
  const statusColor =
    row.status === "Incorporated" || row.status === "Registered" || row.status === "Revived" ? "#16A34A" :
    row.status === "Dissolved/Struck Off" ? "#B91C1C" :
    row.status === "Liable For Dissolution" || row.status === "Intent To Dissolve" ? "#B45309" :
                                                                                    "var(--text-muted)";

  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontWeight: 700, color: "var(--secondary)" }}>
        <a href={`/corporation/${row.corpNumber}`} target="_blank" rel="noreferrer" style={{ color: "var(--secondary)", textDecoration: "none", borderBottom: "1px dotted var(--border)" }}>
          {row.corpNumber}
        </a>
      </td>
      <td style={{ ...tdStyle, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.name}>
        {row.name}
      </td>
      <td style={{ ...tdStyle, fontSize: "0.72rem" }}>
        <span style={{ padding: "0.1rem 0.4rem", background: isNumbered ? "var(--bg-deep)" : "rgba(212,175,55,0.14)", borderRadius: "0.25rem", fontFamily: "var(--font-mono), monospace", color: "var(--text)", whiteSpace: "nowrap" }}>
          {typeShort}
        </span>
      </td>
      <td style={{ ...tdStyle, fontSize: "0.78rem" }}>{row.city || "—"}</td>
      <td style={{ ...tdStyle, fontSize: "0.78rem", color: statusColor, fontWeight: 600 }}>
        {row.status || "—"}
      </td>
      <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.75rem", color: "var(--text-muted)" }}>
        {row.lastEventDate ? row.lastEventDate.slice(0, 10) : "—"}
      </td>
      <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.75rem", color: "var(--text-muted)" }}>
        {row.firstEventDate ? row.firstEventDate.slice(0, 10) : "—"}
      </td>
      <td style={{ ...tdStyle, fontSize: "0.72rem" }}>
        <ContactCell row={row} />
      </td>
      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
        <a
          href={`/admin/outreach?corp=${encodeURIComponent(row.corpNumber)}`}
          style={{ fontSize: "0.7rem", color: "var(--secondary)", fontFamily: "var(--font-mono), monospace", textDecoration: "none" }}
          title="Open in outreach console"
        >
          outreach →
        </a>
      </td>
    </tr>
  );
}

function ContactCell({ row }: { row: CompanyRow }) {
  if (row.suppressed) {
    return <span style={{ color: "#B45309", fontWeight: 700 }}>🚫 unsubscribed</span>;
  }
  if (row.email)   return <span style={{ color: "var(--text)", fontFamily: "var(--font-mono), monospace" }}>{row.email}</span>;
  if (row.phone)   return <span style={{ color: "var(--text-muted)" }}>☎ {row.phone}</span>;
  if (row.website) return <span style={{ color: "var(--text-muted)" }}>🌐 has site</span>;
  if (row.enrichStatus === "skip_numbered") return <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>numbered — skip</span>;
  if (row.enrichStatus === "not_found")     return <span style={{ color: "var(--text-muted)" }}>no public info</span>;
  return <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>not enriched</span>;
}

/* ── Styles ────────────────────────────────────────────────────── */

function navTab(active: boolean): React.CSSProperties {
  return {
    padding: "0.3rem 0.7rem",
    border: active ? "1px solid var(--primary)" : "1px solid var(--border)",
    background: active ? "var(--primary)" : "var(--card)",
    color: active ? "#fff" : "var(--text-muted)",
    borderRadius: "0.35rem",
    fontSize: "0.75rem",
    fontFamily: "var(--font-mono), monospace",
    textDecoration: "none",
  };
}

const cardStyle: React.CSSProperties = {
  background:    "var(--card)",
  border:        "1px solid var(--border)",
  borderRadius:  "0.75rem",
  padding:       "1.25rem 1.5rem",
  boxShadow:     "var(--shadow)",
};

const filterHeading: React.CSSProperties = {
  fontSize: "0.66rem",
  fontFamily: "var(--font-mono), monospace",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--text-muted)",
  marginBottom: "0.4rem",
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.45rem 0.6rem",
  border: "1px solid var(--border)",
  borderRadius: "0.35rem",
  fontSize: "0.82rem",
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "inherit",
};

const thStyle: React.CSSProperties = {
  padding: "0.5rem 0.5rem", fontWeight: 500, textAlign: "left",
  color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace",
  fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.06em",
};

const tdStyle: React.CSSProperties = {
  padding: "0.55rem 0.5rem", color: "var(--text)", verticalAlign: "top",
};

function pagerBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: "0.5rem 0.9rem",
    background: disabled ? "var(--bg-deep)" : "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "0.4rem",
    color: disabled ? "var(--text-muted)" : "var(--text)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: "0.82rem",
    fontFamily: "var(--font-mono), monospace",
  };
}
