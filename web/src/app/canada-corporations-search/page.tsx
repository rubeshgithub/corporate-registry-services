import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CompanySearch from "@/components/CompanySearch";
import { getPrices } from "@/lib/pricing";

/* Statically generated, but the service card quotes live prices — revalidate
   so an admin price change reaches the page within a minute instead of
   waiting for the next deploy. Checkout is already correct immediately. */
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Canada Business Search — Free Lookup by Name or Number | CRS",
  description:
    "Free Canada business search: look up a company by name or registration number across Alberta, BC, Ontario, Québec, Manitoba, Saskatchewan, NS and federal.",
  keywords: [
    "Canada corporations search",
    "Canadian business registry search",
    "search Canadian companies",
    "corporation search Canada",
    "Alberta corporation search",
    "BC company search",
    "Ontario business registry",
    "federal corporation Canada",
    "Corporations Canada search",
  ],
  openGraph: {
    title: "Canada Business Search — Free Company Lookup | CRS",
    description:
      "Search Canadian business registries — Alberta, BC, Ontario, federal, and more — by company name or registration number.",
    type: "website",
  },
};

/* Shared type scale for the explanatory copy below the widget. Section
   headings stay on the display serif to match the page H1; body copy matches
   the muted 0.875rem the source note already used. */
const H2: CSSProperties = {
  fontFamily: "var(--font-display), Georgia, serif",
  fontSize:   "1.05rem",
  fontWeight: 700,
  color:      "var(--text)",
  margin:     "1.9rem 0 0.6rem",
};

const P: CSSProperties = {
  fontSize:   "0.875rem",
  color:      "var(--text-muted)",
  lineHeight: 1.75,
  margin:     "0 0 0.85rem",
};

/* The registries this search actually reaches. Deliberately does NOT list
   New Brunswick, Newfoundland and Labrador, or the territories: the federal
   Canada Business Registries data holds no records for them (sampled across a
   dozen generic terms — only ON, AB, QC, CC, MB, BC, SK, NS come back), so
   claiming them here would be the same overclaim the province dropdown used
   to make. Those jurisdictions are handled by the manual lookup offer below. */
const REGISTRIES = [
  "Alberta",
  "British Columbia",
  "Manitoba",
  "Nova Scotia",
  "Ontario",
  "Québec",
  "Saskatchewan",
  "Corporations Canada",
];

export default async function CanadaCorporationsSearchPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1 }}>

        {/* Compact header strip */}
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-deep)",
            padding: "1.25rem 1.5rem",
          }}
        >
          <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", alignItems: "baseline", gap: "1rem", flexWrap: "wrap" }}>
            <h1
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "clamp(1.2rem, 2.5vw, 1.5rem)",
                fontWeight: 700,
                color: "var(--text)",
                margin: 0,
              }}
            >
              Canada Business Search
            </h1>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Look up a Canadian company by name or registration number — free
            </span>
          </div>
        </div>

        {/* Search + results */}
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "1.75rem 1.5rem 4rem" }}>
          <CompanySearch prices={await getPrices()} />

          {/* Source info */}
          <div
            style={{
              marginTop: "3rem",
              borderTop: "1px solid var(--border)",
              paddingTop: "1.5rem",
            }}
          >
            <h2 style={H2}>What this search covers</h2>
            <p style={P}>
              Canada has no single national corporate register. Each province and territory keeps its own, and
              Corporations Canada keeps a separate one for federally incorporated companies — so confirming that a
              business exists usually means knowing which registry to ask first. This search queries the publicly
              available official registries below in one place, by company name or by registration number:
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
              {REGISTRIES.map((name) => (
                <span
                  key={name}
                  style={{
                    display: "inline-block",
                    fontSize: "0.75rem",
                    fontFamily: "var(--font-mono), monospace",
                    color: "var(--text)",
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "9999px",
                    padding: "0.2rem 0.7rem",
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
            <h2 style={H2}>Searching by name or by number</h2>
            <p style={P}>
              Company names are matched loosely, so a partial name usually works — searching <em>rocky mountain</em>{" "}
              surfaces every registered name containing those words. Legal endings (Ltd., Limited, Inc., Corp.) are
              rarely worth typing: they often differ between the name on the register and the name a business
              actually trades under.
            </p>
            <p style={P}>
              Numbers are matched exactly. A provincial registration or incorporation number — a BC company number,
              an Alberta Corporate Access Number — identifies one specific company. A nine-digit CRA business number
              also works, but only the nine digits: the program suffix that follows it on tax correspondence, such as{" "}
              <em>RT0001</em> or <em>RC0001</em>, identifies a tax account rather than the corporation and will not
              match a registry record.
            </p>

            <h2 style={H2}>What the results tell you — and what they don&rsquo;t</h2>
            <p style={P}>
              Each result shows the registered name, the jurisdiction holding the record, that registry&rsquo;s own
              status for the company, and where published, the incorporation date. Status wording is not consistent
              between registries: what one records as <em>Active</em> another expresses as being in good standing,
              and a company that has stopped filing may appear as struck, dissolved, cancelled or simply inactive
              depending on who keeps the register.
            </p>
            <p style={P}>
              A search result is a pointer, not proof. It reflects what the registry had published when we queried
              it, and registries update on their own schedules. For anything that has to stand up — a financing
              condition, a purchase agreement, a due-diligence file — you need a document issued by the registry
              itself, such as a{" "}
              <a href="/profile-reports" style={{ color: "var(--gold)", textDecoration: "none" }}>corporate profile report</a>{" "}
              or a{" "}
              <a href="/good-standing" style={{ color: "var(--gold)", textDecoration: "none" }}>certificate of good standing</a>,
              rather than a screenshot of a search.
            </p>

            <h2 style={H2}>If a company doesn&rsquo;t appear</h2>
            <p style={P}>
              A blank result does not always mean the company doesn&rsquo;t exist. It may be registered in a
              jurisdiction this search doesn&rsquo;t reach — Newfoundland and Labrador, New Brunswick and the three
              territories keep registries that aren&rsquo;t part of the federal data we query, so a company
              registered only there will not be found here. It may also be registered under a legal name that
              differs from its operating name, or be a society, co-operative or not-for-profit, which several
              provinces hold in a register separate from their corporations.
            </p>
            <p style={P}>
              If you believe a corporation exists and this search can&rsquo;t find it, tell us the name and the
              province. We&rsquo;ll look it up by hand — including the registries above that aren&rsquo;t searchable
              here — and come back to you within one business day.
            </p>

            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "1.75rem", lineHeight: 1.65 }}>
              For complete details on data accuracy and limitations, see our{" "}
              <a href="/disclaimer" style={{ color: "var(--gold)", textDecoration: "none" }}>
                Disclaimer
              </a>
              .
            </p>
          </div>
        </div>

      </main>
      <Footer />
    </>
  );
}
