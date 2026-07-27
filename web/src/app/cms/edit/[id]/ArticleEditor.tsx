"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Send, ArrowLeft, Loader2, AlertCircle, Plus, Trash2, ExternalLink, Eye, CheckCircle2 } from "lucide-react";

/**
 * Article editor. Fields mirror the front-matter the [section]/[slug]
 * catch-all renders. Save writes to Mongo (draft); Publish serializes
 * to markdown + commits to git via /api/cms/articles/[id]/publish.
 */

type Faq = { q: string; a: string };

type Article = {
  id:              string;
  slug:            string;
  section:         string;
  title:           string;
  h1:              string | null;
  description:     string;
  body:            string;
  faq:             Faq[];
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

const MAX_TITLE = 70;
const MAX_DESC  = 165;

export default function ArticleEditor({ id }: { id: string }) {
  const router = useRouter();

  const [article, setArticle]   = useState<Article | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savedAt, setSavedAt]   = useState<string | null>(null);
  const [err, setErr]           = useState("");
  const [publishProblems, setPublishProblems] = useState<string[]>([]);
  const [publishResult, setPublishResult] = useState<{ url: string; htmlUrl: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/cms/articles/${id}`);
        if (res.status === 401) { router.push("/cms/login"); return; }
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        if (!cancelled) setArticle(json.article as Article);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Load failed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, router]);

  const patch = (p: Partial<Article>) => {
    if (!article) return;
    setArticle({ ...article, ...p });
    setSavedAt(null);
  };

  const save = async (): Promise<Article | null> => {
    if (!article) return null;
    setSaving(true);
    setErr("");
    setPublishProblems([]);
    try {
      const res = await fetch(`/api/cms/articles/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug:        article.slug,
          section:     article.section,
          title:       article.title,
          h1:          article.h1,
          description: article.description,
          body:        article.body,
          faq:         article.faq,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (json.problems) setPublishProblems(json.problems);
        setErr(json.error || `Save failed (${res.status}).`);
        return null;
      }
      const updated = json.article as Article;
      setArticle(updated);
      setSavedAt(updated.updatedAt);
      return updated;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!article) return;
    /* Save first so the latest edits are committed. */
    const saved = await save();
    if (!saved) return;

    setPublishing(true);
    setErr("");
    setPublishProblems([]);
    setPublishResult(null);
    try {
      const res = await fetch(`/api/cms/articles/${id}/publish`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        if (json.problems) setPublishProblems(json.problems);
        setErr(json.error || `Publish failed (${res.status}).`);
        return;
      }
      setPublishResult({ url: json.url, htmlUrl: json.htmlUrl });
      /* Re-fetch to pick up publishedAt / publishedCommit / status = "published". */
      const refetch = await fetch(`/api/cms/articles/${id}`);
      if (refetch.ok) {
        const j = await refetch.json();
        if (j.ok) setArticle(j.article as Article);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  };

  const addFaq   = () => article && patch({ faq: [...article.faq, { q: "", a: "" }] });
  const setFaq   = (i: number, p: Partial<Faq>) => article && patch({ faq: article.faq.map((f, ix) => ix === i ? { ...f, ...p } : f) });
  const removeFaq = (i: number) => article && patch({ faq: article.faq.filter((_, ix) => ix !== i) });

  if (loading) {
    return <FullPage><Loader2 size={16} className="crs-spin" /> Loading…</FullPage>;
  }
  if (!article) {
    return <FullPage><span style={{ color: "#B91C1C" }}>{err || "Not found."}</span></FullPage>;
  }

  const titleLen = article.title.length;
  const descLen  = article.description.length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "1rem 1.5rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--card)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <a href="/cms" style={ghostBtn}>
          <ArrowLeft size={13} /> Back to list
        </a>
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          {savedAt && !saving && (
            <span style={{ fontSize: "0.7rem", color: "#166534", display: "inline-flex", gap: "0.25rem", alignItems: "center" }}>
              <CheckCircle2 size={12} /> Saved {fmtTime(savedAt)}
            </span>
          )}
          <a href={`/cms/preview/${article.id}`} target="_blank" rel="noreferrer" style={ghostBtn}>
            <Eye size={13} /> Preview
          </a>
          <button onClick={save} disabled={saving || publishing} style={secondaryBtn}>
            {saving ? <Loader2 size={13} className="crs-spin" /> : <Save size={13} />} Save draft
          </button>
          <button onClick={publish} disabled={saving || publishing} style={primaryBtn}>
            {publishing ? <Loader2 size={13} className="crs-spin" /> : <Send size={13} />}
            {article.status === "published" ? "Republish" : "Publish"}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "1.5rem 1.5rem 4rem" }}>
        {err && (
          <div style={{
            padding: "0.7rem 0.9rem",
            background: "rgba(220,38,38,0.08)", color: "#B91C1C",
            fontSize: "0.85rem", borderRadius: "0.4rem", marginBottom: "1rem",
            display: "flex", gap: "0.4rem", alignItems: "flex-start",
          }}>
            <AlertCircle size={14} style={{ marginTop: "0.1rem", flexShrink: 0 }} /> {err}
          </div>
        )}

        {publishProblems.length > 0 && (
          <div style={{
            padding: "0.75rem 1rem",
            background: "rgba(212,175,55,0.12)", color: "var(--gold)",
            border: "1px solid rgba(212,175,55,0.55)",
            fontSize: "0.85rem", borderRadius: "0.4rem", marginBottom: "1rem",
          }}>
            <div style={{ fontWeight: 700, marginBottom: "0.35rem" }}>Fix before publishing:</div>
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {publishProblems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}

        {publishResult && (
          <div style={{
            padding: "0.75rem 1rem",
            background: "rgba(22,163,74,0.10)", color: "#166534",
            border: "1px solid rgba(22,163,74,0.45)",
            fontSize: "0.9rem", borderRadius: "0.4rem", marginBottom: "1rem",
            display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap",
          }}>
            <CheckCircle2 size={14} />
            <strong>Published.</strong>
            Render will redeploy within ~2 min.
            <a href={publishResult.url} target="_blank" rel="noreferrer" style={{ color: "#166534", textDecoration: "underline" }}>
              {publishResult.url}
            </a>
            <a href={publishResult.htmlUrl} target="_blank" rel="noreferrer" style={{ color: "#166534", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
              <ExternalLink size={11} /> commit
            </a>
          </div>
        )}

        {/* Frontmatter fields */}
        <Card>
          <FieldRow>
            <Field label="Section" required>
              <select value={article.section} onChange={(e) => patch({ section: e.target.value })} style={inputStyle}>
                {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Slug (URL)" required hint="kebab-case only. Full URL: /{section}/{slug}">
              <input value={article.slug} onChange={(e) => patch({ slug: e.target.value })} placeholder="how-to-file-your-annual-return" style={inputStyle} />
            </Field>
          </FieldRow>

          <Field label="Title" required hint={`${titleLen}/${MAX_TITLE} · appears as <title> in the browser tab + SERP link`}>
            <input value={article.title} onChange={(e) => patch({ title: e.target.value })} style={{ ...inputStyle, borderColor: titleLen > MAX_TITLE ? "#B91C1C" : undefined }} />
          </Field>

          <Field label="H1 (optional)" hint="Overrides the visible page title. Leave empty to use the Title above.">
            <input value={article.h1 ?? ""} onChange={(e) => patch({ h1: e.target.value || null })} style={inputStyle} />
          </Field>

          <Field label="Description (meta)" required hint={`${descLen}/${MAX_DESC} · appears in Google SERP snippet`}>
            <textarea
              value={article.description}
              onChange={(e) => patch({ description: e.target.value })}
              style={{ ...inputStyle, minHeight: "3.5rem", resize: "vertical", borderColor: descLen > MAX_DESC ? "#B91C1C" : undefined }}
            />
          </Field>
        </Card>

        {/* Body */}
        <Card>
          <Field label="Body (Markdown)" hint="GitHub-flavoured markdown. Supports headings, lists, tables, links, bold/italic. Renders through the same pipeline as existing articles.">
            <textarea
              value={article.body}
              onChange={(e) => patch({ body: e.target.value })}
              style={{ ...inputStyle, minHeight: "24rem", resize: "vertical", fontFamily: "var(--font-mono), monospace", fontSize: "0.85rem", lineHeight: 1.55 }}
              placeholder="## What is a corporate profile report?&#10;&#10;A corporate profile report is..."
            />
          </Field>
        </Card>

        {/* FAQ */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <div>
              <div style={sectionHeading}>FAQ (schema-eligible)</div>
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.3rem 0 0", lineHeight: 1.5 }}>
                Adds FAQ JSON-LD to the page for Google rich results + AI Overview extraction.
              </p>
            </div>
            <button onClick={addFaq} style={secondaryBtn}>
              <Plus size={13} /> Add Q&A
            </button>
          </div>
          {article.faq.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontStyle: "italic", margin: 0 }}>
              No FAQ items yet.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {article.faq.map((item, i) => (
                <div key={i} style={{
                  padding: "0.85rem 1rem",
                  background: "var(--bg-deep)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.4rem",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                    <span style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em", fontWeight: 700 }}>
                      Q&A {i + 1}
                    </span>
                    <button onClick={() => removeFaq(i)} title="Remove" style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "0.15rem" }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <Field label="Question">
                    <input value={item.q} onChange={(e) => setFaq(i, { q: e.target.value })} style={inputStyle} />
                  </Field>
                  <Field label="Answer">
                    <textarea value={item.a} onChange={(e) => setFaq(i, { a: e.target.value })} style={{ ...inputStyle, minHeight: "5rem", resize: "vertical" }} />
                  </Field>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Metadata footer */}
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "1rem", padding: "0 0.25rem" }}>
          Created {fmtTime(article.createdAt)} · Updated {fmtTime(article.updatedAt)}
          {article.publishedAt && <> · Published {fmtTime(article.publishedAt)}</>}
          {article.publishedCommit && <> · commit {article.publishedCommit.slice(0, 7)}</>}
        </div>
      </main>
    </div>
  );
}

/* ── Little components ─────────────────────────────────── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: "var(--card)",
      border: "1px solid var(--border)",
      borderRadius: "0.55rem",
      padding: "1.25rem 1.4rem",
      marginBottom: "1rem",
    }}>{children}</div>
  );
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.75rem", marginBottom: "0.5rem" }}>
      {children}
    </div>
  );
}

function Field({ label, hint, required, children }: {
  label: string; hint?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: "0.75rem" }}>
      <span style={{ display: "block", fontSize: "0.78rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.3rem" }}>
        {label}{required && <span style={{ color: "#B91C1C" }}> *</span>}
      </span>
      {children}
      {hint && <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.25rem", lineHeight: 1.45 }}>{hint}</span>}
    </label>
  );
}

function FullPage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100vh", background: "var(--bg)",
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: "0.5rem", color: "var(--text-muted)", fontSize: "0.9rem",
    }}>{children}</div>
  );
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ── Styles ─────────────────────────────────────────────── */

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.6rem 0.85rem",
  border: "1px solid var(--border)",
  borderRadius: "0.4rem",
  fontSize: "0.9rem",
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "inherit",
};

const sectionHeading: React.CSSProperties = {
  fontFamily: "var(--font-mono), monospace",
  fontSize: "0.72rem",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
  fontWeight: 700,
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

const secondaryBtn: React.CSSProperties = {
  padding: "0.55rem 1rem",
  background: "var(--card)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: "0.4rem",
  fontSize: "0.82rem",
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
