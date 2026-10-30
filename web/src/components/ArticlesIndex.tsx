"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search, X, CalendarDays, Clock, MapPin } from "lucide-react";
import { PROVINCES, TOPICS, type ProvinceKey, type TopicKey } from "@/lib/article-taxonomy";
import type { ArticleCard } from "@/lib/content";

/**
 * /articles index (owner, Oct 30 2026): newest first, published date on every card, filter chips by topic and
 * province with counts in brackets, a search box. Every card is in the server HTML (all links crawlable); the
 * filters only hide cards. Filters live in the URL (?topic=&province=&q=) so a filtered list can be shared.
 */

type Sort = "new" | "old" | "az";

const fmtDate = (d: string) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";

const NEW_DAYS = 7;

export default function ArticlesIndex({ articles }: { articles: ArticleCard[] }) {
  const [topic, setTopic] = useState<TopicKey | "">("");
  const [province, setProvince] = useState<ProvinceKey | "">("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("new");

  /* Read the filters from the URL once on load (no useSearchParams: the page is statically rendered). */
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("topic") ?? "", p = sp.get("province") ?? "";
    if (TOPICS.some((x) => x.key === t)) setTopic(t as TopicKey);
    if (PROVINCES.some((x) => x.key === p)) setProvince(p as ProvinceKey);
    setQ(sp.get("q") ?? "");
    const s = sp.get("sort");
    if (s === "old" || s === "az") setSort(s);
  }, []);

  useEffect(() => {
    const sp = new URLSearchParams();
    if (topic) sp.set("topic", topic);
    if (province) sp.set("province", province);
    if (q.trim()) sp.set("q", q.trim());
    if (sort !== "new") sp.set("sort", sort);
    const qs = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [topic, province, q, sort]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const matchesQ = (a: ArticleCard) => words.every((w) => `${a.title} ${a.description}`.toLowerCase().includes(w));

  /* Faceted counts: each row counts within the OTHER active filter (and the search), so a number is what you get. */
  const topicCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of articles) if ((!province || a.province === province) && matchesQ(a)) m.set(a.topic, (m.get(a.topic) ?? 0) + 1);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, province, q]);
  const provinceCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of articles) if ((!topic || a.topic === topic) && matchesQ(a)) m.set(a.province, (m.get(a.province) ?? 0) + 1);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, topic, q]);

  const shown = useMemo(() => {
    const list = articles.filter((a) => (!topic || a.topic === topic) && (!province || a.province === province) && matchesQ(a));
    if (sort === "old") return [...list].sort((a, b) => (a.date || "9").localeCompare(b.date || "9") || a.title.localeCompare(b.title));
    if (sort === "az") return [...list].sort((a, b) => a.title.localeCompare(b.title));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articles, topic, province, q, sort]);

  const sumTopic = [...topicCounts.values()].reduce((a, b) => a + b, 0);
  const sumProvince = [...provinceCounts.values()].reduce((a, b) => a + b, 0);
  const filtered = Boolean(topic || province || q.trim());
  const newSince = new Date(Date.now() - NEW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const topicName = (k: string) => TOPICS.find((t) => t.key === k)?.label ?? k;
  const provinceName = (k: string) => PROVINCES.find((p) => p.key === k)?.label ?? k;

  return (
    <div className="ai-wrap">
      <div className="ai-toolbar">
        <label className="ai-search">
          <Search size={16} aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search articles — e.g. annual return, QuickBooks, NUANS"
            aria-label="Search articles"
          />
          {q && <button type="button" onClick={() => setQ("")} aria-label="Clear search"><X size={14} /></button>}
        </label>
        <label className="ai-sort">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort articles">
            <option value="new">Newest first</option>
            <option value="old">Oldest first</option>
            <option value="az">A–Z</option>
          </select>
        </label>
      </div>

      <div className="ai-filters">
        <div className="ai-filter-row">
          <span className="ai-filter-label">Topic</span>
          <div className="ai-chips">
            <button type="button" className={`ai-chip${!topic ? " is-on" : ""}`} onClick={() => setTopic("")}>
              All <span className="ai-count">({sumTopic})</span>
            </button>
            {TOPICS.filter((t) => (topicCounts.get(t.key) ?? 0) > 0 || topic === t.key).map((t) => (
              <button key={t.key} type="button" className={`ai-chip${topic === t.key ? " is-on" : ""}`} onClick={() => setTopic(topic === t.key ? "" : t.key)} aria-pressed={topic === t.key}>
                {t.label} <span className="ai-count">({topicCounts.get(t.key) ?? 0})</span>
              </button>
            ))}
          </div>
        </div>
        <div className="ai-filter-row">
          <span className="ai-filter-label">Province</span>
          <div className="ai-chips">
            <button type="button" className={`ai-chip${!province ? " is-on" : ""}`} onClick={() => setProvince("")}>
              All <span className="ai-count">({sumProvince})</span>
            </button>
            {PROVINCES.filter((p) => (provinceCounts.get(p.key) ?? 0) > 0 || province === p.key).map((p) => (
              <button key={p.key} type="button" className={`ai-chip${province === p.key ? " is-on" : ""}`} onClick={() => setProvince(province === p.key ? "" : p.key)} aria-pressed={province === p.key}>
                {p.label} <span className="ai-count">({provinceCounts.get(p.key) ?? 0})</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="ai-resultbar">
        <span>
          {shown.length} article{shown.length === 1 ? "" : "s"}
          {topic && <> in <b>{topicName(topic)}</b></>}
          {province && <> · <b>{provinceName(province)}</b></>}
          {q.trim() && <> matching &ldquo;{q.trim()}&rdquo;</>}
        </span>
        {filtered && (
          <button type="button" className="ai-clear" onClick={() => { setTopic(""); setProvince(""); setQ(""); }}>
            <X size={13} /> Clear filters
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="ai-empty">
          No article matches that yet. <button type="button" className="ai-clear" onClick={() => { setTopic(""); setProvince(""); setQ(""); }}>Show all articles</button>
        </div>
      ) : (
        <div className="ai-grid">
          {shown.map((a) => (
            <a key={a.slug} href={`/${a.section}/${a.slug}`} className={`ai-card ai-t-${a.topic}`}>
              <div className="ai-card-top">
                <span className="ai-topic">{topicName(a.topic)}</span>
                <span className="ai-prov"><MapPin size={12} aria-hidden /> {provinceName(a.province)}</span>
              </div>
              {a.date && a.date >= newSince && <span className="ai-new">New</span>}
              <h2 className="ai-title">{a.title}</h2>
              {a.description && <p className="ai-desc">{a.description}</p>}
              <div className="ai-meta">
                {a.date && <span><CalendarDays size={13} aria-hidden /> <time dateTime={a.date}>{fmtDate(a.date)}</time></span>}
                <span><Clock size={13} aria-hidden /> {a.readMins} min read</span>
                <ArrowRight size={15} className="ai-arrow" aria-hidden />
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
