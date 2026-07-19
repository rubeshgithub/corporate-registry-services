import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import InlineLookupOrder from "@/components/InlineLookupOrder";
import { listSection } from "@/lib/content";
import { breadcrumbLd, faqLd, jsonLdScript } from "@/lib/structured-data";
import { ArrowRight, CheckCircle2, Clock, ShieldCheck, Landmark, Search, BookOpen, Building2, MapPin, Mail, Users, UserCheck, AlertCircle } from "lucide-react";

/**
 * Dedicated /profile-reports landing page — overrides the [section]/page.tsx
 * catch-all so we can put a lookup-first hero above the jurisdictional
 * grid. Anyone landing here is high-intent (a bank / FINTRAC / QBO /
 * accountant asked them for the report) — the goal is to convert the
 * search intent into an order before they bounce.
 *
 * Psychology: use-case anchoring in the headline ("Your bank asked?"),
 * one massive search bar (Fitts's law), price + speed shown *with* the
 * value stack so the $49 lands as anchored, not as sticker-shock.
 */

export const metadata: Metadata = {
  title:       "Corporate Profile Report — $49 All-In, PDF in 1 Hour | CRS",
  description: "Search your Canadian corporation and order its official Corporate Profile Report. $49 all-in, government fee included, delivered by email in one business hour. FINTRAC / QuickBooks / bank-accepted.",
  alternates:  { canonical: "/profile-reports" },
};

const FAQ = [
  {
    q: "What is a Corporate Profile Report?",
    a: "A Corporate Profile Report is the official government record of a Canadian corporation, pulled directly from the relevant Provincial or Federal Corporate Registry. It shows the corporation's current status, registered office address, communication address, directors, shareholders (where recorded), agent for service, and the last document filed. It's the document banks, FINTRAC, QuickBooks Online, CRA, and lawyers accept as proof that a corporation exists and is in good standing.",
  },
  {
    q: "Does the report show the corporation's history?",
    a: "No — a Corporate Profile Report shows the current registry record only. Previous directors, historical addresses, past name changes, share transfers, and old filings are not included. If you need the complete historical record (usually for bank due diligence, share purchases, CRA audits, or legal proceedings), order a corporate Minute Book instead.",
  },
  {
    q: "How fast will I receive it?",
    a: "For most jurisdictions, the PDF is delivered by email within one business hour of your order. For jurisdictions with slower government portals, delivery is within one business day. The confirmation email tells you which applies to your corporation.",
  },
  {
    q: "Do you charge extra for the government fee?",
    a: "No. $49 + GST is the total all-in price. The government registry fee is included in that number — there's no separate line item at checkout and no upsell.",
  },
  {
    q: "Which use cases is this accepted for?",
    a: "Corporate Profile Reports issued directly from government registries are accepted by every major Canadian bank, FINTRAC-regulated entities, QuickBooks Online (payroll, Payments, FINTRAC verification), the CRA for corporate identity confirmation, lawyers for due diligence, and provincial regulators.",
  },
];

const TRUST_CHIPS = [
  { icon: CheckCircle2, text: "$49 all-in + GST"    },
  { icon: Clock,        text: "PDF in 1 business hour" },
  { icon: ShieldCheck,  text: "FINTRAC-ready"       },
  { icon: Landmark,     text: "Government-issued"   },
  { icon: CheckCircle2, text: "QuickBooks-accepted" },
];

