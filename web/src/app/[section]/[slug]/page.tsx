import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getPage, listAllPages, SECTION_LABELS, type Section, SECTIONS } from "@/lib/content";
import { ArrowLeft, ArrowRight } from "lucide-react";

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
  return {
    title: `${page.title} — CRS`,
    description: `${page.title}. Official Canadian corporate registry services by CRS — all 13 jurisdictions.`,
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

          {/* Rendered markdown */}
          <div
            className="prose"
            dangerouslySetInnerHTML={{ __html: page.contentHtml }}
          />

          {/* CTA card */}
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
                Ready to order?
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>
                Get a custom quote in minutes — we respond within 1 hour.
              </p>
            </div>
            <a
              href="/#hero"
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
              Get a quote <ArrowRight size={14} />
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
      </main>
      <Footer />
    </>
  );
}
