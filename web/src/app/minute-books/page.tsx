import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  BookOpen, ShieldCheck, Clock, FileText, CheckCircle2,
  ArrowRight, Building2, AlertCircle, Users, Scale,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Corporate Minute Book Generator — CRS",
  description:
    "Generate a complete, legally compliant Canadian corporate minute book in minutes. Includes all organizational resolutions, share registers, certificates, and by-laws. All 13 jurisdictions.",
  keywords: [
    "corporate minute book Canada",
    "minute book generator",
    "Ontario minute book",
    "Alberta minute book",
    "BC minute book",
    "corporate records Canada",
    "minute book preparation",
  ],
};

const WHEN_NEEDED = [
  { icon: Building2,    title: "At Incorporation",       body: "Every corporation must establish its minute book at the time of incorporation. This is a legal requirement under federal and all provincial corporate statutes." },
  { icon: Scale,        title: "For Financing or Loans", body: "Banks and lenders require a current, complete minute book before approving business loans, lines of credit, or mortgages." },
  { icon: Users,        title: "Buying or Selling",      body: "Any share purchase or business sale triggers a due diligence review. The buyer's lawyer will examine every document in your minute book." },
  { icon: AlertCircle,  title: "CRA Audit",              body: "The Canada Revenue Agency can request corporate records at any time. An incomplete minute book can result in reassessments and penalties." },
  { icon: FileText,     title: "Adding Shareholders",    body: "Issuing or transferring shares requires resolutions, updated registers, and new share certificates — all part of the minute book." },
  { icon: ShieldCheck,  title: "Annual Compliance",      body: "Directors' and shareholders' resolutions must be recorded every year. Many corporations accumulate years of gaps that need to be reconstructed." },
];

const DOCUMENTS = [
  "Articles of Incorporation",
  "Corporate By-Laws",
  "Organizational Resolutions of Directors",
  "Organizational Resolutions of Shareholders",
  "Register of Directors",
  "Register of Officers",
  "Register of Shareholders",
  "Register of Share Transfers",
  "Share Subscription Agreement",
  "Share Certificates",
  "Consent to Act as Director",
  "Annual Directors' Resolutions",
  "Annual Shareholders' Resolutions",
  "Share Transfer Register",
];

const PACKAGES = [
  {
    name: "Standard",
    age: "Corporations up to 2 years old",
    price: "$299",
    description: "Full minute book prepared from your incorporation documents — all registers, share certificates, by-laws, and organizational resolutions.",
    highlight: false,
  },
  {
    name: "Established",
    age: "Corporations 2 – 5 years old",
    price: "$749",
    description: "Government document retrieval for all filings since incorporation, plus complete minute book preparation and compilation.",
    highlight: true,
  },
  {
    name: "Legacy",
    age: "Corporations 5+ years old",
    price: "$1,399",
    description: "Full corporate history retrieval from government registries and comprehensive minute book reconstruction covering all years of activity.",
    highlight: false,
  },
];

