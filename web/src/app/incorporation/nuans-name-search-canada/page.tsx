import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AvailabilityCheckIsland from "./AvailabilityCheckIsland";
import { breadcrumbLd, faqLd, jsonLdScript } from "@/lib/structured-data";

/**
 * /incorporation/nuans-name-search-canada
 *
 * Free "Instant Availability Check" — a permissive name-check across
 * federal + BC + Alberta live registries, above the paid NUANS report.
 * Green result → encourage fast reservation via the NUANS CTA. Weak
 * result → warn, but let the visitor still order the paid NUANS if
 * they want.
 *
 * The paid conversion path is a CTA to /order/nuans-search with the
 * name prefilled — reuses the existing NUANS order wizard.
 *
 * SEO-tuned to the NUANS + name-search query cluster identified in GSC
 * over the trailing 3 months: "nuans name canada" (9 imp), "how to read
 * a nuans report" (7 imp), "free nuans search" cluster (9 imp combined),
 * "how long is a nuans report good for" (4 imp), plus informational
 * queries like "what is nuans" and "nuans meaning".
 */

export const metadata: Metadata = {
  title:       "Free NUANS Name Search Canada | Instant Availability | CRS",
  description: "Free instant availability check across Canadian corporate registries. Order the official $79 NUANS report from the same page. No email required for the check.",
  alternates:  { canonical: "/incorporation/nuans-name-search-canada" },
  keywords:    ["NUANS name search", "NUANS report Canada", "free NUANS search", "Canadian corporate name check", "NUANS name reservation", "how to read NUANS report", "NUANS Canada meaning"],
};

const FAQ = [
  {
    q: "What does NUANS stand for?",
    a: "NUANS is the Newly Updated Automated Name Search — the federal name-search system operated by Innovation, Science and Economic Development Canada (ISED). It checks a proposed corporation name against every corporate registry in Canada (federal + all 13 provinces and territories), the federal trademarks database, and phonetically/orthographically similar variations. A NUANS report is required by Corporations Canada for federal (CBCA) incorporation, cross-provincial extra-provincial registration, and most corporate name changes.",
  },
  {
    q: "How is the free Instant Availability Check different from a real NUANS report?",
    a: "The free check queries live public registries for federal (Corporations Canada) plus British Columbia and Alberta — the three jurisdictions with real-time public APIs. It matches on the distinctive portion of the name and flags exact/substring overlaps. The paid NUANS report, by contrast, searches all 13 provinces and territories, adds registered trademarks, and performs phonetic + orthographic + translation similarity checks — the full search that federal and provincial registrars actually accept for incorporation filings.",
  },
  {
    q: "How long is a NUANS report valid?",
    a: "A NUANS report is valid for 90 days from the date of issue. Within that 90-day window, the reserved name is effectively held for the applicant against federal filings — but that reservation is not a guarantee against another party's filing that happens to slip through the phonetic search rules. Best practice is to file your incorporation within a few weeks of getting the NUANS, not to wait the full 90 days.",
  },
  {
    q: "How much does a NUANS report cost through CRS?",
    a: "$79 all-in + GST. That price includes the official NUANS search, the government fee, and CRS's preparation and delivery. Delivered by email within one business hour. If your first-choice name comes back with hard conflicts, we run the same NUANS with a backup name you provide, at no extra charge.",
  },
  {
    q: "How long does it take to get a NUANS report?",
    a: "CRS delivers the NUANS report by email within one business hour of your order. The underlying NUANS search itself is near-instant on ISED's system — the hour buffer covers submission, quality review, and packaging. If you order outside standard business hours, expect delivery the next business morning.",
  },
  {
    q: "How do I read a NUANS report?",
    a: "A NUANS report lists corporations and trademarks with names similar to your requested name, grouped by similarity type: exact matches, phonetically similar, orthographically similar, and translations. Each entry shows the jurisdiction, corporation number, current status, and address. Registrars use the report to decide whether to accept your incorporation name — an exact match in another Canadian jurisdiction is usually fatal; a distant phonetic match is usually fine. If the report has close matches you're unsure about, book a free consultation and we'll walk through it with you.",
  },
  {
    q: "Do I need a NUANS report for provincial incorporation?",
    a: "Depends on the province. Federal (CBCA), Alberta, Manitoba, New Brunswick, Nova Scotia, Newfoundland, and Yukon all require a NUANS for named incorporations. British Columbia, Ontario, and Quebec use their own provincial name-reservation systems (though a NUANS is still recommended for cross-Canada name protection). Saskatchewan requires a Corporate Name Search that fetches similar data. If you're doing a numbered corporation instead of a named one, no NUANS is needed anywhere.",
  },
  {
    q: "Why do you show a 'weak' warning at 5+ similar names?",
    a: "Corporate registries typically reject proposed names that are too similar to existing corporations — even in different provinces. Five or more matches on the distinctive portion of your name is a strong signal that a real NUANS report will surface conflicts and that your incorporation filing may be refused. You can still order the paid NUANS to get a definitive answer, but factor the rejection risk into your name shortlist. A safer approach: try a more distinctive variant (add a geographic or industry qualifier) and re-run the free check.",
  },
  {
    q: "Can I reserve a corporate name in Canada without incorporating right away?",
    a: "Yes. A NUANS report itself acts as a soft reservation for 90 days at the federal level (Corporations Canada honours the reserved name during that period). Provincial name reservations vary — BC and Ontario let you reserve for up to 56 days through their online registries. If you're not ready to incorporate immediately, a NUANS gives you the runway to organize directors, share structure, and other formation details without losing the name.",
  },
  {
    q: "If the free check is green, can I incorporate right away?",
    a: "The instant check is a good pre-flight signal but is not a substitute for the official NUANS report — every federal and provincial registrar requires the NUANS to accept an incorporation filing. A green instant check tells you the paid NUANS is very likely to come back clean, and it lets you move to reserve the name quickly. Consider it a fast pre-flight check, not landing clearance.",
  },
];

