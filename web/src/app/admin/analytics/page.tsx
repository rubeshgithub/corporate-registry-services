import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getAnalyticsData, getTrafficData, getSecondaryTrends, parseWindowToken, OPERATOR_TZ, type Bucket, type AnalyticsData, type OrderRow, type TrafficData, type WindowToken, type SecondaryTrends } from "@/lib/analytics";
import { getInboundInsights, fmtLocal, INBOUND_WINDOW_DAYS, type InboundInsights } from "@/lib/inbound-insights";

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
  const token       = parseWindowToken(params.window);
  const [data, traffic, secondary, inbound] = await Promise.all([
    getAnalyticsData(token),
    getTrafficData(token),
    getSecondaryTrends(),
    getInboundInsights(),
  ]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", padding: "2rem 1.5rem" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <TopBar token={token} label={data.windowLabel} fetchedAt={data.fetchedAt} />
        <SummaryCards data={data} traffic={traffic} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
          <BreakdownCard title="Orders by service"          buckets={data.byService}      totalOrders={data.totalOrders} />
          <BreakdownCard title="Orders by attribution source" buckets={data.bySrc}          totalOrders={data.totalOrders} />
          <BreakdownCard title="Orders by jurisdiction"      buckets={data.byJurisdiction} totalOrders={data.totalOrders} />
        </div>
        <TrendCard data={data} />
        <WeeklyRollupCard secondary={secondary} currency={data.currency} />
        <RevenueByArticleCard secondary={secondary} currency={data.currency} />
        <TrafficSection traffic={traffic} />
        <SearchIntelligence traffic={traffic} />
        <ContentPageSearchIntent traffic={traffic} />
        <GovExitLeaks traffic={traffic} />
        <PilotRequestsCard traffic={traffic} />
        <CartAbandonmentCard inbound={inbound} />
        <SearchLeadsCard inbound={inbound} />
        <ConsultationRequestsCard inbound={inbound} />
        <InboundMessagesCard inbound={inbound} />
        <RecentOrdersTable rows={data.recent} currency={data.currency} />
      </div>
    </div>
  );
}

/* ─────────────────────────── Weekly rollup ─────────────────────────── */

/**
 * 12-week bars. Independent of the window-token tab up top — this view
 * always shows the same 12 calendar weeks so week-over-week comparisons
 * stay stable when the operator switches tabs. Revenue as filled gold
 * bars, order count printed above each bar for context.
 */