export default function MinuteBooksPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1 }}>

        {/* ── Hero ── */}
        <section
          style={{
            background: "linear-gradient(160deg,#CBE2EF 0%,#DCE9F2 40%,#F1F5F8 100%)",
            borderBottom: "1px solid var(--border)",
            padding: "4.5rem 1.5rem 3.5rem",
          }}
        >
          <div style={{ maxWidth: "760px", margin: "0 auto", textAlign: "center" }}>
            <span
              style={{
                fontFamily: "var(--font-mono), monospace",
                fontSize: "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--gold)",
                background: "var(--gold-dim)",
                padding: "0.25rem 0.75rem",
                borderRadius: "4px",
                display: "inline-block",
                marginBottom: "1.25rem",
              }}
            >
              Corporate Minute Books
            </span>
            <h1
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "clamp(2rem, 4vw, 2.875rem)",
                fontWeight: 700,
                lineHeight: 1.15,
                color: "var(--text)",
                marginBottom: "1.25rem",
              }}
            >
              Your Corporate Minute Book,{" "}
              <span style={{ color: "var(--gold)" }}>Ready in Minutes</span>
            </h1>
            <div className="gold-line" style={{ margin: "0 auto 1.25rem" }} />
            <p
              style={{
                fontSize: "1.05rem",
                color: "var(--text-muted)",
                lineHeight: 1.75,
                maxWidth: "52ch",
                margin: "0 auto 2rem",
              }}
            >
              Generate a complete, compliance-ready Canadian corporate minute book — all organizational
              resolutions, share registers, certificates, and by-laws — without a lawyer.
            </p>
            <div style={{ display: "flex", gap: "0.875rem", justifyContent: "center", flexWrap: "wrap" }}>
              <a
                href="https://minutebook.corporateregistryservices.ca"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.5rem",
                  padding: "0.875rem 1.75rem", borderRadius: "0.5rem",
                  background: "var(--primary)", color: "#fff",
                  fontWeight: 700, fontSize: "1rem", textDecoration: "none",
                }}
              >
                Generate My Minute Book <ArrowRight size={18} />
              </a>
              <a
                href="#what-is"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.5rem",
                  padding: "0.875rem 1.5rem", borderRadius: "0.5rem",
                  border: "1.5px solid var(--primary)", color: "var(--primary)",
                  fontWeight: 600, fontSize: "0.95rem", textDecoration: "none",
                  background: "transparent",
                }}
              >
                Learn more
              </a>
            </div>
            {/* Trust row */}
            <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center", flexWrap: "wrap", marginTop: "2rem" }}>
              {[
                { icon: Clock,        label: "Ready same day" },
                { icon: ShieldCheck,  label: "Legally compliant" },
                { icon: BookOpen,     label: "All 13 jurisdictions" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="badge-pill">
                  <Icon size={12} style={{ color: "var(--gold)", flexShrink: 0 }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── What is a Minute Book ── */}
        <section
          id="what-is"
          style={{ padding: "4rem 1.5rem", scrollMarginTop: "4rem" }}
        >
          <div style={{ maxWidth: "760px", margin: "0 auto" }}>
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
              What is it
            </span>
            <h2
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "clamp(1.5rem, 2.5vw, 2rem)",
                fontWeight: 700,
                color: "var(--text)",
                marginTop: "0.5rem",
                marginBottom: "1rem",
              }}
            >
              What is a Corporate Minute Book?
            </h2>
            <div className="gold-line" style={{ marginBottom: "1.25rem" }} />
            <p style={{ fontSize: "1rem", color: "var(--text-muted)", lineHeight: 1.8, marginBottom: "1rem" }}>
              A corporate minute book is the official record-keeping binder for your corporation. It contains every foundational legal document of your company — from the day it was incorporated to its current state. Think of it as your corporation&apos;s permanent legal biography.
            </p>
            <p style={{ fontSize: "1rem", color: "var(--text-muted)", lineHeight: 1.8, marginBottom: "1rem" }}>
              Under Canadian corporate law — both the <em>Canada Business Corporations Act</em> (CBCA) and all provincial corporate statutes — every corporation is <strong>legally required</strong> to maintain a minute book at its registered office and make it available for inspection by shareholders, directors, and regulatory authorities.
            </p>
            <p style={{ fontSize: "1rem", color: "var(--text-muted)", lineHeight: 1.8 }}>
              Failing to maintain one doesn&apos;t just create legal risk — it can block your ability to get financing, sell your business, add shareholders, or file accurate tax returns.
            </p>
          </div>
        </section>

        {/* ── When You Need One ── */}
        <section style={{ background: "var(--bg-deep)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "4rem 1.5rem" }}>
          <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
                When you need it
              </span>
              <h2
                style={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  fontSize: "clamp(1.5rem, 2.5vw, 2rem)",
                  fontWeight: 700,
                  color: "var(--text)",
                  marginTop: "0.5rem",
                }}
              >
                Situations that require a current minute book
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
              {WHEN_NEEDED.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.75rem",
                    padding: "1.25rem",
                  }}
                >
                  <div
                    style={{
                      width: "2.25rem", height: "2.25rem", borderRadius: "0.5rem",
                      background: "var(--gold-dim)", display: "flex",
                      alignItems: "center", justifyContent: "center", marginBottom: "0.875rem",
                    }}
                  >
                    <Icon size={17} style={{ color: "var(--gold)" }} />
                  </div>
                  <h3 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "0.975rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.375rem" }}>
                    {title}
                  </h3>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.65, margin: 0 }}>
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── What's Included ── */}
        <section style={{ padding: "4rem 1.5rem" }}>
          <div style={{ maxWidth: "760px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3rem", alignItems: "start" }}>
            <div>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
                What&apos;s included
              </span>
              <h2
                style={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  fontSize: "clamp(1.4rem, 2vw, 1.75rem)",
                  fontWeight: 700,
                  color: "var(--text)",
                  marginTop: "0.5rem",
                  marginBottom: "1rem",
                }}
              >
                Every document your corporation needs
              </h2>
              <div className="gold-line" style={{ marginBottom: "1.25rem" }} />
              <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", lineHeight: 1.75, marginBottom: "1rem" }}>
                Our minute book generator produces a complete, jurisdiction-specific package. Every document is professionally formatted and ready for filing or presentation.
              </p>
              <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", lineHeight: 1.75 }}>
                Delivered as a single merged PDF and individual documents — ready to sign, store, and present to your bank or lawyer.
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {DOCUMENTS.map((doc) => (
                <div key={doc} style={{ display: "flex", alignItems: "center", gap: "0.625rem", fontSize: "0.84rem", color: "var(--text)" }}>
                  <CheckCircle2 size={14} style={{ color: "var(--secondary)", flexShrink: 0 }} />
                  {doc}
                </div>
              ))}
            </div>
          </div>
          <style>{`
            @media (max-width: 640px) {
              #mb-docs-grid { grid-template-columns: 1fr !important; }
            }
          `}</style>
        </section>

        {/* ── Pricing ── */}
        <section style={{ background: "var(--bg-deep)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", padding: "4rem 1.5rem" }}>
          <div style={{ maxWidth: "900px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
                Pricing
              </span>
              <h2
                style={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  fontSize: "clamp(1.5rem, 2.5vw, 2rem)",
                  fontWeight: 700,
                  color: "var(--text)",
                  marginTop: "0.5rem",
                  marginBottom: "0.5rem",
                }}
              >
                Flat-fee pricing — no hourly billing
              </h2>
              <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
                All packages include government document retrieval, professional preparation, and digital delivery. No hidden fees.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
              {PACKAGES.map((pkg) => (
                <div
                  key={pkg.name}
                  style={{
                    background: pkg.highlight ? "var(--primary)" : "var(--card)",
                    border: `2px solid ${pkg.highlight ? "var(--primary)" : "var(--border)"}`,
                    borderRadius: "0.875rem",
                    padding: "1.5rem",
                    position: "relative",
                  }}
                >
                  {pkg.highlight && (
                    <div
                      style={{
                        position: "absolute", top: "-0.875rem", left: "50%", transform: "translateX(-50%)",
                        background: "var(--gold)", color: "#fff", fontSize: "0.65rem",
                        fontFamily: "var(--font-mono), monospace", textTransform: "uppercase",
                        letterSpacing: "0.08em", padding: "0.2rem 0.75rem", borderRadius: "9999px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Most common
                    </div>
                  )}
                  <div
                    style={{
                      fontFamily: "var(--font-mono), monospace", fontSize: "0.65rem",
                      textTransform: "uppercase", letterSpacing: "0.08em",
                      color: pkg.highlight ? "rgba(255,255,255,0.7)" : "var(--text-muted)",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {pkg.age}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-display), Georgia, serif",
                      fontSize: "1.15rem", fontWeight: 700,
                      color: pkg.highlight ? "#fff" : "var(--text)",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {pkg.name}
                  </div>
                  <div
                    style={{
                      fontSize: "1.75rem", fontWeight: 800,
                      color: pkg.highlight ? "#fff" : "var(--gold)",
                      marginBottom: "0.75rem",
                    }}
                  >
                    {pkg.price} <span style={{ fontSize: "0.85rem", fontWeight: 400, opacity: 0.75 }}>+ tax</span>
                  </div>
                  <p style={{ fontSize: "0.82rem", lineHeight: 1.65, color: pkg.highlight ? "rgba(255,255,255,0.85)" : "var(--text-muted)", margin: 0 }}>
                    {pkg.description}
                  </p>
                </div>
              ))}
            </div>
            <p style={{ textAlign: "center", fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "1.25rem" }}>
              Already have some corporate documents?{" "}
              <a href="/contact" style={{ color: "var(--gold)", textDecoration: "none" }}>Contact us for a custom quote</a>
              {" "}— we may be able to apply a discount.
            </p>
          </div>
        </section>

        {/* ── CTA ── */}
        <section style={{ padding: "5rem 1.5rem", textAlign: "center" }}>
          <div style={{ maxWidth: "580px", margin: "0 auto" }}>
            <h2
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "clamp(1.5rem, 3vw, 2rem)",
                fontWeight: 700,
                color: "var(--text)",
                marginBottom: "1rem",
              }}
            >
              Ready to get your minute book in order?
            </h2>
            <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", lineHeight: 1.75, marginBottom: "2rem" }}>
              Enter your company details once and generate a complete, professional minute book package — same day. No lawyer required.
            </p>
            <a
              href="https://minutebook.corporateregistryservices.ca"
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.5rem",
                padding: "1rem 2rem", borderRadius: "0.5rem",
                background: "var(--primary)", color: "#fff",
                fontWeight: 700, fontSize: "1rem", textDecoration: "none",
              }}
            >
              Generate My Minute Book <ArrowRight size={18} />
            </a>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "1rem" }}>
              Available for all 13 Canadian jurisdictions · Federal, all provinces &amp; territories
            </p>
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}
