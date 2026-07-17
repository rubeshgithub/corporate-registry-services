import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MinuteBookPilotWidget from "@/components/MinuteBookPilotWidget";
import { listSection, SECTION_LABELS, type Section, SECTIONS } from "@/lib/content";
import { breadcrumbLd, jsonLdScript, faqLd } from "@/lib/structured-data";
import { ArrowRight, CheckCircle2 } from "lucide-react";

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
  "minute-books": {
    title:       "AI Minute Book Generator · Virtual Minute Book Canada · Free 30-Day Pilot",
    description: "Generate a complete Canadian corporate minute book with AI — articles, by-laws, resolutions, registers, share certificates. Virtual minute book, free 30-day pilot, no credit card. Also available done-for-you from $299.",
  },
};

/** The 14-document list published inside a Standard minute book — used
 *  on the /minute-books landing hero and in the schema markup. */
const MINUTE_BOOK_DOCS: Array<{ title: string; blurb: string }> = [
  { title: "Articles of Incorporation",              blurb: "Government-issued charter — the corporation's founding document." },
  { title: "Corporate By-Laws",                      blurb: "Internal operating rules governing meetings, officers, and share issuances." },
  { title: "Organizational Resolutions of Directors", blurb: "First-meeting decisions of the board — banking, officers, share allotments." },
  { title: "Organizational Resolutions of Shareholders", blurb: "Shareholder confirmations of directors, by-laws, and auditor waivers." },
  { title: "Register of Directors",                  blurb: "Every director with appointment + cessation dates." },
  { title: "Register of Officers",                   blurb: "Every officer with role, appointment + cessation dates." },
  { title: "Register of Shareholders",               blurb: "Who holds which shares, by class." },
  { title: "Register of Share Transfers",            blurb: "Chronological record of every share transfer." },
  { title: "Share Subscription Agreement",           blurb: "The shareholder's written offer to purchase shares." },
  { title: "Share Certificates",                     blurb: "Professionally formatted, sequentially numbered." },
  { title: "Consent to Act as Director",             blurb: "Signed acknowledgement by each director of their appointment." },
  { title: "Annual Directors' Resolutions",          blurb: "Yearly board resolutions — financial statements, officer appointments." },
  { title: "Annual Shareholders' Resolutions",       blurb: "Yearly shareholder resolutions — director elections, auditor waiver." },
  { title: "Share Transfer Register",                blurb: "Running record of certificate numbers issued and transferred." },
];

const MINUTE_BOOK_FAQ = [
  {
    q: "Is a virtual minute book legal in Canada?",
    a: "Yes. The Canada Business Corporations Act and every provincial corporate statute permit electronic minute books, provided the records are organized, accessible, and can be produced in readable form for inspection at the registered office.",
  },
  {
    q: "How does the free 30-day pilot work?",
    a: "Search your Canadian corporation, enter your email, and within one business day you receive login access to a MinuteBook workspace with your complete minute book already generated. No credit card required. Cancel any time during the 30-day pilot.",
  },
  {
    q: "What's the difference between the AI minute book generator and the done-for-you service?",
    a: "The AI generator produces your full minute book automatically from your registry record — you self-serve inside the MinuteBook app. The done-for-you service ($299 all-in) has a CRS specialist prepare, review, and deliver the minute book to your email, with human sign-off.",
  },
  {
    q: "Do I need to be an Alberta corporation for the pilot?",
    a: "The free pilot currently works fastest for Alberta corporations because our registry corpus is Alberta-first. Other provinces are supported via the done-for-you service — contact us to request early access to the pilot for your jurisdiction.",
  },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { section } = await params;
  const label = SECTION_LABELS[section as Section];
  if (!label) return {};
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

  const breadcrumb = breadcrumbLd([
    { name: "Home",     url: "/" },
    { name: label },
  ]);

  const isMinuteBooks = section === "minute-books";

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(breadcrumb)} />
      {isMinuteBooks && (
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(faqLd(MINUTE_BOOK_FAQ))} />
      )}
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
              {isMinuteBooks
                ? "AI Minute Book Generator for Canadian Corporations"
                : label}
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
              {isMinuteBooks
                ? "Generate a complete, jurisdiction-specific corporate minute book — with our virtual minute book app or done-for-you by CRS."
                : "Available across all 13 Canadian jurisdictions — federal, provincial, and territorial."}
            </p>
          </div>
        </div>

        {/* Cards grid */}
        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2.5rem 1.5rem 4rem" }}>

          {isMinuteBooks && (
            <>
              <MinuteBookPilotWidget />
              <MinuteBooksSeoContent />
              <div
                style={{
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-mono), monospace",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--text-muted)",
                  fontWeight: 700,
                  marginBottom: "0.85rem",
                }}
              >
                By jurisdiction
              </div>
            </>
          )}

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

