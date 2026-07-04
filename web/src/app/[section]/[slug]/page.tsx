import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getPage, listAllPages, SECTION_LABELS, type Section, SECTIONS } from "@/lib/content";
import { inferServiceContext, wizardHref } from "@/lib/service-context";
import { ArrowLeft, ArrowRight, Zap, AlertTriangle } from "lucide-react";

type Params = { section: string; slug: string };

export async function generateStaticParams(): Promise<Params[]> {
  return listAllPages().map((p) => ({ section: p.section, slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { section, slug } = await params;
  const page = await getPage(section as Section, slug);
  if (!page) return {};
  const fallback = `${page.title}. Official Canadian corporate registry services by CRS — all 13 jurisdictions.`;
  // Canonical is the lowercased slug — consolidates the ~14 TitleCase URL
  // duplicates Google has in its index into a single ranking signal.
  return {
    title: `${page.title} — CRS`,
    description: page.description || fallback,
    alternates: { canonical: `/${section}/${slug.toLowerCase()}` },
  };
}

export default async function ContentPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { section, slug } = await params;

  if (!SECTIONS.includes(section as Section)) notFound();

  const page = await getPage(section as Section, slug);
  if (!page) notFound();

  const sectionLabel = SECTION_LABELS[page.section];
  const sectionHref = `/${section}`;
  const ctx = inferServiceContext(page.section, page.slug);
  const ctaHref = ctx ? wizardHref(ctx, `article-${page.slug}`) : "/#incorporate";

  return (
    <>
      <Header />
      <main style={{ flex: 1 }}>
        {/* Breadcrumb */}
        <div style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-deep)" }}>
          <div
            style={{
              maxWidth: "860px",
              margin: "0 auto",
              padding: "0.75rem 1.5rem",
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
              fontSize: "0.78rem",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            <a href="/" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Home</a>
            <span>/</span>
            <a href={sectionHref} style={{ color: "var(--text-muted)", textDecoration: "none" }}>
              {sectionLabel}
            </a>
            <span>/</span>
            <span style={{ color: "var(--text)" }}>{page.title}</span>
          </div>
        </div>

        {/* Article */}
        <article
          style={{
            maxWidth: "860px",
            margin: "0 auto",
            padding: "3rem 1.5rem 4rem",
          }}
        >
          {/* Section chip */}
          <div style={{ marginBottom: "1rem" }}>
            <span className="category-chip">{sectionLabel}</span>
          </div>

          {/* Title */}
          <h1
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              fontSize: "clamp(1.75rem, 3vw, 2.5rem)",
              fontWeight: 700,
              lineHeight: 1.2,
              color: "var(--text)",
              marginBottom: "1.5rem",
            }}
          >
            {page.title}
          </h1>

          <div className="gold-line" style={{ marginBottom: "2rem" }} />

          {/* Deadline urgency callout — only rendered for jurisdictions with
              a genuinely short filing window (Alberta 1 mo, BC 2 mo, federal
              60 days). Placed above the conversion strip so the urgency →
              offer → click sequence lands in a single glance. */}
          {ctx?.urgency && (
            <div
              style={{
                marginBottom: "1.25rem",
                padding: "1rem 1.25rem",
                borderRadius: "0.5rem",
                border: "1px solid rgba(180, 83, 9, 0.35)",
                background:
                  "linear-gradient(135deg, rgba(180, 83, 9, 0.09) 0%, rgba(180, 83, 9, 0.03) 100%)",
                display: "flex",
                gap: "0.75rem",
                alignItems: "flex-start",
              }}
            >
              <AlertTriangle size={18} style={{ color: "#B45309", flexShrink: 0, marginTop: "0.15rem" }} />
              <div>
                <div style={{ fontWeight: 700, color: "#B45309", fontSize: "0.9rem", lineHeight: 1.35 }}>
                  {ctx.urgency.headline}
                </div>
                <p style={{ fontSize: "0.82rem", color: "var(--text)", margin: "0.35rem 0 0", lineHeight: 1.55 }}>
                  {ctx.urgency.body}
                </p>
              </div>
            </div>
          )}

          {/* Above-the-fold conversion strip — visitors from Google must see
              price + offer + one-click order before scrolling past the H1. */}
          {ctx && (
            <div
              style={{
                marginBottom: "2rem",
                padding: "1.25rem 1.5rem",
                borderRadius: "0.75rem",
                border: "1px solid var(--gold)",
                background:
                  "linear-gradient(135deg, rgba(212,175,55,0.10) 0%, rgba(212,175,55,0.04) 100%)",
                display: "flex",
                flexWrap: "wrap",
                gap: "1rem",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", flex: "1 1 300px" }}>
                <span
                  style={{
                    width: "2rem",
                    height: "2rem",
                    borderRadius: "0.5rem",
                    background: "var(--gold-dim)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                  aria-hidden
                >
                  <Zap size={16} style={{ color: "var(--gold)" }} />
                </span>
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-display), Georgia, serif",
                      fontSize: "1.05rem",
                      fontWeight: 700,
                      color: "var(--text)",
                      marginBottom: "0.25rem",
                      lineHeight: 1.3,
                    }}
                  >
                    {ctx.ctaHeadline}
                  </div>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.55 }}>
                    {ctx.ctaSubline}
                  </p>
                </div>
              </div>
              <a
                href={ctaHref}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.75rem 1.25rem",
                  borderRadius: "0.5rem",
                  background: "var(--primary)",
                  color: "#FFFFFF",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {ctx.ctaButton} <ArrowRight size={14} />
              </a>
            </div>
          )}

          {/* Rendered markdown */}
          <div
            className="prose"
            dangerouslySetInnerHTML={{ __html: page.contentHtml }}
          />

          {/* Bottom CTA card — same deep link so we don't drop the visitor
              back into the generic homepage wizard. */}
          <div
            style={{
              marginTop: "3rem",
              padding: "1.5rem",
              borderRadius: "0.75rem",
              border: "1px solid var(--border)",
              background: "var(--card)",
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  fontSize: "1.1rem",
                  fontWeight: 600,
                  color: "var(--text)",
                  marginBottom: "0.25rem",
                }}
              >
                {ctx ? `Ready — ${ctx.price}, filed within 24 hours` : "Ready to order?"}
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>
                {ctx
                  ? "We'll pull your registry record, confirm what's changed, and file. No lawyer needed."
                  : "Get a custom quote in minutes — we respond within 1 hour."}
              </p>
            </div>
            <a
              href={ctaHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.625rem 1.25rem",
                borderRadius: "0.5rem",
                background: "var(--primary)",
                color: "#FFFFFF",
                fontWeight: 600,
                fontSize: "0.875rem",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              {ctx ? ctx.ctaButton : "Get a quote"} <ArrowRight size={14} />
            </a>
          </div>

          {/* Back link */}
          <div style={{ marginTop: "2rem" }}>
            <a
              href={sectionHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                fontSize: "0.85rem",
                color: "var(--text-muted)",
                textDecoration: "none",
              }}
            >
              <ArrowLeft size={14} /> Back to {sectionLabel}
            </a>
          </div>
        </article>

        {/* Sticky mobile CTA — bottom-fixed, only appears on screens narrower
            than 768px. Same deep link as the top strip so mobile visitors
            always have a one-tap path to the order flow, even if they scroll
            past the H1 without reading. Style lives in globals.css. */}
        {ctx && (
          <a href={ctaHref} className="crs-sticky-cta">
            <span>{ctx.stickyLabel ?? ctx.ctaButton}</span>
            <ArrowRight size={16} />
          </a>
        )}
      </main>
      <Footer />
    </>
  );
}
