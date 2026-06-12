import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CompanySearch from "@/components/CompanySearch";

export const metadata: Metadata = {
  title: "Canada Corporations Search — Search Canadian Business Registries | CRS",
  description:
    "Free Canada corporations search. Find any business registered in Alberta, British Columbia, Manitoba, Nova Scotia, Ontario, Québec, Saskatchewan, or federal — by company name or registration number.",
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
    title: "Canada Corporations Search | CRS",
    description:
      "Search Canadian business registries — Alberta, BC, Ontario, federal, and more — by company name or registration number.",
    type: "website",
  },
};

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

export default function CanadaCorporationsSearchPage() {
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
              Canada Corporations Search
            </h1>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              Search Canadian business registries by name or registration number
            </span>
          </div>
        </div>

        {/* Search + results */}
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "1.75rem 1.5rem 4rem" }}>
          <CompanySearch />

          {/* Source info */}
          <div
            style={{
              marginTop: "3rem",
              borderTop: "1px solid var(--border)",
              paddingTop: "1.5rem",
            }}
          >
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.75, marginBottom: "0.875rem" }}>
              This free service helps you find information on businesses in Canada. Our information is provided by the
              publicly available official business registries of:
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
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "1rem", lineHeight: 1.65 }}>
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