/* ═══════════════════════════ MinuteBook landing content ═══════════════════════════ */

/**
 * Rich content block below the pilot widget. Kept in the section page
 * rather than moved into a MDX/markdown article because it's tightly
 * coupled to the widget above it and to the jurisdiction card grid
 * below — logical separation would fragment the SEO signal for
 * "AI minute book generator" / "virtual minute book" / "free minute book".
 */
function MinuteBooksSeoContent() {
  return (
    <div style={{ margin: "0 0 2.5rem" }}>
      {/* SEO-targeted H2s covering the keyword family */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem" }}>
          The virtual minute book, built for Canadian corporations
        </h2>
        <p style={{ fontSize: "0.95rem", color: "var(--text)", lineHeight: 1.65, margin: "0 0 0.75rem" }}>
          A <strong>virtual minute book</strong> is your corporation's official record book kept electronically instead of in a physical binder — legally equivalent under the <em>Canada Business Corporations Act</em> and every provincial statute. Our <strong>AI minute book generator</strong> assembles the complete document set from your registry record so you don't manually retype anything: articles, by-laws, resolutions, registers, share certificates.
        </p>
        <p style={{ fontSize: "0.95rem", color: "var(--text)", lineHeight: 1.65, margin: 0 }}>
          A <strong>free minute book</strong> pilot lets you try the whole thing for 30 days without paying anything. No credit card, no auto-renew — if the workspace doesn't fit how you already run compliance, you don't hear from us again.
        </p>
      </section>

      {/* What's included */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
          What&apos;s included: every document your corporation needs
        </h2>
        <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", lineHeight: 1.55, marginBottom: "1.25rem" }}>
          Our minute book generator produces a complete, jurisdiction-specific package. Every document is professionally formatted and ready for filing or presentation — delivered as a single merged PDF and individual documents, ready to sign, store, and present to your bank or lawyer.
        </p>
        <div
          style={{
            display:            "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap:                "0.5rem",
          }}
        >
          {MINUTE_BOOK_DOCS.map((doc) => (
            <div
              key={doc.title}
              style={{
                display:      "flex",
                gap:          "0.55rem",
                alignItems:   "flex-start",
                padding:      "0.65rem 0.85rem",
                background:   "var(--card)",
                border:       "1px solid var(--border)",
                borderRadius: "0.4rem",
              }}
            >
              <CheckCircle2 size={16} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.15rem" }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text)" }}>{doc.title}</div>
                <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", marginTop: "0.15rem", lineHeight: 1.5 }}>{doc.blurb}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How the pilot works */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem" }}>
          How the free 30-day pilot works
        </h2>
        <ol style={{ fontSize: "0.95rem", color: "var(--text)", lineHeight: 1.7, margin: 0, paddingLeft: "1.25rem" }}>
          <li>Search your Canadian corporation in the box above.</li>
          <li>Pick it from the dropdown and enter your email.</li>
          <li>Within one business day, we email you a login link to your MinuteBook workspace at <a href="https://minutebook.corporateregistryservices.ca" style={{ color: "var(--secondary)" }}>minutebook.corporateregistryservices.ca</a>.</li>
          <li>Explore the pre-generated minute book, invite your accountant or lawyer as a collaborator, and export the merged PDF. Cancel any time in the 30-day window with one click.</li>
        </ol>
      </section>

      {/* Done-for-you alternative */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.75rem" }}>
          Prefer done-for-you? $299 all-in for a complete minute book
        </h2>
        <p style={{ fontSize: "0.95rem", color: "var(--text)", lineHeight: 1.65, margin: "0 0 0.75rem" }}>
          If you'd rather have a CRS specialist prepare, review, and deliver your minute book by email — no self-serve app required — the done-for-you service is $299 all-in + GST for a fresh minute book from your incorporation documents, or $749 / $1,399 for older corporations that need government document retrieval. See the <a href="/minute-books/digital-minute-book-canada" style={{ color: "var(--secondary)" }}>digital minute book service page</a> for the full package breakdown.
        </p>
      </section>

      {/* FAQ */}
      <section>
        <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", marginBottom: "1rem" }}>
          Frequently asked questions
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {MINUTE_BOOK_FAQ.map((item, i) => (
            <div key={i}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.4rem" }}>{item.q}</h3>
              <p style={{ fontSize: "0.92rem", color: "var(--text)", lineHeight: 1.6, margin: 0 }}>{item.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
