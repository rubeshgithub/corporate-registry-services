import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { listSection, SECTION_LABELS, type Section, SECTIONS } from "@/lib/content";
import { ArrowRight } from "lucide-react";

type Params = { section: string };

export function generateStaticParams(): Params[] {
  return SECTIONS.map((s) => ({ section: s }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { section } = await params;
  const label = SECTION_LABELS[section as Section];
  if (!label) return {};
  return {
    title: `${label} — CRS`,
    description: `${label} across all Canadian provinces, territories, and federal. Official government-direct service by CRS.`,
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

  return (
    <>
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
