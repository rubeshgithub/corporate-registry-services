import { redirect, notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkHtml from "remark-html";
import { isCmsAuthenticated } from "@/lib/cms-auth";
import { cmsArticles } from "@/lib/cms-mongo";

/**
 * /cms/preview/[id] — renders a draft from Mongo using the same markdown
 * pipeline as the live [section]/[slug] renderer (remark + remark-gfm +
 * remark-html). Simplified layout — no header/footer, no service CTAs, no
 * related-pages — but conveys what the copy will look like.
 *
 * Noindexed for safety (visible only to authenticated CMS users anyway,
 * but noindex hardens against a leaked cookie).
 */

export const dynamic  = "force-dynamic";
export const runtime  = "nodejs";
export const metadata = { robots: { index: false, follow: false } };

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isCmsAuthenticated())) redirect("/cms/login");

  const { id } = await params;
  let oid: ObjectId;
  try { oid = new ObjectId(id); } catch { notFound(); }

  const col = await cmsArticles();
  const article = await col.findOne({ _id: oid! });
  if (!article) notFound();

  const contentHtml = String(
    await remark()
      .use(remarkGfm)
      .use(remarkHtml, { sanitize: false })
      .process(article.body ?? ""),
  );

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      color: "var(--text)",
      padding: "0",
    }}>
      <div style={{
        background: "rgba(212,175,55,0.14)",
        borderBottom: "1px solid var(--gold)",
        padding: "0.55rem 1.5rem",
        display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap",
        fontSize: "0.8rem", color: "var(--gold)",
      }}>
        <strong style={{ fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          PREVIEW
        </strong>
        <span style={{ color: "var(--text)" }}>Status: {article.status}</span>
        <span style={{ color: "var(--text-muted)" }}>·</span>
        <span style={{ color: "var(--text)", fontFamily: "var(--font-mono), monospace" }}>
          /{article.section}/{article.slug || "(no slug)"}
        </span>
        <a href={`/cms/edit/${String(article._id)}`} style={{ marginLeft: "auto", color: "var(--gold)", textDecoration: "underline", fontWeight: 700 }}>
          ← Back to editor
        </a>
      </div>

      <article style={{ maxWidth: "860px", margin: "0 auto", padding: "2.5rem 1.5rem 4rem" }}>
        <h1 style={{
          fontFamily: "var(--font-display), Georgia, serif",
          fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
          fontWeight: 700, lineHeight: 1.2,
          color: "var(--text)", marginBottom: "1rem",
        }}>
          {article.h1 || article.title || "(no title)"}
        </h1>

        {article.description && (
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            {article.description}
          </p>
        )}

        <div className="prose" dangerouslySetInnerHTML={{ __html: contentHtml }} />

        {article.faq && article.faq.length > 0 && (
          <section style={{ marginTop: "3rem", paddingTop: "2rem", borderTop: "1px solid var(--border)" }}>
            <h2 style={{
              fontFamily: "var(--font-display), Georgia, serif",
              fontSize: "1.4rem", fontWeight: 700, color: "var(--text)",
              marginBottom: "1.25rem",
            }}>
              Frequently asked questions
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {article.faq.map((item, i) => (
                <div key={i}>
                  <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.4rem", lineHeight: 1.4 }}>{item.q}</h3>
                  <p style={{ fontSize: "0.92rem", color: "var(--text)", lineHeight: 1.6, margin: 0 }}>{item.a}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </article>
    </div>
  );
}
