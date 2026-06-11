import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CompanySearch from "@/components/CompanySearch";

export const metadata: Metadata = {
  title: "Search Canadian Business Registries — CRS",
  description:
    "Search official Canadian corporate registries by company name, registration number, or business number. Live BC registry search — more provinces coming soon.",
};

export default function CompanySearchPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1 }}>
        {/* Hero */}
        <section
          style={{
            borderBottom: "1px solid var(--border)",
            background: "linear-gradient(160deg, #CBE2EF 0%, #DCE9F2 40%, #F1F5F8 100%)",
            padding: "3.5rem 1.5rem 3rem",
          }}
        >
          <div style={{ maxWidth: "760px", margin: "0 auto" }}>
            <span
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--gold)",
                display: "block",
                marginBottom: "1rem",
              }}
            >
              Canadian Corporate Registry Search
            </span>
            <h1
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "clamp(1.75rem, 3.5vw, 2.5rem)",
                fontWeight: 700,
                lineHeight: 1.15,
                color: "var(--text)",
                marginBottom: "1rem",
              }}
            >
              Find businesses within Canada
            </h1>
            <div className="gold-line" style={{ marginBottom: "1rem" }} />
            <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", lineHeight: 1.7, maxWidth: "52ch" }}>
              Search official government registries by company name, registration number, or business
              number. British Columbia is live — more provinces connecting soon.
            </p>
          </div>
        </section>

        {/* Search */}
        <section style={{ maxWidth: "760px", margin: "0 auto", padding: "2.5rem 1.5rem 5rem" }}>
          <CompanySearch />
        </section>
      </main>
      <Footer />
    </>
  );
}
