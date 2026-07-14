import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { latestSnapshot, previousSnapshot, type GscSnapshot, type PageRow, type QueryRow, type PageQueryRow } from "@/lib/gsc-mongo";
import RefreshButton from "./RefreshButton";

/**
 * /admin/search-performance
 *
 * GSC-backed weekly analysis dashboard. Surfaces three high-value cuts:
 *   1. Underperforming pages   — high impressions, low CTR → title/meta rewrite candidates
 *   2. Position-3-or-better + low-CTR queries — top-of-page ranking wasted on bad snippets
 *   3. Rising queries          — WoW impression growth > 50% → emerging search interest
 *
 * All data comes from GSC snapshots persisted in crs_analytics.gsc_snapshots
 * (see /api/admin/search-performance/refresh for the ingest).
 */

export const metadata = {
  title:  "Search performance — CRS Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const CTR_THRESHOLD_UNDER = 0.02;       // 2% — anything below on a page with real impressions is a fixable meta problem
const CTR_THRESHOLD_HIGH_POS = 0.05;    // 5% for queries ranked in top 5
const MIN_IMPRESSIONS_UNDER  = 100;

export default async function SearchPerformancePage() {
  if (!(await isAdminAuthenticated())) redirect("/admin/login?next=/admin/search-performance");

  const snap = await latestSnapshot();
  const prev = snap ? await previousSnapshot(snap._id) : null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", padding: "1.5rem" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <TopBar snap={snap} />

        {!snap ? (
          <EmptyState />
        ) : (
          <>
            <SummaryCards snap={snap} prev={prev} />
            <UnderperformingPages snap={snap} />
            <TopQueriesTable snap={snap} />
            <HighPositionLowCtr snap={snap} />
            <RisingQueries snap={snap} prev={prev} />
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────── Sub-components ─────────────────────────────── */

function TopBar({ snap }: { snap: GscSnapshot | null }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "1.25rem", gap: "0.75rem", flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
          CRS Admin
        </div>
        <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", margin: "0.2rem 0 0" }}>
          Search performance
        </h1>
        <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.5rem" }}>
          <a href="/admin/analytics" style={{ padding: "0.3rem 0.7rem", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text-muted)", borderRadius: "0.35rem", fontSize: "0.75rem", fontFamily: "var(--font-mono), monospace", textDecoration: "none" }}>Analytics</a>
          <a href="/admin/outreach"  style={{ padding: "0.3rem 0.7rem", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text-muted)", borderRadius: "0.35rem", fontSize: "0.75rem", fontFamily: "var(--font-mono), monospace", textDecoration: "none" }}>Outreach</a>
          <span style={{ padding: "0.3rem 0.7rem", border: "1px solid var(--primary)", background: "var(--primary)", color: "#fff", borderRadius: "0.35rem", fontSize: "0.75rem", fontFamily: "var(--font-mono), monospace" }}>Search performance</span>
        </div>
        {snap && (
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>
            Snapshot for <strong>{snap.rangeStart} → {snap.rangeEnd}</strong> ({snap.windowDays}d window) · pulled {new Date(snap.pulledAt).toLocaleString("en-CA")}
          </div>
        )}
      </div>
      <RefreshButton />
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ ...cardStyle, textAlign: "center", padding: "3rem 1.5rem" }}>
      <div className="card-heading" style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>
        No Search Console data yet
      </div>
      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem", maxWidth: "50ch", margin: "0 auto 1.5rem" }}>
        Click <strong>Refresh</strong> above to pull the last 7 days from Google Search Console. First pull takes ~30 seconds. Requires <code style={{ fontFamily: "var(--font-mono), monospace", background: "var(--bg-deep)", padding: "0.1rem 0.35rem", borderRadius: "0.25rem" }}>GSC_SERVICE_ACCOUNT_JSON</code> and <code style={{ fontFamily: "var(--font-mono), monospace", background: "var(--bg-deep)", padding: "0.1rem 0.35rem", borderRadius: "0.25rem" }}>GSC_SITE_URL</code> env vars to be set.
      </p>
    </div>
  );
}

function SummaryCards({ snap, prev }: { snap: GscSnapshot; prev: GscSnapshot | null }) {
  const tot = totals(snap.pages);
  const prevTot = prev ? totals(prev.pages) : null;
  const delta = (cur: number, p: number | null | undefined) => p == null || p === 0 ? null : Math.round(((cur - p) / p) * 1000) / 10;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
      <SummaryCard label="Total impressions" value={tot.impressions.toLocaleString()} delta={delta(tot.impressions, prevTot?.impressions)} />
      <SummaryCard label="Total clicks" value={tot.clicks.toLocaleString()} delta={delta(tot.clicks, prevTot?.clicks)} />
      <SummaryCard label="Avg CTR" value={`${(tot.ctr * 100).toFixed(1)}%`} delta={delta(tot.ctr, prevTot?.ctr)} />
      <SummaryCard label="Avg position" value={tot.position.toFixed(1)} delta={prevTot ? Math.round((prevTot.position - tot.position) * 10) / 10 : null} deltaAsAbsolute />
    </div>
  );
}

function SummaryCard({ label, value, delta, deltaAsAbsolute = false }: { label: string; value: string; delta: number | null; deltaAsAbsolute?: boolean }) {
  const positive = delta !== null && delta > 0;
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.35rem" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.6rem", fontWeight: 700, color: "var(--text)" }}>{value}</div>
      {delta !== null && (
        <div style={{ fontSize: "0.7rem", color: positive ? "var(--secondary)" : "#B45309", marginTop: "0.25rem", fontFamily: "var(--font-mono), monospace" }}>
          {positive ? "▲" : "▼"} {deltaAsAbsolute ? Math.abs(delta).toFixed(1) : `${Math.abs(delta).toFixed(1)}%`} vs. previous snapshot
        </div>
      )}
    </div>
  );
}

