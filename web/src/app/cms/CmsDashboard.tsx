"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Edit2, ExternalLink, LogOut, FileText, Search, CheckCircle2, Clock, Trash2 } from "lucide-react";

type Article = {
  id:              string;
  slug:            string;
  section:         string;
  title:           string;
  description:     string;
  status:          "draft" | "published";
  createdAt:       string;
  updatedAt:       string;
  publishedAt:     string | null;
  publishedUrl:    string | null;
  publishedCommit: string | null;
};

const SECTIONS = [
  "articles",
  "guides",
  "annual-return",
  "incorporation",
  "minute-books",
  "good-standing",
  "profile-reports",
  "not-for-profit",
  "nfp-grants",
];

export default function CmsDashboard() {
  const router = useRouter();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState("");
  const [q, setQ]               = useState("");
  const [status, setStatus]     = useState<"" | "draft" | "published">("");
  const [section, setSection]   = useState<string>("");
  const [creating, setCreating]         = useState(false);
  const [confirmDeleteId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId]     = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const url = new URL("/api/cms/articles", window.location.origin);
      if (q.length >= 2) url.searchParams.set("q", q);
      if (status)        url.searchParams.set("status", status);
      if (section)       url.searchParams.set("section", section);
      const res = await fetch(url.toString());
      if (res.status === 401) { router.push("/cms/login"); return; }
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setArticles(json.articles as Article[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [q, status, section]);

  const createArticle = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/cms/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: section || "articles" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      router.push(`/cms/edit/${json.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed.");
    } finally {
      setCreating(false);
    }
  };

  const deleteArticle = async (id: string) => {
    setDeletingId(id);
    setErr("");
    try {
      const res  = await fetch(`/api/cms/articles/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setArticles((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  };

  const logout = async () => {
    try { await fetch("/api/cms/logout", { method: "POST" }); } catch { /* ignore */ }
    router.push("/cms/login");
    router.refresh();
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "1rem 1.5rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--card)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <FileText size={18} style={{ color: "var(--gold)" }} />
          <h1 style={{
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: "1.15rem", fontWeight: 700, color: "var(--text)", margin: 0,
          }}>CRS Content CMS</h1>
        </div>
        <button onClick={logout} style={ghostBtn}>
          <LogOut size={13} /> Sign out
        </button>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "1.5rem 1.5rem 4rem" }}>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "2 1 260px" }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, slug, description…"
              style={{ ...inputStyle, paddingLeft: "2rem" }}
            />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} style={{ ...inputStyle, flex: "0 0 auto", width: 160 }}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          <select value={section} onChange={(e) => setSection(e.target.value)} style={{ ...inputStyle, flex: "0 0 auto", width: 180 }}>
            <option value="">All sections</option>
            {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={createArticle} disabled={creating} style={primaryBtn}>
            {creating ? <Loader2 size={13} className="crs-spin" /> : <Plus size={14} />} New article
          </button>
        </div>

        {err && (
          <div style={{
            padding: "0.6rem 0.85rem",
            background: "rgba(220,38,38,0.08)", color: "#B91C1C",
            fontSize: "0.85rem", borderRadius: "0.4rem", marginBottom: "1rem",
          }}>{err}</div>
        )}

        {loading ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
            <Loader2 size={16} className="crs-spin" /> Loading…
          </div>
        ) : articles.length === 0 ? (
          <div style={{
            padding: "3rem", textAlign: "center", color: "var(--text-muted)",
            border: "1px dashed var(--border)", borderRadius: "0.5rem",
          }}>
            No articles yet. Click <strong>New article</strong> to start your first draft.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {articles.map((a) => (
              <div key={a.id} style={{
                padding: "0.85rem 1rem",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "0.45rem",
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "0.75rem",
                alignItems: "center",
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.2rem" }}>
                    <StatusPill status={a.status} />
                    <span style={{
                      fontFamily: "var(--font-mono), monospace",
                      fontSize: "0.7rem",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}>
                      {a.section}
                    </span>
                  </div>
                  <div style={{
                    fontSize: "0.95rem", fontWeight: 700, color: "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {a.title || <em style={{ color: "var(--text-muted)", fontWeight: 400 }}>(untitled draft)</em>}
                  </div>
                  <div style={{
                    fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.15rem",
                    fontFamily: "var(--font-mono), monospace",
                  }}>
                    {a.slug ? `/${a.section}/${a.slug}` : "(no slug set)"} · Updated {fmt(a.updatedAt)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                  {confirmDeleteId === a.id ? (
                    <>
                      <span style={{ fontSize: "0.72rem", color: "#B91C1C", fontWeight: 600 }}>
                        {a.status === "published" ? "Delete + take offline?" : "Delete draft?"}
                      </span>
                      <button
                        onClick={() => deleteArticle(a.id)}
                        disabled={deletingId === a.id}
                        style={dangerBtn}
                      >
                        {deletingId === a.id ? <Loader2 size={12} className="crs-spin" /> : <Trash2 size={12} />}
                        Yes, delete
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        disabled={deletingId === a.id}
                        style={ghostBtn}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <a href={`/cms/edit/${a.id}`} style={ghostBtn}>
                        <Edit2 size={12} /> Edit
                      </a>
                      {a.status === "published" && a.publishedUrl && (
                        <a href={a.publishedUrl} target="_blank" rel="noreferrer" style={ghostBtn}>
                          <ExternalLink size={12} /> View
                        </a>
                      )}
                      <button onClick={() => setConfirmId(a.id)} style={ghostDangerBtn} title="Delete article">
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatusPill({ status }: { status: "draft" | "published" }) {
  const s = status === "published"
    ? { bg: "rgba(22,163,74,0.10)", color: "#166534", icon: <CheckCircle2 size={11} />, label: "Published" }
    : { bg: "rgba(212,175,55,0.14)", color: "var(--gold)", icon: <Clock size={11} />, label: "Draft" };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "0.25rem",
      padding: "0.15rem 0.45rem",
      background: s.bg, color: s.color,
      fontSize: "0.68rem", fontWeight: 700,
      borderRadius: "0.3rem", textTransform: "uppercase", letterSpacing: "0.04em",
    }}>
      {s.icon} {s.label}
    </span>
  );
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.55rem 0.8rem",
  border: "1px solid var(--border)",
  borderRadius: "0.4rem",
  fontSize: "0.9rem",
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "inherit",
};

const primaryBtn: React.CSSProperties = {
  padding: "0.55rem 1rem",
  background: "var(--primary)",
  color: "#FFFFFF",
  border: "none",
  borderRadius: "0.4rem",
  fontSize: "0.85rem", fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: "0.35rem",
};

const ghostBtn: React.CSSProperties = {
  padding: "0.4rem 0.75rem",
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: "0.35rem",
  fontSize: "0.78rem",
  cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: "0.3rem",
  textDecoration: "none",
};

const ghostDangerBtn: React.CSSProperties = {
  ...ghostBtn,
  padding: "0.4rem 0.55rem",
  color: "#B91C1C",
};

const dangerBtn: React.CSSProperties = {
  padding: "0.4rem 0.75rem",
  background: "#B91C1C",
  border: "1px solid #B91C1C",
  color: "#FFFFFF",
  borderRadius: "0.35rem",
  fontSize: "0.78rem", fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: "0.3rem",
};
