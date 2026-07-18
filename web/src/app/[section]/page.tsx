import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { listSection, getPillar, SECTION_LABELS, type Section, SECTIONS } from "@/lib/content";
import { breadcrumbLd, faqLd, jsonLdScript } from "@/lib/structured-data";
import { ArrowRight } from "lucide-react";
import { formatReviewedDate } from "@/lib/format-date";
import NfpConsultationCTA from "@/components/NfpConsultationCTA";

type Params = { section: string };

export function generateStaticParams(): Params[] {
  return SECTIONS.map((s) => ({ section: s }));
}

/**
 * Section-specific overrides for metadata + a compact order strip.
 * The generic template is fine for most sections but the annual-return
 * index is a real ranking page for queries like "annual return filing"
 * and deserves purpose-built copy + a direct order path.
 */
type SectionOverride = {
  title:       string;
  description: string;
  orderStrip?: {
    headline: string;
    sub:      string;
    href:     string;
    cta:      string;
  };
};

const SECTION_OVERRIDES: Partial<Record<Section, SectionOverride>> = {
  "annual-return": {
    title:       "Canadian Annual Return Filing — $99 All-In, All Jurisdictions | CRS",
    description: "File your Canadian corporate annual return through the government registry — $99 all-in, government fee included. Federal + all 13 provinces/territories. Filed within 24 hours.",
    orderStrip: {
      headline: "Ready to file? $99 all-in + GST, any jurisdiction.",
      sub:      "Government fee included. Filed within 24 hours.",
      href:     "/order/annual-return?src=section-annual-return",
      cta:      "Order now",
    },
  },
  // NOTE: `minute-books` has a dedicated hand-crafted page at
  // app/minute-books/page.tsx that Next routes to instead of this
  // [section] catch-all. The pilot widget + AI/free-pilot copy lives
  // there, not here.
};

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { section } = await params;
  const label = SECTION_LABELS[section as Section];
  if (!label) return {};

  // Pillar frontmatter (from _index.md, when present) wins over any
  // hardcoded SECTION_OVERRIDES — the NFP cluster ships its own
  // pillar copy with the SEO title + description already tuned.
  const pillar = await getPillar(section as Section);
  if (pillar) {
    return {
      title:       pillar.title,
      description: pillar.description ?? `${label} — CRS.`,
      alternates:  { canonical: `/${section}` },
    };
  }

  const override = SECTION_OVERRIDES[section as Section];
  return {
    title:       override?.title       ?? `${label} — CRS`,
    description: override?.description ?? `${label} across all Canadian provinces, territories, and federal. Official government-direct service by CRS.`,
    alternates:  { canonical: `/${section}` },
  };
}

