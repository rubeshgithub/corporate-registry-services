import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getPage, listAllPages, SECTION_LABELS, type Section, SECTIONS } from "@/lib/content";
import { inferServiceContext, wizardHref } from "@/lib/service-context";
import { getRelatedGroups } from "@/lib/related-pages";
import { breadcrumbLd, serviceLd, faqLd, jsonLdScript } from "@/lib/structured-data";
import InlineLookupOrder from "@/components/InlineLookupOrder";
import NfpConsultationCTA from "@/components/NfpConsultationCTA";
import ShareCertLookupIsland from "@/components/ShareCertLookupIsland";
import { formatReviewedDate } from "@/lib/format-date";
import { ArrowLeft, ArrowRight, Zap, AlertTriangle, ExternalLink } from "lucide-react";

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

  const relatedGroups = getRelatedGroups(page.section, page.slug);
  const breadcrumb = breadcrumbLd([
    { name: "Home",         url: "/" },
    { name: sectionLabel,   url: sectionHref },
    { name: page.title },
  ]);
  const service = ctx
    ? serviceLd({ ctx, pageUrl: `/${section}/${slug.toLowerCase()}`, pageName: page.title })
    : null;

  return (
    <>
      {/* Structured data — helps SERPs render breadcrumbs, price snippets,
          and FAQ rich results / AI Overview answers. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(breadcrumb)} />
      {service && (
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(service)} />
      )}
      {page.faq && page.faq.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(faqLd(page.faq))} />
      )}

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
            {page.h1 ?? page.title}
          </h1>

          {page.lastUpdated && (
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace", marginTop: "-0.75rem", marginBottom: "1.5rem" }}>
              {formatReviewedDate(page.lastUpdated)}
            </div>
          )}

          <div className="gold-line" style={{ marginBottom: "1rem" }} />

          {/* NFP consultation CTA — replaces the paid-order strip for the
              two not-for-profit clusters, where the primary action is a free
              specialist call, not a checkout. Sits at the top so the
              consultation isn't buried under 2,500 words of jurisdictional
              detail. Excludes the booking form page itself. */}
          {(page.section === "not-for-profit" || page.section === "nfp-grants") &&
           page.slug !== "book-free-consultation" && (
            <NfpConsultationCTA src={`article-${page.section}-${page.slug}`} />
          )}

          {/* Inline lookup + order widget — for the three lookup-first
              services (annual return, profile report, good standing), give
              high-intent visitors a way to search their company and pay
              without leaving this page. The urgency line is folded into the
              card (subtle, below the search input) so the fold isn't a
              wall of price + warning before the visitor has done anything.
              Other service articles still see the conversion strip below. */}
          {ctx && (
            ctx.serviceKey === "annual-return"  ||
            ctx.serviceKey === "profile-report" ||
            ctx.serviceKey === "good-standing"
          ) && (
            <InlineLookupOrder
              service={ctx.serviceKey as "annual-return" | "profile-report" | "good-standing"}
              provinceKey={ctx.jurisdictionKey}
              srcTag={`inline-article-${page.slug}`}
              urgency={ctx.urgency ?? null}
              eyebrowOverride={page.widgetEyebrow ?? null}
              titleOverride={page.widgetTitle ?? null}
              subOverride={page.widgetSub ?? null}
            />
          )}

          {/* Share-certificate lookup widget — different flow shape than the
              AR/PR/GS inline widget above because a share cert needs
              shareholder + share details AFTER the corp is picked. So this
              widget only handles the corp search; the visitor is redirected
              to /order/share-certificate with the picked corp stashed in
              sessionStorage, where ShareCertSingleScreenFlow auto-verifies
              on mount. Single share-cert article for now — extend the
              condition if we add more share-cert-adjacent articles. */}
          {page.section === "articles" && page.slug === "share-certificates-in-canada" && (
            <ShareCertLookupIsland src={`article-${page.slug}`} />
          )}

          {/* Deadline urgency callout — for articles WITHOUT the inline widget
              (minute-books, incorporation, etc.), the urgency still lives here
              as a standalone red-tinted block. */}
          {ctx?.urgency &&
            ctx.serviceKey !== "annual-return"  &&
            ctx.serviceKey !== "profile-report" &&
            ctx.serviceKey !== "good-standing"  && (
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

          {/* Split the article body around the conversion strip.
              After the first 2 paragraphs the reader has enough context to
              understand the offer — that's where we drop the strip.
              If there are fewer than 2 paragraphs, the strip stays at the
              top of the body. */}
          {(() => {
            const strip = ctx ? (
              <div
                style={{
                  margin: "2rem 0",
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
            ) : null;

            const parts = page.contentHtml.split("</p>");
            if (!ctx || parts.length <= 2) {
              return (
                <>
                  {strip}
                  <div className="prose" dangerouslySetInnerHTML={{ __html: page.contentHtml }} />
                </>
              );
            }
            const first = parts.slice(0, 2).join("</p>") + "</p>";
            const rest  = parts.slice(2).join("</p>");
            return (
              <>
                <div className="prose" dangerouslySetInnerHTML={{ __html: first }} />
                {strip}
                <div className="prose" dangerouslySetInnerHTML={{ __html: rest }} />
              </>
            );
          })()}

          {/* FAQ section — rendered from frontmatter `faq: [{q, a}]` and
              paired with FAQPage JSON-LD above so Google can source it
              for rich results and AI Overviews. */}
          {page.faq && page.faq.length > 0 && (
            <section
              style={{
                marginTop: "3rem",
                paddingTop: "2rem",
                borderTop: "1px solid var(--border)",
              }}
            >
              <h2
                style={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  fontSize: "1.4rem",
                  fontWeight: 700,
                  color: "var(--text)",
                  marginBottom: "1.25rem",
                }}
              >
                Frequently asked questions
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                {page.faq.map((item, i) => (
                  <div key={i}>
                    <h3
                      style={{
                        fontSize: "1rem",
                        fontWeight: 700,
                        color: "var(--text)",
                        marginBottom: "0.4rem",
                        lineHeight: 1.4,
                      }}
                    >
                      {item.q}
                    </h3>
                    <p style={{ fontSize: "0.92rem", color: "var(--text)", lineHeight: 1.6, margin: 0 }}>
                      {item.a}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

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

          {/* Related pages — cross-links for humans, internal-link graph for
              Google. Helps consolidate topical clusters and pushes the
              ~15 still-unindexed pages into crawl range. */}
          {relatedGroups.length > 0 && (
            <div
              style={{
                marginTop: "3rem",
                paddingTop: "2rem",
                borderTop: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  fontSize: "1.05rem",
                  fontWeight: 700,
                  color: "var(--text)",
                  marginBottom: "1rem",
                }}
              >
                Related on CRS
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: "1.25rem",
                }}
              >
                {relatedGroups.map((group) => (
                  <div key={group.title}>
                    <div
                      style={{
                        fontSize: "0.72rem",
                        fontFamily: "var(--font-mono), monospace",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color: "var(--text-muted)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {group.title}
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {group.links.map((link) => (
                        <li key={link.href}>
                          <a
                            href={link.href}
                            {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                            style={{
                              color: "var(--text)",
                              textDecoration: "none",
                              fontSize: "0.85rem",
                              display: "inline-flex",
                              alignItems: "flex-start",
                              gap: "0.35rem",
                              lineHeight: 1.4,
                            }}
                          >
                            <span style={{ borderBottom: "1px solid var(--gold)", paddingBottom: "1px" }}>{link.label}</span>
                            {link.external && <ExternalLink size={11} style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: "0.2rem" }} />}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

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