function WeeklyRollupCard({ secondary, currency }: { secondary: SecondaryTrends; currency: string }) {
  const weeks   = secondary.weekly;
  const maxAmt  = Math.max(1, ...weeks.map((w) => w.amount));
  const totalR  = weeks.reduce((s, w) => s + w.amount, 0);
  const totalO  = weeks.reduce((s, w) => s + w.count,  0);
  const currentWk = weeks[weeks.length - 1];
  const priorWk   = weeks[weeks.length - 2];
  const wow       = priorWk && priorWk.amount > 0
    ? Math.round(((currentWk.amount - priorWk.amount) / priorWk.amount) * 100)
    : null;

  return (
    <div style={{ ...cardStyle, marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
            Weekly revenue rollup · last 12 weeks
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            Independent of the window tabs above — always the last 12 calendar weeks (Mon–Sun, Mountain Time). Best view for &ldquo;am I growing?&rdquo;
          </div>
        </div>
        <div style={{ textAlign: "right", fontFamily: "var(--font-mono), monospace", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          <div>90d: ${totalR.toLocaleString("en-CA", { maximumFractionDigits: 0 })} · {totalO} orders</div>
          {wow !== null && (
            <div style={{ marginTop: "0.15rem", color: wow >= 0 ? "#16A34A" : "#B91C1C", fontWeight: 700 }}>
              This wk vs last: {wow >= 0 ? "▲" : "▼"} {Math.abs(wow)}%
            </div>
          )}
        </div>
      </div>

      {weeks.every((w) => w.amount === 0 && w.count === 0) ? (
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "1.5rem 0" }}>
          No paid orders in the last 12 weeks. Bars will start showing up once Stripe sessions land.
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: "0.4rem", height: 140, marginTop: "1rem", padding: "0 0.15rem" }}>
          {weeks.map((w) => {
            const barPct = (w.amount / maxAmt) * 100;
            const isThis = w === weeks[weeks.length - 1];
            return (
              <div key={w.weekStart} style={{ flex: "1 1 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem", minWidth: 0 }}>
                <div style={{ fontSize: "0.62rem", fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)", height: 12 }}>
                  {w.count > 0 ? w.count : ""}
                </div>
                <div style={{ width: "100%", height: 90, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                  <div
                    style={{
                      width:  "100%",
                      height: `${Math.max(barPct, w.amount > 0 ? 4 : 0)}%`,
                      background: isThis ? "var(--gold)" : "var(--gold-dim)",
                      border: isThis ? "1px solid var(--gold)" : "1px solid rgba(212,175,55,0.35)",
                      borderRadius: "0.25rem 0.25rem 0 0",
                      transition: "background 0.2s",
                    }}
                    title={`${w.label}: $${w.amount.toLocaleString("en-CA", { maximumFractionDigits: 0 })} · ${w.count} orders`}
                  />
                </div>
                <div style={{ fontSize: "0.62rem", fontFamily: "var(--font-mono), monospace", color: isThis ? "var(--text)" : "var(--text-muted)", fontWeight: isThis ? 700 : 400, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", width: "100%" }} title={w.label}>
                  {w.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.85rem", fontFamily: "var(--font-mono), monospace" }}>
        Bar height = revenue ({currency}) · number above = order count · current week highlighted
      </div>
    </div>
  );
}

/* ─────────────────── Revenue by landing article ─────────────────── */

/**
 * Every Stripe checkout carries a `src` metadata tag; article-attributed
 * orders arrive as `article-<slug>` (top-of-page CTAs) or
 * `inline-article-<slug>` (inline widget). This panel rolls those up so
 * the operator can rank content by revenue, not just pageviews — answers
 * "which articles pay the bills?"
 */
function RevenueByArticleCard({ secondary, currency }: { secondary: SecondaryTrends; currency: string }) {
  const rows      = secondary.revenueByArticle;
  const totalR    = rows.reduce((s, r) => s + r.amount, 0);
  const totalO    = rows.reduce((s, r) => s + r.count,  0);

  return (
    <div style={{ ...cardStyle, marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
            Revenue by landing article · last 90 days
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            Paid orders attributed to a specific article via the <code style={{ fontFamily: "var(--font-mono), monospace" }}>src=article-*</code> / <code style={{ fontFamily: "var(--font-mono), monospace" }}>inline-article-*</code> tag — ranks content by dollars, not pageviews.
          </div>
        </div>
        <div style={{ textAlign: "right", fontFamily: "var(--font-mono), monospace", fontSize: "0.75rem", color: "var(--text-muted)" }}>
          ${totalR.toLocaleString("en-CA", { maximumFractionDigits: 0 })} · {totalO} orders · {rows.length} articles
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "0.5rem 0" }}>
          No article-attributed orders in the last 90 days yet. Every Stripe checkout that carries <code style={{ fontFamily: "var(--font-mono), monospace" }}>src=article-*</code> or <code style={{ fontFamily: "var(--font-mono), monospace" }}>inline-article-*</code> in its metadata will show up here.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase" }}>
                <th style={thStyle}>Article</th>
                <th style={thStyle}>Orders</th>
                <th style={thStyle}>Revenue ({currency})</th>
                <th style={thStyle} title="Share of total article-attributed revenue">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 20).map((r) => {
                const pct = totalR > 0 ? Math.round((r.amount / totalR) * 1000) / 10 : 0;
                return (
                  <tr key={r.slug} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ ...tdStyle, maxWidth: 460 }}>
                      <a
                        href={`/articles/${r.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "var(--text)", textDecoration: "none", fontFamily: "var(--font-mono), monospace", fontSize: "0.78rem", borderBottom: "1px dotted var(--border)" }}
                        title={`/articles/${r.slug}`}
                      >
                        {r.slug}
                      </a>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontWeight: 700 }}>{r.count}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontWeight: 700, color: "var(--gold)" }}>
                      ${r.amount.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)" }}>{pct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

function TopBar({ token, label, fetchedAt }: { token: WindowToken; label: string; fetchedAt: string }) {
  const tabs: Array<{ t: WindowToken; label: string }> = [
    { t: "1h",    label: "Past 1h"    },
    { t: "today", label: "Today (MST)" },
    { t: "7d",    label: "7d"          },
    { t: "30d",   label: "30d"         },
    { t: "90d",   label: "90d"         },
    { t: "1y",    label: "1y"          },
  ];
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
      <div>
        <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
          CRS Admin
        </div>
        <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.75rem", fontWeight: 700, color: "var(--text)", margin: "0.2rem 0 0" }}>
          Analytics · {label}
        </h1>
        <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.5rem" }}>
          <span style={{ padding: "0.3rem 0.7rem", border: "1px solid var(--primary)", background: "var(--primary)", color: "#fff", borderRadius: "0.35rem", fontSize: "0.75rem", fontFamily: "var(--font-mono), monospace" }}>Analytics</span>
          <a href="/admin/outreach" style={{ padding: "0.3rem 0.7rem", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text-muted)", borderRadius: "0.35rem", fontSize: "0.75rem", fontFamily: "var(--font-mono), monospace", textDecoration: "none" }}>Outreach</a>
          <a href="/admin/search-performance" style={{ padding: "0.3rem 0.7rem", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text-muted)", borderRadius: "0.35rem", fontSize: "0.75rem", fontFamily: "var(--font-mono), monospace", textDecoration: "none" }}>Search performance</a>
          <a href="/admin/companies" style={{ padding: "0.3rem 0.7rem", border: "1px solid var(--border)", background: "var(--card)", color: "var(--text-muted)", borderRadius: "0.35rem", fontSize: "0.75rem", fontFamily: "var(--font-mono), monospace", textDecoration: "none" }}>Corporations</a>
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
          Fetched {new Date(fetchedAt).toLocaleString("en-CA", { timeZone: OPERATOR_TZ, timeZoneName: "short" })} · cache 5 min
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        {tabs.map(({ t, label: tabLabel }) => (
          <a
            key={t}
            href={`/admin/analytics?window=${t}`}
            style={{
              padding:      "0.35rem 0.75rem",
              border:       "1px solid var(--border)",
              borderRadius: "0.4rem",
              fontSize:     "0.78rem",
              fontFamily:   "var(--font-mono), monospace",
              background:   t === token ? "var(--primary)" : "transparent",
              color:        t === token ? "#fff"           : "var(--text-muted)",
              textDecoration: "none",
              whiteSpace:   "nowrap",
            }}
          >
            {tabLabel}
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
                  <th style={thStyle} title="Searches performed on the embedded lookup widget">Searches</th>
                  <th style={thStyle}>CTA clicks</th>
                  <th style={thStyle}>CTR</th>
                </tr>
              </thead>
              <tbody>
                {traffic.articleCtr.slice(0, 20).map((r) => (
                  <tr key={r.path} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.path}>{r.path}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace" }}>{r.views}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontWeight: r.searches > 0 ? 700 : 400, color: r.searches > 0 ? "var(--secondary)" : "var(--text-muted)" }}>{r.searches}</td>
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
  const series = data.trend;
  const maxAmount = Math.max(1, ...series.map((d) => d.amount));
  const trendTitle =
    data.bucketMode === "5min" ? "5-minute revenue · Mountain Time" :
    data.bucketMode === "hour" ? "Hourly revenue · Mountain Time"   :
                                 "Daily revenue · Mountain Time";
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
        <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>{trendTitle}</div>
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
        <span>{series[0]?.label}</span>
        <span>{series[series.length - 1]?.label}</span>
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
        <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
          Canada Corporations Search intent · <span style={{ color: "var(--text)" }}>/canada-corporations-search</span>
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.85rem" }}>
          Searches performed on the standalone registry search page — the &ldquo;cold&rdquo; landing page indexed by Google.
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
          Zero-result queries · unmet demand · /canada-corporations-search
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

/**
 * Content-page widget searches — visitors landing on Annual Return / Profile
 * Report / Good Standing / other content pages and using the embedded lookup
 * widget. Higher intent than the standalone Registry Search page because the
 * visitor already picked a service context by landing on that article.
 */
function ContentPageSearchIntent({ traffic }: { traffic: TrafficData }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1rem", marginBottom: "1rem" }}>
      <div style={cardStyle}>
        <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
          Content-page search intent · <span style={{ color: "var(--text)" }}>article + service pages</span>
        </div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.85rem" }}>
          Searches performed on the lookup widget embedded in article and service pages (Annual Return, Profile Report, Good Standing, guides). These visitors already picked a service context — highest-intent search bucket.
        </div>

        {traffic.articleSearchesTotal === 0 ? (
          <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
            No content-page searches recorded yet in this window.
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Total searches</div>
                <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.4rem", fontWeight: 700, color: "var(--text)" }}>
                  {traffic.articleSearchesTotal.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Zero-result rate</div>
                <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.4rem", fontWeight: 700, color: traffic.articleZeroResultRate >= 25 ? "#B45309" : "var(--text)" }}>
                  {traffic.articleZeroResultRate}%
                </div>
              </div>
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Pages with searches</div>
                <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.4rem", fontWeight: 700, color: "var(--text)" }}>
                  {traffic.articleSearchesByPage.length}
                </div>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase" }}>
                    <th style={thStyle}>Page</th>
                    <th style={thStyle}>Searches</th>
                    <th style={thStyle}>0-result</th>
                    <th style={thStyle}>Top queries on this page</th>
                  </tr>
                </thead>
                <tbody>
                  {traffic.articleSearchesByPage.slice(0, 25).map((r) => (
                    <tr key={r.path} style={{ borderTop: "1px solid var(--border)", verticalAlign: "top" }}>
                      <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.path}>
                        {r.path}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontWeight: 700, color: "var(--secondary)" }}>{r.count}</td>
                      <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: r.zeroResults > 0 ? "#B45309" : "var(--text-muted)" }}>{r.zeroResults}</td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                          {r.topQueries.map((q) => (
                            <span key={q.query} title={`${q.count} search${q.count === 1 ? "" : "es"} · avg ${q.avgResults} result${q.avgResults === 1 ? "" : "s"}`} style={{
                              padding: "0.15rem 0.55rem",
                              background: q.avgResults === 0 ? "rgba(180,83,9,0.08)" : "var(--bg-deep)",
                              border: `1px solid ${q.avgResults === 0 ? "rgba(180,83,9,0.35)" : "var(--border)"}`,
                              borderRadius: "9999px",
                              fontSize: "0.7rem",
                              fontFamily: "var(--font-mono), monospace",
                              color: q.avgResults === 0 ? "#B45309" : "var(--text)",
                              whiteSpace: "nowrap",
                            }}>
                              {q.query}
                              {q.count > 1 && <span style={{ color: "var(--text-muted)" }}> ×{q.count}</span>}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Government-registry exits — visitors clicking outbound gov links to file
 * directly with the registry instead of ordering from CRS. This is the "DIY
 * leak" signal. High exits + low CTA clicks on the same article means the
 * content is being read as a free guide rather than a lead-in to purchase.
 */
function GovExitLeaks({ traffic }: { traffic: TrafficData }) {
  return (
    <div style={{ ...cardStyle, marginBottom: "1rem", borderColor: traffic.totalGovExits > 0 ? "rgba(180, 83, 9, 0.35)" : "var(--border)" }}>
      <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: traffic.totalGovExits > 0 ? "#B45309" : "var(--text-muted)", marginBottom: "0.35rem" }}>
        Government registry exits · DIY leak
      </div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.85rem" }}>
        Visitors clicking an outbound link to a Canadian government registry (Alberta / Ontario / ISED / etc.) — a signal they intend to file directly rather than order. Compare against the same article&apos;s CTA clicks: high exits + low CTAs = the content is being read as a free guide.
      </div>

      {traffic.totalGovExits === 0 ? (
        <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
          No government-registry exits recorded in this window. Either visitors aren&apos;t leaking to DIY, or the anchor click tracking hasn&apos;t captured any gov-domain hrefs yet.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Total gov exits</div>
              <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.4rem", fontWeight: 700, color: "#B45309" }}>
                {traffic.totalGovExits.toLocaleString()}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Pages leaking</div>
              <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.4rem", fontWeight: 700, color: "var(--text)" }}>
                {traffic.govExitsByPage.length}
              </div>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase" }}>
                  <th style={thStyle}>Page</th>
                  <th style={thStyle}>Exits</th>
                  <th style={thStyle}>Sessions</th>
                  <th style={thStyle}>Views</th>
                  <th style={thStyle} title="Gov exits divided by page views — the raw DIY leak rate">Leak %</th>
                  <th style={thStyle}>Target hosts</th>
                </tr>
              </thead>
              <tbody>
                {traffic.govExitsByPage.slice(0, 20).map((r) => {
                  const views = traffic.articleCtr.find((a) => a.path === r.path)?.views ?? 0;
                  const leakPct = views > 0 ? Math.round((r.count / views) * 1000) / 10 : null;
                  return (
                    <tr key={r.path} style={{ borderTop: "1px solid var(--border)", verticalAlign: "top" }}>
                      <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.path}>
                        {r.path}
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontWeight: 700, color: "#B45309" }}>{r.count}</td>
                      <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace" }}>{r.uniqueSessions}</td>
                      <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)" }}>{views || "—"}</td>
                      <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontWeight: 700, color: leakPct !== null && leakPct >= 15 ? "#B45309" : "var(--text)" }}>
                        {leakPct !== null ? `${leakPct}%` : "—"}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                          {r.topTargets.map((t) => (
                            <span key={t.host} style={{
                              padding: "0.15rem 0.55rem",
                              background: "rgba(180,83,9,0.08)",
                              border: "1px solid rgba(180,83,9,0.35)",
                              borderRadius: "9999px",
                              fontSize: "0.7rem",
                              fontFamily: "var(--font-mono), monospace",
                              color: "#B45309",
                              whiteSpace: "nowrap",
                            }}>
                              {t.host}
                              {t.count > 1 && <span style={{ color: "var(--text-muted)" }}> ×{t.count}</span>}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────── MinuteBook pilot requests ─────────────────── */

/**
 * Inbound MinuteBook pilot leads captured by /api/minute-book-pilot from
 * the /minute-books landing hero. Owner (CRS) provisions the workspace
 * manually — this card is where they see the queue.
 */
function PilotRequestsCard({ traffic }: { traffic: TrafficData }) {
  return (
    <div style={{ ...cardStyle, marginBottom: "1rem", borderColor: traffic.pilotRequestsTotal > 0 ? "var(--gold)" : "var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.85rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gold)" }}>
            MinuteBook pilot requests
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            Inbound leads from the /minute-books hero widget. Provision a workspace on minutebook.corporateregistryservices.ca and email the requester with a login link (SLA: one business day).
          </div>
        </div>
        <div style={{ textAlign: "right", fontFamily: "var(--font-mono), monospace", fontSize: "0.9rem", color: traffic.pilotRequestsTotal > 0 ? "var(--gold)" : "var(--text-muted)", fontWeight: 700 }}>
          {traffic.pilotRequestsTotal.toLocaleString()} in window
        </div>
      </div>

      {traffic.pilotRequestsRecent.length === 0 ? (
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "0.5rem 0", fontStyle: "italic" }}>
          No pilot requests in this window yet.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase" }}>
                <th style={thStyle}>Received</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Company</th>
                <th style={thStyle}>Corp #</th>
                <th style={thStyle}>Jurisdiction</th>
                <th style={thStyle}>Type</th>
              </tr>
            </thead>
            <tbody>
              {traffic.pilotRequestsRecent.map((r, i) => (
                <tr key={`${r.email}-${r.registryId}-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {new Date(r.createdAt).toLocaleString("en-CA", { timeZone: OPERATOR_TZ, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.8rem" }}>
                    <a href={`mailto:${r.email}`} style={{ color: "var(--secondary)", textDecoration: "none" }}>{r.email}</a>
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.companyName}>
                    {r.companyName}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    {r.registryId ? (
                      <a href={`/corporation/${r.registryId}`} target="_blank" rel="noreferrer" style={{ color: "var(--secondary)", textDecoration: "none", borderBottom: "1px dotted var(--border)" }}>
                        {r.registryId}
                      </a>
                    ) : "—"}
                  </td>
                  <td style={{ ...tdStyle, fontSize: "0.78rem" }}>{r.jurisdictionKey.toUpperCase()}</td>
                  <td style={{ ...tdStyle, fontSize: "0.72rem", color: "var(--text-muted)" }}>{r.entityType || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Inbound insights cards ─────────────────────── */

/**
 * Cart abandonment — visitors who reached /order/* and typed enough contact
 * info to be reachable, but no matching Stripe paid session exists in the
 * lookback window. The most actionable warm-lead list on the page.
 */
function CartAbandonmentCard({ inbound }: { inbound: InboundInsights }) {
  const unpaid = inbound.orderDraftsRecent.filter((d) => !d.paid);
  const withEmail = unpaid.filter((d) => d.email);
  const hot = inbound.orderDraftsCount;
  return (
    <div style={{ ...cardStyle, marginBottom: "1rem", borderColor: hot > 0 ? "rgba(212,175,55,0.5)" : "var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: hot > 0 ? "var(--gold)" : "var(--text-muted)" }}>
            Cart abandonment · last {INBOUND_WINDOW_DAYS} days
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            Visitors who typed contact info on an <code style={{ fontFamily: "var(--font-mono), monospace" }}>/order/*</code> page or picked a company but never completed payment. Cross-checked against paid Stripe sessions by email. Warm leads worth a personal reply.
          </div>
        </div>
        <div style={{ textAlign: "right", fontFamily: "var(--font-mono), monospace", fontSize: "0.9rem", color: hot > 0 ? "var(--gold)" : "var(--text-muted)", fontWeight: 700 }}>
          {hot} unpaid · {withEmail.length} reachable
        </div>
      </div>

      {unpaid.length === 0 ? (
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "0.75rem 0", fontStyle: "italic" }}>
          No unpaid drafts in the window — either every visitor converted or the beacon hasn&apos;t captured any yet.
        </div>
      ) : (
        <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase" }}>
                <th style={thStyle}>Last touch</th>
                <th style={thStyle}>Service</th>
                <th style={thStyle}>Company / Jurisdiction</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Contact</th>
              </tr>
            </thead>
            <tbody>
              {unpaid.slice(0, 20).map((d, i) => (
                <tr key={`${d.sessionId}-${d.service}-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {fmtLocal(d.updatedAt)}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.78rem" }}>{d.service}</td>
                  <td style={{ ...tdStyle, maxWidth: 260 }}>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.company}>{d.company || <em style={{ color: "var(--text-muted)" }}>—</em>}</div>
                    <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", color: "var(--text-muted)" }}>{d.jurisdiction || "—"}</div>
                  </td>
                  <td style={tdStyle}>{d.contactName || <em style={{ color: "var(--text-muted)" }}>(not typed)</em>}</td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.78rem" }}>
                    {d.email && <div><a href={`mailto:${d.email}`} style={{ color: "var(--secondary)", textDecoration: "none" }}>{d.email}</a></div>}
                    {d.phone && <div style={{ color: "var(--text-muted)" }}>{d.phone}</div>}
                    {!d.email && !d.phone && <em style={{ color: "var(--text-muted)" }}>—</em>}
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

/**
 * Search leads — from the "Save this search" card on registry search results.
 * Low-commitment top-of-funnel captures — often stale by day 5, but useful
 * for volume + trend.
 */
function SearchLeadsCard({ inbound }: { inbound: InboundInsights }) {
  return (
    <div style={{ ...cardStyle, marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
            Search leads · last {INBOUND_WINDOW_DAYS} days
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            Visitors who dropped their email on <code style={{ fontFamily: "var(--font-mono), monospace" }}>/canada-corporations-search</code> via the &ldquo;Save this search&rdquo; card. Passive interest — no follow-up promised, just a re-run link + pricing.
          </div>
        </div>
        <div style={{ textAlign: "right", fontFamily: "var(--font-mono), monospace", fontSize: "0.9rem", color: "var(--text)", fontWeight: 700 }}>
          {inbound.searchLeadsCount} captured
        </div>
      </div>

      {inbound.searchLeadsRecent.length === 0 ? (
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "0.75rem 0", fontStyle: "italic" }}>
          None yet.
        </div>
      ) : (
        <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase" }}>
                <th style={thStyle}>Saved</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Search query</th>
                <th style={thStyle}>Prov</th>
                <th style={thStyle}>Results</th>
              </tr>
            </thead>
            <tbody>
              {inbound.searchLeadsRecent.map((r, i) => (
                <tr key={`${r.email}-${r.createdAt}-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtLocal(r.createdAt)}</td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.78rem" }}>
                    <a href={`mailto:${r.email}`} style={{ color: "var(--secondary)", textDecoration: "none" }}>{r.email}</a>
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.query}>{r.query}</td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", color: "var(--text-muted)" }}>{r.province.toUpperCase()}</td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.78rem", fontWeight: 700, color: r.resultCount === 0 ? "#B45309" : "var(--text)" }}>{r.resultCount}</td>
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
 * Consultation requests — incorporation + NFP consultation bookings merged.
 * Higher-intent than search leads (they gave a phone number and jurisdiction)
 * and have a 1-business-day SLA on human reply.
 */
function ConsultationRequestsCard({ inbound }: { inbound: InboundInsights }) {
  return (
    <div style={{ ...cardStyle, marginBottom: "1rem", borderColor: inbound.consultationCount > 0 ? "rgba(42,125,143,0.4)" : "var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--secondary)" }}>
            Consultation requests · last {INBOUND_WINDOW_DAYS} days
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            Free consultation bookings from <code style={{ fontFamily: "var(--font-mono), monospace" }}>/incorporation/book-free-consultation</code> and <code style={{ fontFamily: "var(--font-mono), monospace" }}>/not-for-profit/book-free-consultation</code>. SLA: reach out within one business day.
          </div>
        </div>
        <div style={{ textAlign: "right", fontFamily: "var(--font-mono), monospace", fontSize: "0.9rem", color: "var(--secondary)", fontWeight: 700 }}>
          {inbound.consultationCount} inbound
        </div>
      </div>

      {inbound.consultationRecent.length === 0 ? (
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "0.75rem 0", fontStyle: "italic" }}>
          None in the window.
        </div>
      ) : (
        <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase" }}>
                <th style={thStyle}>Received</th>
                <th style={thStyle}>Kind</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Contact</th>
                <th style={thStyle}>Jurisdiction</th>
                <th style={thStyle}>Summary</th>
              </tr>
            </thead>
            <tbody>
              {inbound.consultationRecent.map((r, i) => (
                <tr key={`${r.email}-${r.createdAt}-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtLocal(r.createdAt)}</td>
                  <td style={{ ...tdStyle, fontSize: "0.7rem" }}>
                    <span style={{
                      padding: "0.15rem 0.5rem",
                      background: r.kind === "incorp" ? "rgba(42,125,143,0.1)" : "rgba(212,175,55,0.15)",
                      color:      r.kind === "incorp" ? "var(--secondary)"    : "var(--gold)",
                      border:     `1px solid ${r.kind === "incorp" ? "var(--secondary)" : "var(--gold)"}`,
                      borderRadius: "0.3rem",
                      fontFamily: "var(--font-mono), monospace",
                      fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
                    }}>{r.kind === "incorp" ? "Incorp" : "NFP"}</span>
                    {r.explorationMode && <span style={{ marginLeft: "0.35rem", fontSize: "0.68rem", color: "var(--text-muted)" }}>· exploring</span>}
                  </td>
                  <td style={{ ...tdStyle, fontSize: "0.82rem" }}>{r.name}</td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.76rem" }}>
                    <div><a href={`mailto:${r.email}`} style={{ color: "var(--secondary)", textDecoration: "none" }}>{r.email}</a></div>
                    <div style={{ color: "var(--text-muted)" }}>{r.phone}</div>
                  </td>
                  <td style={{ ...tdStyle, fontSize: "0.76rem" }}>{r.jurisdiction}</td>
                  <td style={{ ...tdStyle, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.summary}>{r.summary}</td>
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
 * Inbound messages — contact form + custom-quote wizard submits. Still
 * emailed via SES; this is the queryable Mongo mirror so nothing gets
 * lost if inbox rules eat it.
 */
function InboundMessagesCard({ inbound }: { inbound: InboundInsights }) {
  return (
    <div style={{ ...cardStyle, marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.35rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <div style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
            Inbound messages · last {INBOUND_WINDOW_DAYS} days
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
            <code style={{ fontFamily: "var(--font-mono), monospace" }}>/contact</code> submits + custom-quote wizard submits. Mirrors what SES delivers to <code style={{ fontFamily: "var(--font-mono), monospace" }}>NOTIFY_EMAIL</code>.
          </div>
        </div>
        <div style={{ textAlign: "right", fontFamily: "var(--font-mono), monospace", fontSize: "0.9rem", color: "var(--text)", fontWeight: 700 }}>
          {inbound.inboundMessagesCount} received
        </div>
      </div>

      {inbound.inboundMessagesRecent.length === 0 ? (
        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "0.75rem 0", fontStyle: "italic" }}>
          None yet.
        </div>
      ) : (
        <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase" }}>
                <th style={thStyle}>Received</th>
                <th style={thStyle}>Source</th>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Contact</th>
                <th style={thStyle}>Subject / preview</th>
              </tr>
            </thead>
            <tbody>
              {inbound.inboundMessagesRecent.map((r, i) => (
                <tr key={`${r.email}-${r.createdAt}-${i}`} style={{ borderTop: "1px solid var(--border)", verticalAlign: "top" }}>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.72rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmtLocal(r.createdAt)}</td>
                  <td style={{ ...tdStyle, fontSize: "0.7rem" }}>
                    <span style={{
                      padding: "0.15rem 0.5rem",
                      background: r.source === "contact" ? "var(--bg-deep)" : "rgba(212,175,55,0.1)",
                      color:      r.source === "contact" ? "var(--text)"   : "var(--gold)",
                      borderRadius: "0.3rem",
                      fontFamily: "var(--font-mono), monospace",
                      textTransform: "uppercase", letterSpacing: "0.04em",
                    }}>{r.source}</span>
                  </td>
                  <td style={{ ...tdStyle, fontSize: "0.82rem" }}>{r.name}</td>
                  <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontSize: "0.76rem" }}>
                    <div><a href={`mailto:${r.email}`} style={{ color: "var(--secondary)", textDecoration: "none" }}>{r.email}</a></div>
                    {r.phone && <div style={{ color: "var(--text-muted)" }}>{r.phone}</div>}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 460 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.subject}>{r.subject || <em style={{ color: "var(--text-muted)" }}>—</em>}</div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.message}>{r.message}</div>
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
