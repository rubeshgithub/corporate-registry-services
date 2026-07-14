"use client";

import { useMemo, useState } from "react";
import { X, Copy, ExternalLink } from "lucide-react";
import type { PageRow, PageQueryRow } from "@/lib/gsc-mongo";

/** Row shape passed in from the page — pre-scored + sorted server-side. */
type ScoredPage = PageRow & { opportunity: number };

/**
 * Underperforming Pages table with click-to-drill-down.
 * Clicking a row opens a right-side drawer showing the top 25 queries
 * driving impressions to that specific page, sourced from the
 * `pageQueries` slice of the current GSC snapshot.
 *
 * The drawer surfaces exactly the queries a title/meta rewrite should
 * target — no need to leave the page or open Search Console.
 */
export default function PagesTable({
  pages,
  pageQueries,
  ctrThresholdPct,
}: {
  pages:            ScoredPage[];
  pageQueries:      PageQueryRow[];
  ctrThresholdPct:  number;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const drillQueries = useMemo(() => {
    if (!selected) return [];
    return pageQueries
      .filter((pq) => pq.path === selected)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 25);
  }, [selected, pageQueries]);

  const selectedPage = useMemo(
    () => pages.find((p) => p.path === selected) ?? null,
    [selected, pages],
  );

  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
          <thead>
            <tr style={{ background: "var(--bg-deep)" }}>
              {["Page", "Impr", "Clicks", "CTR", "Avg pos", "Opportunity", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => (
              <tr
                key={p.path}
                onClick={() => setSelected(p.path)}
                style={{
                  borderTop: "1px solid var(--border)",
                  cursor: "pointer",
                  background: selected === p.path ? "var(--card-hover)" : undefined,
                }}
              >
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.path}>
                  {shortenUrl(p.path)}
                </td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontWeight: 700 }}>{p.impressions.toLocaleString()}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace" }}>{p.clicks}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: "#B45309", fontWeight: 700 }}>{(p.ctr * 100).toFixed(2)}%</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: "var(--text-muted)" }}>{p.position.toFixed(1)}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: "var(--gold)", fontWeight: 700 }}>+{p.opportunity} clicks</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <span style={{ fontSize: "0.68rem", color: "var(--secondary)", fontFamily: "var(--font-mono), monospace" }}>
                    drill →
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.75rem", fontStyle: "italic" }}>
        Click any row to see the top queries driving impressions to that page — the queries your title/meta rewrite should target.
      </div>

      {selected && selectedPage && (
        <>
          <div
            onClick={() => setSelected(null)}
            aria-hidden="true"
            style={{
              position: "fixed", inset: 0,
              background: "rgba(0, 61, 91, 0.15)",
              zIndex: 40,
            }}
          />
          <aside
            role="dialog"
            aria-label="Query drill-down"
            style={{
              position: "fixed",
              top: 0, right: 0, bottom: 0,
              width: "min(640px, 100vw)",
              background: "var(--card)",
              borderLeft: "1px solid var(--border)",
              boxShadow: "-8px 0 32px rgba(0, 61, 91, 0.18)",
              overflowY: "auto",
              zIndex: 50,
              padding: "1.25rem 1.5rem",
            }}
          >
            {/* Sticky header */}
            <div style={{
              position: "sticky", top: 0, background: "var(--card)", zIndex: 1,
              padding: "0.35rem 0 0.75rem", marginBottom: "0.5rem",
              borderBottom: "1px solid var(--border)",
              display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem",
            }}>
              <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                <div className="card-heading" style={{ fontSize: "1rem", marginBottom: "0.15rem" }}>Query drill-down</div>
                <a
                  href={selectedPage.path}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontFamily: "var(--font-mono), monospace", fontSize: "0.75rem", color: "var(--secondary)", textDecoration: "none", wordBreak: "break-all" }}
                >
                  {selectedPage.path}
                  <ExternalLink size={11} />
                </a>
              </div>
              <button
                onClick={() => setSelected(null)}
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

            {/* Page-level summary */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", padding: "0.75rem 0", marginBottom: "0.75rem", borderBottom: "1px dotted var(--border)" }}>
              <Metric label="Impr"    value={selectedPage.impressions.toLocaleString()} />
              <Metric label="Clicks"  value={String(selectedPage.clicks)} />
              <Metric label="CTR"     value={`${(selectedPage.ctr * 100).toFixed(2)}%`} highlight={selectedPage.ctr < ctrThresholdPct / 100 ? "#B45309" : undefined} />
              <Metric label="Avg pos" value={selectedPage.position.toFixed(1)} />
              <Metric label="Opportunity" value={`+${selectedPage.opportunity} clicks/wk`} highlight="var(--gold)" />
            </div>

            {/* Query list */}
            {drillQueries.length === 0 ? (
              <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "1rem 0", fontStyle: "italic" }}>
                No per-query breakdown captured for this page in the current snapshot. This can happen when Google Search Console suppresses query data for pages with low click volume.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", fontWeight: 700 }}>
                    Top {drillQueries.length} queries driving impressions
                  </div>
                  <CopyQueriesButton queries={drillQueries} />
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ background: "var(--bg-deep)" }}>
                        {["Query", "Impr", "Clicks", "CTR", "Pos"].map((h) => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {drillQueries.map((q) => (
                        <tr key={q.query} style={{ borderTop: "1px solid var(--border)" }}>
                          <td style={{ ...tdStyle, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={q.query}>{q.query}</td>
                          <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", fontWeight: 700 }}>{q.impressions.toLocaleString()}</td>
                          <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace" }}>{q.clicks}</td>
                          <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: q.ctr < 0.02 ? "#B45309" : "var(--text)" }}>{(q.ctr * 100).toFixed(2)}%</td>
                          <td style={{ ...tdStyle, fontFamily: "var(--font-mono), monospace", color: q.position <= 5 ? "var(--secondary)" : "var(--text-muted)" }}>{q.position.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.85rem", fontStyle: "italic", lineHeight: 1.55 }}>
                  Rewrite the page title + meta description to speak directly to the highest-impression queries in this list.
                  Queries where <strong>position ≤ 5</strong> (teal) are already ranking — the snippet is losing the click. Fix meta first.
                  Queries where <strong>position &gt; 10</strong> aren&apos;t ranking — content depth needed, not just meta.
                </div>
              </>
            )}
          </aside>
        </>
      )}
    </>
  );
}

