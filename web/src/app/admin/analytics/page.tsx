import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getAnalyticsData, getTrafficData, OPERATOR_TZ, type Bucket, type AnalyticsData, type OrderRow, type TrafficData } from "@/lib/analytics";

// 5-minute cache so the dashboard doesn't hammer the Stripe API on refresh.
export const revalidate = 300;
export const dynamic    = "force-dynamic"; // still auth-gate every request

export const metadata = {
  title: "Analytics — CRS Admin",
  robots: { index: false, follow: false },
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const authed = await isAdminAuthenticated();
  if (!authed) redirect("/admin/login?next=/admin/analytics");

  const params      = await searchParams;
  const windowDays  = Math.min(365, Math.max(1, parseInt(params.window ?? "30", 10) || 30));
  const [data, traffic] = await Promise.all([
    getAnalyticsData(windowDays),
    getTrafficData(windowDays),
  ]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", padding: "2rem 1.5rem" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <TopBar windowDays={windowDays} fetchedAt={data.fetchedAt} />
        <SummaryCards data={data} traffic={traffic} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
          <BreakdownCard title="Orders by service"          buckets={data.byService}      totalOrders={data.totalOrders} />
          <BreakdownCard title="Orders by attribution source" buckets={data.bySrc}          totalOrders={data.totalOrders} />
          <BreakdownCard title="Orders by jurisdiction"      buckets={data.byJurisdiction} totalOrders={data.totalOrders} />
        </div>
        <TrendCard data={data} />
        <TrafficSection traffic={traffic} />
        <SearchIntelligence traffic={traffic} />
        <RecentOrdersTable rows={data.recent} currency={data.currency} />
      </div>
    </div>
  );
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

function TopBar({ windowDays, fetchedAt }: { windowDays: number; fetchedAt: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
      <div>
        <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
          CRS Admin
        </div>
        <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", margin: "0.2rem 0 0" }}>
          Analytics · {windowDays === 1 ? "Last 24 hours" : `Last ${windowDays} days`}
        </h1>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
          Fetched {new Date(fetchedAt).toLocaleString("en-CA", { timeZone: OPERATOR_TZ, timeZoneName: "short" })} · cache 5 min
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.35rem" }}>
        {[
          { n: 1,   label: "24h" },
          { n: 7,   label: "7d"  },
          { n: 30,  label: "30d" },
          { n: 90,  label: "90d" },
          { n: 365, label: "1y"  },
        ].map(({ n, label }) => (
          <a
            key={n}
            href={`/admin/analytics?window=${n}`}
            style={{
              padding:      "0.35rem 0.75rem",
              border:       "1px solid var(--border)",
              borderRadius: "0.4rem",
              fontSize:     "0.78rem",
              fontFamily:   "var(--font-mono), monospace",
              background:   n === windowDays ? "var(--primary)" : "transparent",
              color:        n === windowDays ? "#fff"           : "var(--text-muted)",
              textDecoration: "none",
            }}
          >
            {label}
          </a>
        ))}
        <form action="/api/admin/logout" method="POST" style={{ display: "inline" }}>
          <button type="submit" style={{ padding: "0.35rem 0.75rem", background: "transparent", border: "1px solid var(--border)", borderRadius: "0.4rem", fontSize: "0.78rem", fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)", cursor: "pointer" }}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

function SummaryCards({ data, traffic }: { data: AnalyticsData; traffic: TrafficData }) {
  const topService = data.byService[0];
  const conversionRate = traffic.uniqueSessions ? Math.round((data.totalOrders / traffic.uniqueSessions) * 1000) / 10 : 0;
  const cards = [
    { label: "Orders",                     value: data.totalOrders.toLocaleString() },
    { label: `Revenue (${data.currency})`, value: `$${data.totalRevenue.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { label: "Average order",              value: `$${data.avgOrderValue.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { label: "Pageviews",                  value: traffic.totalPageviews.toLocaleString() },
    { label: "Unique sessions",            value: traffic.uniqueSessions.toLocaleString() },
    { label: "Session → paid",             value: traffic.uniqueSessions ? `${conversionRate}%` : "—" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
      {cards.map((c) => (
        <div key={c.label} style={cardStyle}>
          <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>{c.label}</div>
          <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.55rem", fontWeight: 700, color: "var(--text)", marginTop: "0.4rem" }}>{c.value}</div>
        </div>
      ))}
      {/* Top service card kept full-width on last row so it doesn't crowd the numbers */}
      <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
        <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>Top service in this window</div>
        <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.35rem", fontWeight: 700, color: "var(--text)", marginTop: "0.4rem" }}>
          {topService ? `${topService.label} · ${topService.count} orders · $${topService.amount.toLocaleString("en-CA", { maximumFractionDigits: 0 })}` : "—"}
        </div>
      </div>
    </div>
  );
}

function TrafficSection({ traffic }: { traffic: TrafficData }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
      <div style={cardStyle}>
        <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "0.85rem" }}>
          Top pages
        </div>
        {traffic.topPages.length === 0 && <TrafficEmptyState />}
        {traffic.topPages.slice(0, 10).map((p) => (
          <PathRow key={p.path} path={p.path} primary={`${p.views}`} secondary={`${p.sessions} sessions`} />
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "0.85rem" }}>
          Order pages funnel
        </div>
        {traffic.orderPageFunnel.length === 0 && <TrafficEmptyState />}
        {traffic.orderPageFunnel.slice(0, 10).map((p) => (
          <PathRow key={p.path} path={p.path} primary={`${p.views}`} secondary={`${p.sessions} sessions`} />
        ))}
      </div>

      <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
        <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "0.85rem" }}>
          Article click-through rate — content that drives visitors to checkout
        </div>
        {traffic.articleCtr.length === 0 && <TrafficEmptyState />}
        {traffic.articleCtr.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase" }}>
                  <th style={thStyle}>Page</th>
                  <th style={thStyle}>Views</th>
                  <th style={thStyle}>CTA clicks</th>
                  <th style={thStyle}>CTR</th>
                </tr>
              </thead>
              <tbody>
                {traffic.articleCtr.slice(0, 20).map((r) => (
                  <tr key={r.path} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.path}>{r.path}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace" }}>{r.views}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace" }}>{r.ctaClicks}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontWeight: 700, color: r.ctr >= 5 ? "var(--gold)" : "var(--text)" }}>{r.ctr}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PathRow({ path, primary, secondary }: { path: string; primary: string; secondary: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.45rem", borderBottom: "1px dotted var(--border)", paddingBottom: "0.35rem" }}>
      <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.78rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }} title={path}>{path}</span>
      <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.78rem", color: "var(--text-muted)", flexShrink: 0 }}>
        <strong style={{ color: "var(--text)" }}>{primary}</strong> · {secondary}
      </span>
    </div>
  );
}

function TrafficEmptyState() {
  return (
    <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
      No pageview data yet in this window. If you just deployed Phase B, browse the site in a new tab and give the beacons a minute to write. Or check that MONGODB_URI is set on this environment.
    </div>
  );
}

function BreakdownCard({ title, buckets, totalOrders }: { title: string; buckets: Bucket[]; totalOrders: number }) {
  const top = buckets.slice(0, 8);
  return (
    <div style={{ ...cardStyle, minHeight: 220 }}>
      <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "0.85rem" }}>{title}</div>
      {top.length === 0 && <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No orders yet in this window.</div>}
      {top.map((b) => {
        const pct = totalOrders ? Math.round((b.count / totalOrders) * 100) : 0;
        return (
          <div key={b.key} style={{ marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", color: "var(--text)", marginBottom: "0.15rem" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: "0.5rem" }}>{b.label}</span>
              <span style={{ fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)" }}>{b.count} · ${b.amount.toLocaleString("en-CA", { maximumFractionDigits: 0 })}</span>
            </div>
            <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "var(--gold)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TrendCard({ data }: { data: AnalyticsData }) {
  const series = data.dailyRevenue;
  const maxAmount = Math.max(1, ...series.map((d) => d.amount));
  const hourly   = data.windowDays <= 1;
  const width  = 1100;
  const height = 160;
  const paddingX = 24;
  const paddingY = 20;
  const chartWidth  = width  - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const points = series.map((d, i) => {
    const x = paddingX + (series.length > 1 ? (i / (series.length - 1)) * chartWidth : chartWidth / 2);
    const y = paddingY + chartHeight - (d.amount / maxAmount) * chartHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div style={{ ...cardStyle, marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>{hourly ? "Hourly revenue · Mountain Time" : "Daily revenue · Mountain Time"}</div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>Peak: ${maxAmount.toLocaleString("en-CA", { maximumFractionDigits: 0 })}</div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" preserveAspectRatio="none" style={{ display: "block", height: 160 }}>
        <polyline
          fill="none"
          stroke="var(--gold)"
          strokeWidth="2"
          points={points}
        />
        {/* Baseline for context */}
        <line x1={paddingX} x2={width - paddingX} y1={height - paddingY} y2={height - paddingY} stroke="var(--border)" strokeWidth="1" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", marginTop: "0.4rem" }}>
        <span>{series[0]?.date}</span>
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function RecentOrdersTable({ rows, currency }: { rows: OrderRow[]; currency: string }) {
  return (
    <div style={cardStyle}>
      <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "0.85rem" }}>
        Most recent {rows.length} orders
      </div>
      {rows.length === 0 && <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>No orders yet in this window.</div>}
      {rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase" }}>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Service</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Company</th>
                <th style={thStyle}>Jurisdiction</th>
                <th style={thStyle}>Source</th>
                <th style={thStyle}>Customer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sessionId} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={tdStyle}>{new Date(r.createdAt).toLocaleString("en-CA", { timeZone: OPERATOR_TZ, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td style={tdStyle}>{r.serviceLabel}</td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace" }}>${r.amount.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}</td>
                  <td style={{ ...tdStyle, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.companyName}>{r.companyName}</td>
                  <td style={tdStyle}>{r.jurisdiction}</td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)" }} title={r.src}>{r.src}</td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)" }}>{r.customerEmail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Search intelligence — surfaces what visitors are actually typing into the
 * Canada Corporations Search box on /canada-corporations-search. Three
 * views: overall volume, top queries, and the highest-value bucket for
 * product signal: zero-result queries (unmet demand).
 */
function SearchIntelligence({ traffic }: { traffic: TrafficData }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
      {/* Overall search volume + zero-result rate */}
      <div style={{ ...cardStyle, gridColumn: "1 / -1" }}>
        <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "0.85rem" }}>
          Canada Corporations Search intent
        </div>
        {traffic.totalSearches === 0 ? (
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
            No searches recorded yet in this window. Fire a few from{" "}
            <code style={{ fontFamily: "var(--font-mono), monospace" }}>/canada-corporations-search</code> to populate this section.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Total searches</div>
              <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.4rem", fontWeight: 700, color: "var(--text)" }}>
                {traffic.totalSearches.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Zero-result rate</div>
              <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.4rem", fontWeight: 700, color: traffic.zeroResultRate >= 25 ? "#B45309" : "var(--text)" }}>
                {traffic.zeroResultRate}%
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>By jurisdiction</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                {traffic.searchesByProvince.slice(0, 12).map((p) => (
                  <span key={p.province} title={`${p.count} searches · ${p.zeroResults} zero-result`} style={{
                    padding: "0.15rem 0.55rem",
                    background: "var(--bg-deep)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    fontSize: "0.72rem",
                    fontFamily: "var(--font-mono), monospace",
                    color: "var(--text)",
                  }}>
                    {p.province} · <strong>{p.count}</strong>
                    {p.zeroResults > 0 && <span style={{ color: "#B45309" }}> · {p.zeroResults}0R</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Top searches */}
      <div style={cardStyle}>
        <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "0.85rem" }}>
          Top queries
        </div>
        {traffic.topSearches.length === 0 && <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>No search data.</div>}
        {traffic.topSearches.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase" }}>
                  <th style={thStyle}>Query</th>
                  <th style={thStyle}>Count</th>
                  <th style={thStyle}>Avg results</th>
                </tr>
              </thead>
              <tbody>
                {traffic.topSearches.slice(0, 15).map((r) => (
                  <tr key={r.query} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.query}>{r.query}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontWeight: 700 }}>{r.count}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: r.avgResults === 0 ? "#B45309" : "var(--text-muted)" }}>
                      {r.avgResults}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Zero-result queries — HIGH SIGNAL */}
      <div style={{ ...cardStyle, borderColor: traffic.zeroResultSearches.length > 0 ? "rgba(180, 83, 9, 0.5)" : "var(--border)" }}>
        <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: traffic.zeroResultSearches.length > 0 ? "#B45309" : "var(--text-muted)", marginBottom: "0.35rem" }}>
          Zero-result queries · unmet demand
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
          Searches that returned nothing. Often the highest-signal bucket — jurisdictions we don&apos;t cover, typos, or companies the government registry doesn&apos;t expose.
        </div>
        {traffic.zeroResultSearches.length === 0 && <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>None yet — every recorded search returned at least one hit.</div>}
        {traffic.zeroResultSearches.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase" }}>
                  <th style={thStyle}>Query</th>
                  <th style={thStyle}>Count</th>
                  <th style={thStyle}>Provinces</th>
                </tr>
              </thead>
              <tbody>
                {traffic.zeroResultSearches.slice(0, 15).map((r) => (
                  <tr key={r.query} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.query}>{r.query}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontWeight: 700 }}>{r.count}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)" }}>{r.provinces.join(", ") || "all"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Styles ─────────────────────────── */

const cardStyle: React.CSSProperties = {
  background:    "var(--card)",
  border:        "1px solid var(--border)",
  borderRadius:  "0.75rem",
  padding:       "1.25rem 1.5rem",
  boxShadow:     "var(--shadow)",
};

const thStyle: React.CSSProperties = { padding: "0.5rem 0.4rem", fontWeight: 500 };
const tdStyle: React.CSSProperties = { padding: "0.6rem 0.4rem", color: "var(--text)" };
