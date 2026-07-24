import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AvailabilityCheckIsland from "./AvailabilityCheckIsland";
import { breadcrumbLd, faqLd, jsonLdScript } from "@/lib/structured-data";

/**
 * /incorporation/instant-availability-check
 *
 * Free "Instant Availability Check" — a permissive name-check across
 * federal + BC + Alberta live registries, above the paid NUANS report.
 * Green result → encourage fast reservation via the NUANS CTA. Weak
 * result → warn, but let the visitor still order the paid NUANS if
 * they want.
 *
 * The paid conversion path is a CTA to /order/nuans-search with the
 * name prefilled — reuses the existing NUANS order wizard.
 */

export const metadata: Metadata = {
  title:       "Instant Corporate Name Availability Check — Canada | CRS",
  description: "Free instant check across federal + BC + Alberta registries. See how many corporations use a similar name before ordering the full NUANS report.",
  alternates:  { canonical: "/incorporation/instant-availability-check" },
};

const FAQ = [
  {
    q: "What does the Instant Availability Check actually check?",
    a: "It searches the federal (Corporations Canada) live registry plus British Columbia and Alberta provincial registries for corporations with a similar distinctive name to what you're proposing. Coverage is limited to registries with public real-time APIs — the paid NUANS report covers all 13 provinces and territories plus phonetic/trademark-adjacent variations, which the instant check does not.",
  },
  {
    q: "How is this different from a real NUANS report?",
    a: "A real NUANS report is a federal government service that performs a rigorous cross-Canada search — exact matches, phonetic similarity, translations, trademark conflicts, and reserved names — and produces a report accepted by every Canadian corporate registry for incorporation and name-change filings. The Instant Availability Check is a courtesy pre-check with more limited coverage, designed to catch obvious conflicts before you commit to the paid NUANS. If the instant check comes back green, ordering the paid NUANS is the natural next step to confirm.",
  },
  {
    q: "Why do you show a 'weak' warning at 5+ matches?",
    a: "Corporate registries typically reject proposed names that are too similar to existing corporations — even in different provinces. Five or more matches on the distinctive portion of your name is a strong signal that a real NUANS report will surface conflicts and that your incorporation filing may be refused. You can still order the paid NUANS to get a definitive answer, but factor the rejection risk into your name shortlist.",
  },
  {
    q: "Is the instant check free?",
    a: "Yes. The instant check is a courtesy service to help you decide whether to invest in the paid NUANS report. No email required, no account needed. The paid NUANS report is $79 all-in + GST, delivered by email within one business hour.",
  },
  {
    q: "If the check is green, can I incorporate right away?",
    a: "The instant check is not a substitute for the official NUANS report — every federal and provincial registry requires the NUANS to accept an incorporation filing. A green instant check is a good signal that the paid NUANS will likely come back clean, and it lets you move to reserve the name quickly. Consider it a fast pre-flight check, not a landing clearance.",
  },
];

export default function InstantAvailabilityCheckPage() {
  const breadcrumb = breadcrumbLd([
    { name: "Home",                     url: "/" },
    { name: "Incorporation",            url: "/incorporation" },
    { name: "Instant Availability Check" },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(breadcrumb)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(faqLd(FAQ))} />
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <div style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-deep)" }}>
          <div style={{ maxWidth: "860px", margin: "0 auto", padding: "0.75rem 1.5rem", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
            <a href="/" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Home</a>
            <span>/</span>
            <a href="/incorporation" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Incorporation</a>
            <span>/</span>
            <span style={{ color: "var(--text)" }}>Instant Availability Check</span>
          </div>
        </div>

        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2.5rem 1.5rem 1rem" }}>
          <span className="category-chip" style={{ display: "inline-block", marginBottom: "0.75rem" }}>
            Free · No email required
          </span>
          <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 700, lineHeight: 1.2, color: "var(--text)", marginBottom: "0.6rem" }}>
            Instant Corporate Name Availability Check
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            Check how many Canadian corporations already use a similar name — free, instant, across federal + BC + Alberta live registries. Green means you can move fast to reserve; weak means the paid NUANS report will probably surface conflicts.
          </p>
        </div>

        <Suspense
          fallback={
            <div style={{ maxWidth: 860, margin: "0 auto", padding: "2rem 1.5rem", color: "var(--text-muted)" }}>
              Loading form…
            </div>
          }
        >
          <AvailabilityCheckIsland />
        </Suspense>

        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "1.5rem 1.5rem 4rem" }}>
          <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.4rem", fontWeight: 700, color: "var(--text)", marginTop: "3rem", marginBottom: "1rem" }}>
            Frequently asked questions
          </h2>
          {FAQ.map((item) => (
            <div key={item.q} style={{ marginBottom: "1.2rem" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.35rem" }}>{item.q}</h3>
              <p style={{ fontSize: "0.92rem", color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>{item.a}</p>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