function UnderperformingPages({ snap }: { snap: GscSnapshot }) {
  /* Pages with meaningful impressions but weak CTR — the highest-leverage
     rewrites. Opportunity score = impressions * (target CTR - actual CTR). */
  const candidates = snap.pages
    .filter((p) => p.impressions >= MIN_IMPRESSIONS_UNDER && p.ctr < CTR_THRESHOLD_UNDER)
    .map((p) => ({
      ...p,
      opportunity: Math.round(p.impressions * (CTR_THRESHOLD_UNDER - p.ctr)),
    }))
    .sort((a, b) => b.opportunity - a.opportunity)
    .slice(0, 20);

  return (
    <div style={{ ...cardStyle, marginBottom: "1rem" }}>
      <SectionHeader
        title="Underperforming pages · title/meta rewrite candidates"
        subtitle={`Pages with ≥${MIN_IMPRESSIONS_UNDER} impressions but CTR below ${(CTR_THRESHOLD_UNDER * 100).toFixed(0)}%. Opportunity score = extra clicks/week if you moved CTR to ${(CTR_THRESHOLD_UNDER * 100).toFixed(0)}%.`}
        accent="#B45309"
      />
      {candidates.length === 0 ? (
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "0.5rem 0" }}>
          Nothing below threshold — all pages with meaningful impressions are converting.
        </div>
      ) : (
        <TableBase>
          <thead>
            <tr style={{ background: "var(--bg-deep)" }}>
              {["Page", "Impr", "Clicks", "CTR", "Avg pos", "Opportunity"].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.map((p) => (
              <tr key={p.path} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", maxWidth: 460, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.path}>
                  <a href={p.path} target="_blank" rel="noreferrer" style={{ color: "var(--text)", textDecoration: "none" }}>
                    {shortenUrl(p.path)}
                  </a>
                </td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontWeight: 700 }}>{p.impressions.toLocaleString()}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace" }}>{p.clicks}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: "#B45309", fontWeight: 700 }}>{(p.ctr * 100).toFixed(2)}%</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)" }}>{p.position.toFixed(1)}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: "var(--gold)", fontWeight: 700 }}>+{p.opportunity} clicks</td>
              </tr>
            ))}
          </tbody>
        </TableBase>
      )}
      {candidates.length > 0 && (
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.75rem", fontStyle: "italic" }}>
          Tip: click a row to open the page. Then check the drill-down below for the queries actually driving impressions — write your new title around those.
        </div>
      )}
    </div>
  );
}

function TopQueriesTable({ snap }: { snap: GscSnapshot }) {
  const top = [...snap.queries].sort((a, b) => b.impressions - a.impressions).slice(0, 25);
  return (
    <div style={{ ...cardStyle, marginBottom: "1rem" }}>
      <SectionHeader
        title="Top 25 queries by impressions"
        subtitle="What Google is showing your site for. High impressions + low CTR = your snippet isn't compelling enough."
      />
      <TableBase>
        <thead>
          <tr style={{ background: "var(--bg-deep)" }}>
            {["Query", "Impr", "Clicks", "CTR", "Avg pos"].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {top.map((q) => (
            <tr key={q.query} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis" }}>{q.query}</td>
              <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontWeight: 700 }}>{q.impressions.toLocaleString()}</td>
              <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace" }}>{q.clicks}</td>
              <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: q.ctr < 0.02 ? "#B45309" : "var(--text)" }}>{(q.ctr * 100).toFixed(2)}%</td>
              <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: q.position <= 3 ? "var(--secondary)" : "var(--text-muted)" }}>{q.position.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </TableBase>
    </div>
  );
}