/* ─── sub-components ─────────────────────────────────────────── */

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "1.1rem", fontWeight: 700, color: highlight ?? "var(--text)" }}>{value}</div>
    </div>
  );
}

function CopyQueriesButton({ queries }: { queries: PageQueryRow[] }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          const text = queries.map((q) => `${q.query}\t${q.impressions}\t${q.clicks}\t${(q.ctr * 100).toFixed(2)}%\t${q.position.toFixed(1)}`).join("\n");
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard blocked — ignore */ }
      }}
      style={{
        background: copied ? "var(--secondary)" : "var(--card)",
        color:      copied ? "#fff"             : "var(--text-muted)",
        border: "1px solid var(--border)",
        borderRadius: "0.35rem",
        padding: "0.35rem 0.65rem",
        fontSize: "0.72rem",
        fontFamily: "var(--font-mono), monospace",
        cursor: "pointer",
        display: "inline-flex", alignItems: "center", gap: "0.3rem",
      }}
      title="Copy query list as TSV — paste into a doc for title-writing research"
    >
      {copied ? "✓ Copied" : <><Copy size={11} /> Copy TSV</>}
    </button>
  );
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch { return url; }
}

const thStyle: React.CSSProperties = {
  padding: "0.5rem 0.5rem", fontWeight: 500, textAlign: "left",
  color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace",
  fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em",
};
const tdStyle: React.CSSProperties = {
  padding: "0.55rem 0.5rem", color: "var(--text)", verticalAlign: "top",
};