export default async function SectionPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { section } = await params;

  if (!SECTIONS.includes(section as Section)) notFound();

  const pages = listSection(section as Section);
  const label = SECTION_LABELS[section as Section];
  const override = SECTION_OVERRIDES[section as Section];
  const pillar = await getPillar(section as Section);

  const breadcrumb = breadcrumbLd([
    { name: "Home",     url: "/" },
    { name: label },
  ]);

  // If the section ships a pillar page (_index.md), render it as a full
  // long-form landing page — hero + rendered markdown body + FAQPage
  // schema + a "See all guides" grid at the bottom that links to each
  // jurisdiction page in this section. Used by the NFP clusters
  // (/not-for-profit/, /nfp-grants/); other sections fall through to
  // the standard card-grid layout below.
  if (pillar) {
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(breadcrumb)} />
        {pillar.faq && pillar.faq.length > 0 && (
          <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(faqLd(pillar.faq))} />
        )}
        <Header />
        <main style={{ flex: 1 }}>
          <div style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-deep)" }}>
            <div style={{ maxWidth: "860px", margin: "0 auto", padding: "0.75rem 1.5rem", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
              <a href="/" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Home</a>
              <span>/</span>
              <span style={{ color: "var(--text)" }}>{label}</span>
            </div>
          </div>

          <article style={{ maxWidth: "860px", margin: "0 auto", padding: "3rem 1.5rem 4rem" }}>
            <div style={{ marginBottom: "1rem" }}>
              <span className="category-chip">{label}</span>
            </div>

            <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 700, lineHeight: 1.2, color: "var(--text)", marginBottom: "0.6rem" }}>
              {pillar.h1 ?? pillar.title}
            </h1>

            {pillar.lastUpdated && (
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", marginBottom: "1.5rem" }}>
                {formatReviewedDate(pillar.lastUpdated)}
              </div>
            )}

            <div className="gold-line" style={{ marginBottom: "1rem" }} />

            {(section === "not-for-profit" || section === "nfp-grants") && (
              <NfpConsultationCTA src={`pillar-${section}`} />
            )}

            <div className="prose" dangerouslySetInnerHTML={{ __html: pillar.contentHtml }} />

            {/* Jurisdiction-guide card grid — auto-generated from all
                non-underscored files in this section. Excludes the
                book-free-consultation form page from the grid because
                it isn't a jurisdiction guide. */}
            {pages.filter((p) => p.slug !== "book-free-consultation").length > 0 && (
              <>
                <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.4rem", fontWeight: 700, color: "var(--text)", marginTop: "3rem", marginBottom: "1rem" }}>
                  Guides by jurisdiction
                </h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.6rem" }}>
                  {pages.filter((p) => p.slug !== "book-free-consultation").map((page) => (
                    <a
                      key={page.slug}
                      href={`/${page.section}/${page.slug}`}
                      className="section-card"
                    >
                      {page.title}
                      <ArrowRight size={13} style={{ color: "var(--gold)", flexShrink: 0 }} />
                    </a>
                  ))}
                </div>
              </>
            )}
          </article>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(breadcrumb)} />
      <Header />
      <main style={{ flex: 1 }}>
        {/* Hero */}
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-deep)",
            padding: "3rem 1.5rem",
          }}
        >
          <div style={{ maxWidth: "860px", margin: "0 auto" }}>
            <a
              href="/"
              style={{
                fontSize: "0.78rem",
                color: "var(--text-muted)",
                textDecoration: "none",
                fontFamily: "var(--font-mono), monospace",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                marginBottom: "1rem",
              }}
            >
              ← Home
            </a>
            <span className="category-chip" style={{ display: "block", marginBottom: "0.75rem" }}>
              {label}
            </span>
            <h1
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
                fontWeight: 700,
                color: "var(--text)",
                marginBottom: "0.75rem",
              }}
            >
              {label}
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
              Available across all 13 Canadian jurisdictions — federal, provincial, and territorial.
            </p>
          </div>
        </div>

        {/* Cards grid */}
        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2.5rem 1.5rem 4rem" }}>

          {/* Compact order strip — only rendered for sections with a dedicated
              checkout. Deliberately understated: single line, subtle gold
              accent, so it feels like a UI cue rather than a takeover. */}
          {override?.orderStrip && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                flexWrap: "wrap",
                padding: "0.7rem 1rem",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderLeft: "3px solid var(--gold)",
                borderRadius: "0.5rem",
                marginBottom: "1.5rem",
              }}
            >
              <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                <span style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, color: "var(--text)", lineHeight: 1.35 }}>
                  {override.orderStrip.headline}
                </span>
                <span style={{ display: "block", fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>
                  {override.orderStrip.sub}
                </span>
              </div>
              <a
                href={override.orderStrip.href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.5rem 0.95rem",
                  borderRadius: "0.4rem",
                  background: "var(--primary)",
                  color: "#FFFFFF",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {override.orderStrip.cta} <ArrowRight size={13} />
              </a>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: "0.75rem",
            }}
          >
            {pages.map((page) => (
              <a
                key={page.slug}
                href={`/${page.section}/${page.slug}`}
                className="section-card"
              >
                {page.title}
                <ArrowRight size={14} style={{ color: "var(--gold)", flexShrink: 0 }} />
              </a>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

