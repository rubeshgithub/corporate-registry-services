import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ChatWithUsButton from "@/components/ChatWithUsButton";
import { FAQ_CATEGORIES } from "@/lib/faq-content";
import { jsonLdScript } from "@/lib/structured-data";
import { ArrowRight, HelpCircle } from "lucide-react";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.corporateregistryservices.ca";

export const metadata: Metadata = {
  title: "Frequently Asked Questions — CRS — Corporate Registry Services",
  description:
    "Pricing, timelines, coverage, and answers to common questions about filing Canadian corporate annual returns, incorporating a business, and ordering profile reports through CRS.",
  alternates: { canonical: "/faq" },
};

/**
 * FAQPage JSON-LD — Google may render individual Q&A pairs as expandable
 * cards in the SERP for direct-match queries. Restricted increasingly to
 * authoritative sources but harmless to include; we generate it directly
 * from the same content the page renders so it can never drift.
 */
function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type":    "FAQPage",
    mainEntity: FAQ_CATEGORIES.flatMap((cat) =>
      cat.items.map((item) => ({
        "@type": "Question",
        name:    item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text:    item.a,
        },
      })),
    ),
  };
}

export default function FaqPage() {
  const totalCount = FAQ_CATEGORIES.reduce((sum, c) => sum + c.items.length, 0);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(faqJsonLd())} />
      <Header />
      <main style={{ flex: 1 }}>
        {/* Hero */}
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            background:   "linear-gradient(160deg,#E8F4FD 0%,#F8FAFC 100%)",
            padding:      "3rem 1.5rem",
          }}
        >
          <div style={{ maxWidth: "820px", margin: "0 auto" }}>
            <span
              style={{
                fontFamily:    "var(--font-mono),monospace",
                fontSize:      "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color:         "var(--gold)",
                display:       "block",
                marginBottom:  "0.75rem",
              }}
            >
              Support
            </span>
            <h1
              style={{
                fontFamily: "var(--font-display),Georgia,serif",
                fontSize:   "clamp(1.75rem,3vw,2.5rem)",
                fontWeight: 700,
                color:      "var(--text)",
                marginBottom: "0.5rem",
              }}
            >
              Frequently asked questions
            </h1>
            <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", lineHeight: 1.65, maxWidth: "56ch", marginBottom: "1.25rem" }}>
              {totalCount} answers to the most common pricing, timing, and coverage questions.
              If you don&apos;t find what you&apos;re looking for, chat with us or email{" "}
              <a href="mailto:support@corporateregistryservices.ca" style={{ color: "var(--gold)", textDecoration: "none" }}>
                support@corporateregistryservices.ca
              </a>.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <ChatWithUsButton />
            </div>
          </div>
        </div>

        {/* Category jump links */}
        <div style={{ maxWidth: "820px", margin: "0 auto", padding: "1.5rem 1.5rem 0" }}>
          <div
            style={{
              display: "flex",
              gap:     "0.4rem",
              flexWrap: "wrap",
              paddingBottom: "1rem",
              borderBottom:  "1px solid var(--border)",
            }}
          >
            {FAQ_CATEGORIES.map((cat) => (
              <a
                key={cat.key}
                href={`#${cat.key}`}
                style={{
                  padding:      "0.35rem 0.75rem",
                  border:       "1px solid var(--border)",
                  borderRadius: "0.4rem",
                  fontSize:     "0.78rem",
                  fontFamily:   "var(--font-mono),monospace",
                  color:        "var(--text-muted)",
                  textDecoration: "none",
                  background:   "var(--card)",
                }}
              >
                {cat.title}
              </a>
            ))}
          </div>
        </div>

        {/* Content */}
        <article style={{ maxWidth: "820px", margin: "0 auto", padding: "0 1.5rem 4rem" }}>
          {FAQ_CATEGORIES.map((cat) => (
            <section key={cat.key} id={cat.key} style={{ marginTop: "2.5rem" }}>
              <h2
                style={{
                  fontFamily: "var(--font-display),Georgia,serif",
                  fontSize:   "1.35rem",
                  fontWeight: 700,
                  color:      "var(--text)",
                  marginBottom: "1rem",
                }}
              >
                {cat.title}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                {cat.items.map((item, i) => (
                  <details
                    key={`${cat.key}-${i}`}
                    style={{
                      border:       "1px solid var(--border)",
                      borderRadius: "0.5rem",
                      background:   "var(--card)",
                      padding:      "0 1rem",
                    }}
                  >
                    <summary
                      style={{
                        listStyle:  "none",
                        cursor:     "pointer",
                        padding:    "0.9rem 0",
                        fontSize:   "0.95rem",
                        fontWeight: 600,
                        color:      "var(--text)",
                        display:    "flex",
                        alignItems: "flex-start",
                        gap:        "0.5rem",
                      }}
                    >
                      <HelpCircle size={16} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.15rem" }} aria-hidden />
                      <span style={{ flex: 1 }}>{item.q}</span>
                    </summary>
                    <div
                      style={{
                        padding:    "0 0 1rem 1.55rem",
                        fontSize:   "0.9rem",
                        color:      "var(--text-muted)",
                        lineHeight: 1.65,
                      }}
                    >
                      <p style={{ margin: "0 0 0.6rem" }}>{item.a}</p>
                      {item.href && (
                        <a
                          href={item.href}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            fontSize:   "0.82rem",
                            color:      "var(--gold)",
                            textDecoration: "none",
                            fontWeight: 600,
                          }}
                        >
                          Related page <ArrowRight size={12} />
                        </a>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}

          {/* Still stuck? */}
          <section
            style={{
              marginTop: "3rem",
              padding:   "1.75rem 1.75rem",
              border:    "1px solid var(--gold)",
              borderRadius: "var(--radius-card)",
              background:   "linear-gradient(135deg, rgba(212,175,55,0.10) 0%, rgba(212,175,55,0.02) 100%)",
              textAlign:    "center",
              boxShadow:    "var(--shadow-card)",
            }}
          >
            <h2
              className="card-heading"
              style={{
                fontSize:   "1.2rem",
                marginBottom: "0.4rem",
              }}
            >
              Still have questions?
            </h2>
            <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", margin: "0 auto 1rem", maxWidth: "44ch" }}>
              Chat with us or send an email. We respond during business hours (Mountain Time), usually within an hour.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
              <ChatWithUsButton />
              <a
                href="mailto:support@corporateregistryservices.ca"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.65rem 1.15rem",
                  background: "transparent",
                  color: "var(--text)",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  border: "1px solid var(--border)",
                  borderRadius: "0.5rem",
                  textDecoration: "none",
                }}
              >
                Email support
              </a>
            </div>
          </section>
        </article>
      </main>
      <Footer />

      {/* Site-wide URL context for canonical resolution */}
      <link rel="canonical" href={`${SITE_URL}/faq`} />
    </>
  );
}