export default function NuansNameSearchCanadaPage() {
  const breadcrumb = breadcrumbLd([
    { name: "Home",                     url: "/" },
    { name: "Incorporation",            url: "/incorporation" },
    { name: "Free NUANS Name Search" },
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
            <span style={{ color: "var(--text)" }}>Free NUANS Name Search</span>
          </div>
        </div>

        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2.5rem 1.5rem 1rem" }}>
          <span className="category-chip" style={{ display: "inline-block", marginBottom: "0.75rem" }}>
            Free · No email required
          </span>
          <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 700, lineHeight: 1.2, color: "var(--text)", marginBottom: "0.6rem" }}>
            Free NUANS Name Search: Instant Availability Check for Canadian Corporations
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            Check how many Canadian corporations already use a similar name — free, instant, across federal + BC + Alberta live registries. Green means you can move fast to reserve the name via the paid NUANS report. Weak means the official NUANS will probably surface conflicts and your incorporation filing may be refused.
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

        {/* ═══ Educational body content (SEO-targeted) ═══ */}
        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2rem 1.5rem 0" }}>

          <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.55rem", fontWeight: 700, color: "var(--text)", marginTop: "2rem", marginBottom: "0.75rem" }}>
            What is a NUANS report?
          </h2>
          <p style={{ fontSize: "0.95rem", color: "var(--text)", lineHeight: 1.65, marginBottom: "1rem" }}>
            <strong>NUANS</strong> stands for <em>Newly Updated Automated Name Search</em>. It&apos;s the federal name-search system operated by Innovation, Science and Economic Development Canada (ISED) and is the authoritative Canadian corporate name search. A NUANS report scans every corporate registry in Canada — federal (Corporations Canada) plus all 13 provinces and territories — plus the federal trademarks database, and it flags similar names by exact match, phonetic similarity, orthographic (spelling) similarity, and translation.
          </p>
          <p style={{ fontSize: "0.95rem", color: "var(--text)", lineHeight: 1.65, marginBottom: "1rem" }}>
            The NUANS report is required by Corporations Canada for federal (CBCA) incorporation, cross-provincial extra-provincial registration, and most corporate name changes. Provincial registrars (Alberta, Nova Scotia, Manitoba, New Brunswick, Newfoundland, Yukon) also require or accept a NUANS. Ordering a NUANS is the first step in almost every named corporate filing in Canada.
          </p>

          <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.55rem", fontWeight: 700, color: "var(--text)", marginTop: "2rem", marginBottom: "0.75rem" }}>
            Why do a free NUANS pre-check first?
          </h2>
          <p style={{ fontSize: "0.95rem", color: "var(--text)", lineHeight: 1.65, marginBottom: "1rem" }}>
            The paid NUANS report is $79 all-in + GST. That&apos;s reasonable when your proposed name is genuinely available — but when the name is obviously taken (a common corporation already exists with the same distinctive words), you&apos;ve paid $79 for a report that will only tell you to pick a different name. The free Instant Availability Check surfaces the obvious cases before you commit, so you can iterate on the name for free and only order the paid NUANS once the name looks likely to pass.
          </p>
          <p style={{ fontSize: "0.95rem", color: "var(--text)", lineHeight: 1.65, marginBottom: "1rem" }}>
            The free check is intentionally more permissive than a real NUANS (it doesn&apos;t do phonetics or trademark search), so a clean free check is not a guarantee — but a dirty free check is a very reliable &quot;don&apos;t waste $79&quot; signal.
          </p>

          <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.55rem", fontWeight: 700, color: "var(--text)", marginTop: "2rem", marginBottom: "0.75rem" }}>
            Free instant check vs. paid NUANS report
          </h2>
          <div style={{ overflowX: "auto", marginBottom: "1rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "var(--bg-deep)", borderBottom: "2px solid var(--border)" }}>
                  <th style={cellStyle}>What&apos;s checked</th>
                  <th style={cellStyle}>Free instant check</th>
                  <th style={cellStyle}>Paid NUANS report ($79)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Federal corporations (Corporations Canada)", "✓", "✓"],
                  ["British Columbia registry",                   "✓", "✓"],
                  ["Alberta registry",                            "✓", "✓"],
                  ["Ontario, Quebec, NS, NB, PE, MB, SK, NL, YT, NT, NU", "✗", "✓"],
                  ["Federal trademarks database",                 "✗", "✓"],
                  ["Phonetic similarity",                         "✗", "✓"],
                  ["Orthographic similarity",                     "✗", "✓"],
                  ["Translations",                                "✗", "✓"],
                  ["Accepted by federal/provincial registrars",   "✗", "✓"],
                  ["Reserves the name for 90 days",               "✗", "✓"],
                ].map(([field, freeCol, paidCol]) => (
                  <tr key={field} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={cellStyle}>{field}</td>
                    <td style={{ ...cellStyle, textAlign: "center", color: freeCol === "✓" ? "#16A34A" : "var(--text-muted)" }}>{freeCol}</td>
                    <td style={{ ...cellStyle, textAlign: "center", color: "#16A34A" }}>{paidCol}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.55rem", fontWeight: 700, color: "var(--text)", marginTop: "2rem", marginBottom: "0.75rem" }}>
            How long is a NUANS report valid?
          </h2>
          <p style={{ fontSize: "0.95rem", color: "var(--text)", lineHeight: 1.65, marginBottom: "1rem" }}>
            A NUANS report is valid for <strong>90 days</strong> from the date of issue. During that window, the reserved name is effectively held for the applicant against federal filings. Best practice is to file your incorporation within a few weeks of getting the NUANS — waiting the full 90 days is legal but increases the small chance that a similar name gets filed elsewhere in the meantime. If your report expires before you incorporate, you&apos;ll need to order a fresh NUANS.
          </p>

          <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.55rem", fontWeight: 700, color: "var(--text)", marginTop: "2rem", marginBottom: "0.75rem" }}>
            How to read a NUANS report
          </h2>
          <p style={{ fontSize: "0.95rem", color: "var(--text)", lineHeight: 1.65, marginBottom: "1rem" }}>
            A NUANS report lists corporations and trademarks with names similar to your requested name, grouped by similarity type: exact matches, phonetically similar names, orthographically similar names, and translations. Each entry shows the jurisdiction, corporation number, current status (active / dissolved), and address. Registrars use the report to decide whether to accept your incorporation name.
          </p>
          <p style={{ fontSize: "0.95rem", color: "var(--text)", lineHeight: 1.65, marginBottom: "1rem" }}>
            The general rule: an <strong>exact match</strong> in any Canadian jurisdiction (even a different province) is usually fatal to your filing. A <strong>close phonetic match</strong> in the same industry is usually fatal too. A <strong>distant phonetic match</strong> in an unrelated industry is usually fine. If the report has close matches you&apos;re unsure about, <a href="/incorporation/book-free-consultation" style={{ color: "var(--secondary)" }}>book a free consultation</a> and we&apos;ll walk through it with you.
          </p>

          <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.55rem", fontWeight: 700, color: "var(--text)", marginTop: "2rem", marginBottom: "0.75rem" }}>
            Distinctive vs. descriptive elements
          </h2>
          <p style={{ fontSize: "0.95rem", color: "var(--text)", lineHeight: 1.65, marginBottom: "1rem" }}>
            A corporate name has three components: the <strong>distinctive element</strong> (the unique brand word — &ldquo;Acme&rdquo;), the <strong>descriptive element</strong> (what the business does — &ldquo;Consulting Services&rdquo;), and the <strong>legal element</strong> (Inc., Ltd., Corp., ULC). Registrars care mostly about the distinctive element when checking availability. Both the free instant check and the paid NUANS normalize the descriptive and legal elements out before matching — which is why &ldquo;Acme Consulting Inc.&rdquo; and &ldquo;Acme Corporation&rdquo; would both flag as conflicts with each other, even though the exact strings differ.
          </p>

          <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.55rem", fontWeight: 700, color: "var(--text)", marginTop: "2rem", marginBottom: "0.75rem" }}>
            Provincial NUANS specifics
          </h2>
          <p style={{ fontSize: "0.95rem", color: "var(--text)", lineHeight: 1.65, marginBottom: "1rem" }}>
            The federal NUANS report is accepted almost everywhere, but a few provinces run their own alternatives that either replace or supplement it:
          </p>
          <ul style={{ fontSize: "0.9rem", color: "var(--text)", lineHeight: 1.7, marginBottom: "1rem", paddingLeft: "1.5rem" }}>
            <li><strong>NUANS Name Search BC</strong> — BC uses its own <em>BC Name Reservation</em> for provincial incorporation, but a NUANS is still recommended for cross-Canada name protection.</li>
            <li><strong>Ontario NUANS Name Search</strong> — Ontario incorporation uses an Ontario-Biased NUANS (a NUANS variant that includes Ontario-specific fields) available through the same order.</li>
            <li><strong>Alberta NUANS Search</strong> — Alberta accepts the standard federal NUANS report; no separate Alberta variant needed.</li>
            <li><strong>Quebec</strong> — Quebec uses its own <em>Registraire des entreprises</em> name reservation, but a NUANS is required for extra-provincial registration in Quebec.</li>
          </ul>

          <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.55rem", fontWeight: 700, color: "var(--text)", marginTop: "2rem", marginBottom: "0.75rem" }}>
            Related services
          </h2>
          <ul style={{ fontSize: "0.9rem", color: "var(--text)", lineHeight: 1.7, marginBottom: "1rem", paddingLeft: "1.5rem" }}>
            <li><a href="/order/nuans-search" style={{ color: "var(--secondary)" }}>Order a full NUANS name search report</a> — $79 all-in + GST, delivered within one business hour</li>
            <li><a href="/incorporation/canada-federal-incorporation-service" style={{ color: "var(--secondary)" }}>Federal (CBCA) incorporation service</a> — $699 all-in, NUANS + Articles + minute book</li>
            <li><a href="/incorporation" style={{ color: "var(--secondary)" }}>Provincial incorporation services</a> — all 13 provinces and territories, $699 all-in</li>
            <li><a href="/guides/federal-vs-provincial-incorporation-canada" style={{ color: "var(--secondary)" }}>Federal vs. provincial incorporation in Canada</a> — decision guide</li>
            <li><a href="/incorporation/book-free-consultation" style={{ color: "var(--secondary)" }}>Book a free 15-min consultation</a> — walk through the name and jurisdiction with a specialist</li>
          </ul>
        </div>

        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "1.5rem 1.5rem 4rem" }}>
          <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.55rem", fontWeight: 700, color: "var(--text)", marginTop: "3rem", marginBottom: "1rem" }}>
            Frequently asked questions about NUANS
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

const cellStyle: React.CSSProperties = {
  padding: "0.5rem 0.75rem",
  textAlign: "left",
  color: "var(--text)",
  borderBottom: "1px solid var(--border)",
};