function HighPositionLowCtr({ snap }: { snap: GscSnapshot }) {
  /* Queries where you rank position 1-5 but CTR is under 5% — Google is
     giving you the traffic; the snippet is losing the click. Meta rewrite. */
  const candidates = snap.queries
    .filter((q) => q.impressions >= 20 && q.position <= 5 && q.ctr < CTR_THRESHOLD_HIGH_POS)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);

  return (
    <div style={{ ...cardStyle, marginBottom: "1rem" }}>
      <SectionHeader
        title="Top-5-ranked but low-CTR queries · snippet losing the click"
        subtitle="You rank position 1–5 for these but visitors aren't clicking. Almost always a meta description rewrite fixes it."
        accent="var(--gold)"
      />
      {candidates.length === 0 ? (
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "0.5rem 0" }}>
          Every top-5 ranked query has a healthy CTR — no snippet rewrites needed.
        </div>
      ) : (
        <TableBase>
          <thead>
            <tr style={{ background: "var(--bg-deep)" }}>
              {["Query", "Pos", "Impr", "Clicks", "CTR"].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.map((q) => (
              <tr key={q.query} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis" }}>{q.query}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: "var(--secondary)", fontWeight: 700 }}>{q.position.toFixed(1)}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace" }}>{q.impressions.toLocaleString()}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace" }}>{q.clicks}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: "#B45309", fontWeight: 700 }}>{(q.ctr * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </TableBase>
      )}
    </div>
  );
}

function RisingQueries({ snap, prev }: { snap: GscSnapshot; prev: GscSnapshot | null }) {
  if (!prev) {
    return (
      <div style={{ ...cardStyle, marginBottom: "1rem" }}>
        <SectionHeader title="Rising queries · week-over-week" subtitle="Requires 2 snapshots. Refresh next week to see growth trends." />
      </div>
    );
  }

  const prevIdx = new Map(prev.queries.map((q) => [q.query, q]));
  const risers = snap.queries
    .map((q) => {
      const before = prevIdx.get(q.query);
      const beforeImp = before?.impressions ?? 0;
      const growth = beforeImp > 0 ? ((q.impressions - beforeImp) / beforeImp) : (q.impressions > 0 ? Infinity : 0);
      return { ...q, growth, beforeImp };
    })
    .filter((q) => q.impressions >= 10 && (q.growth === Infinity || q.growth >= 0.5))
    .sort((a, b) => (b.growth === Infinity ? 1e9 : b.growth) - (a.growth === Infinity ? 1e9 : a.growth))
    .slice(0, 15);

  return (
    <div style={{ ...cardStyle, marginBottom: "1rem" }}>
      <SectionHeader
        title="Rising queries · week-over-week"
        subtitle="Queries where impressions grew >50% since the previous snapshot. New content opportunities you might not have targeted."
      />
      {risers.length === 0 ? (
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "0.5rem 0" }}>
          Nothing significantly up week-over-week.
        </div>
      ) : (
        <TableBase>
          <thead>
            <tr style={{ background: "var(--bg-deep)" }}>
              {["Query", "Impr now", "Impr prev", "Growth", "Clicks", "Avg pos"].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {risers.map((q) => (
              <tr key={q.query} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>{q.query}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontWeight: 700 }}>{q.impressions.toLocaleString()}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)" }}>{q.beforeImp.toLocaleString() || "—"}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: "var(--secondary)", fontWeight: 700 }}>
                  {q.growth === Infinity ? "NEW" : `+${Math.round(q.growth * 100)}%`}
                </td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace" }}>{q.clicks}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)" }}>{q.position.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </TableBase>
      )}
    </div>
  );
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

function totals(pages: PageRow[]): { impressions: number; clicks: number; ctr: number; position: number } {
  let imp = 0, clk = 0, posSum = 0;
  for (const p of pages) { imp += p.impressions; clk += p.clicks; posSum += p.position * p.impressions; }
  return {
    impressions: imp,
    clicks:      clk,
    ctr:         imp > 0 ? clk / imp : 0,
    position:    imp > 0 ? posSum / imp : 0,
  };
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch { return url; }
}

function SectionHeader({ title, subtitle, accent }: { title: string; subtitle?: string; accent?: string }) {
  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: accent ?? "var(--text-muted)", marginBottom: "0.25rem" }}>
        {title}
      </div>
      {subtitle && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{subtitle}</div>}
    </div>
  );
}

function TableBase({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
        {children}
      </table>
    </div>
  );
}

/* Suppress unused warning for imported type — used by imports elsewhere */
type _PQ = PageQueryRow;
void ({} as _PQ);

const cardStyle: React.CSSProperties = {
  background:    "var(--card)",
  border:        "1px solid var(--border)",
  borderRadius:  "var(--radius-card)",
  padding:       "1.25rem 1.5rem",
  boxShadow:     "var(--shadow-card)",
};
const thStyle: React.CSSProperties = { padding: "0.5rem 0.5rem", fontWeight: 500, textAlign: "left", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em" };
const tdStyle: React.CSSProperties = { padding: "0.55rem 0.5rem", color: "var(--text)", verticalAlign: "top" };