export default function ProfileReportsLandingPage() {
  const pages = listSection("profile-reports");
  const breadcrumb = breadcrumbLd([
    { name: "Home",                    url: "/" },
    { name: "Corporate Profile Reports" },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(breadcrumb)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(faqLd(FAQ))} />
      <Header />
      <main style={{ flex: 1 }}>

        {/* ── Hero: use-case anchor + big search widget ── */}
        <section
          style={{
            background: "linear-gradient(160deg,#CBE2EF 0%,#DCE9F2 40%,#F1F5F8 100%)",
            borderBottom: "1px solid var(--border)",
            padding: "3.5rem 1.5rem 3rem",
          }}
        >
          <div style={{ maxWidth: "820px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <span
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: "0.72rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  color: "var(--gold)",
                  background: "rgba(196,158,90,0.14)",
                  padding: "0.35rem 0.8rem",
                  borderRadius: "999px",
                  fontWeight: 700,
                  display: "inline-block",
                  marginBottom: "1.15rem",
                }}
              >
                Official Corporate Profile Report · $49 all-in
              </span>

              <h1
                style={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  fontSize: "clamp(1.85rem, 4vw, 2.75rem)",
                  fontWeight: 700,
                  lineHeight: 1.15,
                  color: "var(--text)",
                  marginBottom: "0.85rem",
                }}
              >
                Your bank, FINTRAC, or QuickBooks asked for your Corporate Profile Report?
              </h1>
              <p
                style={{
                  fontSize: "1.05rem",
                  color: "var(--text-muted)",
                  lineHeight: 1.55,
                  maxWidth: "660px",
                  margin: "0 auto",
                }}
              >
                Search your Canadian corporation below and order its official Corporate Profile Report — <strong style={{ color: "var(--text)" }}>pulled directly from the relevant Provincial or Federal Corporate Registry</strong>. Delivered to your email in one business hour. $49 all-in, government fee included.
              </p>
            </div>

            {/* Big lookup widget — the whole hero funnels to this. */}
            <InlineLookupOrder
              service="profile-report"
              provinceKey={null}
              srcTag="landing-profile-reports-hero"
            />

            {/* Trust chips — placed after the search so they're the first thing
                the visitor sees while their eyes drift down from typing. */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "0.5rem 1rem",
                marginTop: "1.5rem",
              }}
            >
              {TRUST_CHIPS.map(({ icon: Icon, text }) => (
                <span
                  key={text}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    fontSize: "0.82rem",
                    color: "var(--text)",
                    background: "rgba(255,255,255,0.65)",
                    padding: "0.35rem 0.75rem",
                    borderRadius: "999px",
                    border: "1px solid rgba(0,61,91,0.1)",
                    fontWeight: 600,
                  }}
                >
                  <Icon size={13} style={{ color: "#16A34A", flexShrink: 0 }} /> {text}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Social proof / who uses it (compact) ── */}
        <section style={{ padding: "2.25rem 1.5rem 1rem", background: "var(--bg)" }}>
          <div style={{ maxWidth: "820px", margin: "0 auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "1rem",
              }}
            >
              {[
                { title: "For FINTRAC verification",  body: "The exact document your compliance officer needs to prove corporate identity." },
                { title: "For QuickBooks Online",      body: "Accepted by Intuit for payroll, Payments, and FINTRAC verification." },
                { title: "For your bank",              body: "Every major Canadian bank accepts the government-issued report for account opening." },
                { title: "For CRA + audits",           body: "Confirms your corporation's legal status in tax filings and audits." },
              ].map((c) => (
                <div
                  key={c.title}
                  style={{
                    padding: "0.85rem 1rem",
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderLeft: "3px solid var(--gold)",
                    borderRadius: "0.5rem",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text)", marginBottom: "0.25rem" }}>
                    {c.title}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                    {c.body}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── What's included + scope-caveat routing to /minute-books ── */}
        <section style={{ padding: "2.5rem 1.5rem 1rem", background: "var(--bg)" }}>
          <div style={{ maxWidth: "820px", margin: "0 auto" }}>
            <h2
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "var(--text)",
                marginBottom: "0.4rem",
              }}
            >
              What&rsquo;s in your Corporate Profile Report
            </h2>
            <p style={{ fontSize: "0.92rem", color: "var(--text-muted)", marginBottom: "1.25rem", lineHeight: 1.55 }}>
              The report is the current registry record — everything the government knows about the corporation right now, on one PDF, sealed and dated by the registry that issued it.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                gap: "0.6rem",
              }}
            >
              {[
                { icon: CheckCircle2, title: "Current status of the corporation",  body: "Active, in default, dissolved, amalgamated, or struck." },
                { icon: Building2,    title: "Registered office address",           body: "The legal address on file with the registry." },
                { icon: Mail,         title: "Communication / mailing address",     body: "Where the registry sends correspondence." },
                { icon: Users,        title: "Directors",                            body: "Full legal names and addresses of every sitting director." },
                { icon: UserCheck,    title: "Shareholders (where recorded)",       body: "Registered shareholders — where the registry captures them." },
                { icon: UserCheck,    title: "Agent for service",                    body: "The individual or firm authorised to accept legal notice for the corporation." },
                { icon: Landmark,     title: "Incorporation details",                body: "Business number, incorporation date, jurisdiction, and current legal name." },
                { icon: CheckCircle2, title: "Last document filed",                  body: "The most recent registry filing — annual return, articles amendment, address change, etc." },
              ].map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  style={{
                    padding: "0.85rem 1rem",
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    display: "flex",
                    gap: "0.55rem",
                    alignItems: "flex-start",
                  }}
                >
                  <Icon size={16} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.15rem" }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text)", marginBottom: "0.15rem" }}>{title}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.5 }}>{body}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Scope caveat — visitors who actually need historical filings
                (banks doing deep due diligence, buyers, lawyers preparing
                litigation) are the wrong audience for a $49 profile report.
                Route them to the minute-book service before they buy the
                wrong thing and refund-request. */}
            <div
              style={{
                marginTop: "1.5rem",
                padding: "1.15rem 1.4rem",
                background: "linear-gradient(135deg, rgba(196,158,90,0.09) 0%, rgba(196,158,90,0.03) 100%)",
                border: "1px solid rgba(196,158,90,0.4)",
                borderLeft: "4px solid var(--gold)",
                borderRadius: "0.55rem",
                display: "flex",
                gap: "0.85rem",
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <AlertCircle size={20} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.15rem" }} />
              <div style={{ minWidth: 0, flex: "1 1 320px" }}>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.35rem" }}>
                  Need the corporation&rsquo;s full history?
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--text)", margin: 0, lineHeight: 1.55 }}>
                  A Corporate Profile Report shows the <strong>current state only</strong> — not prior directors, previous addresses, past name changes, share transfers, or historical filings. For the complete historical record (required for bank due diligence, share purchases, CRA audits, and legal proceedings), order a corporate <strong>Minute Book</strong>.
                </p>
              </div>
              <a
                href="/minute-books"
                style={{
                  flex: "0 0 auto",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.65rem 1.15rem",
                  background: "var(--primary)",
                  color: "#FFFFFF",
                  textDecoration: "none",
                  borderRadius: "0.45rem",
                  fontSize: "0.88rem",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                <BookOpen size={14} /> Order a Minute Book <ArrowRight size={13} />
              </a>
            </div>
          </div>
        </section>

        {/* ── Jurisdiction fallback grid — SEO + "I already know my province" path ── */}
        <section style={{ padding: "2.5rem 1.5rem 4rem", background: "var(--bg)" }}>
          <div style={{ maxWidth: "820px", margin: "0 auto" }}>
            <div style={{ marginBottom: "1.5rem" }}>
              <h2
                style={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  fontSize: "1.4rem",
                  fontWeight: 700,
                  color: "var(--text)",
                  marginBottom: "0.4rem",
                }}
              >
                Or pick your jurisdiction
              </h2>
              <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", margin: 0 }}>
                Guides for each Canadian jurisdiction — federal, all 10 provinces, and 3 territories.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: "0.6rem",
              }}
            >
              {pages.map((p) => (
                <a key={p.slug} href={`/${p.section}/${p.slug}`} className="section-card">
                  {p.title}
                  <ArrowRight size={13} style={{ color: "var(--gold)", flexShrink: 0 }} />
                </a>
              ))}
            </div>

            {/* Secondary search prompt at the bottom — for anyone who scrolled
                past the top widget without engaging. */}
            <div
              style={{
                marginTop: "2.5rem",
                padding: "1.25rem 1.5rem",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderLeft: "3px solid var(--secondary)",
                borderRadius: "0.5rem",
                display: "flex",
                gap: "1rem",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <Search size={22} style={{ color: "var(--secondary)", flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.15rem" }}>
                  Ready to order?
                </div>
                <div style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                  Jump back up to the search bar and find your corporation — $49 all-in, PDF in 1 business hour.
                </div>
              </div>
              <a
                href="#top"
                style={{
                  padding: "0.55rem 1rem",
                  background: "var(--primary)",
                  color: "#FFFFFF",
                  textDecoration: "none",
                  borderRadius: "0.4rem",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                Search now <ArrowRight size={13} />
              </a>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section style={{ padding: "1rem 1.5rem 4rem", background: "var(--bg)" }}>
          <div style={{ maxWidth: "820px", margin: "0 auto" }}>
            <h2
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "1.4rem",
                fontWeight: 700,
                color: "var(--text)",
                marginTop: "1.5rem",
                marginBottom: "1rem",
              }}
            >
              Frequently asked questions
            </h2>
            {FAQ.map((item) => (
              <div key={item.q} style={{ marginBottom: "1.2rem" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.35rem" }}>{item.q}</h3>
                <p style={{ fontSize: "0.92rem", color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>{item.a}</p>
              </div>
            ))}
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}
