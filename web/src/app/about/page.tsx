import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ShieldCheck, Clock, Globe, FileText, Users, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "About CRS — Corporate Registry Services — Canadian Corporate Registry Services",
  description:
    "CRS — Corporate Registry Services is Canada's dedicated corporate compliance specialist — profile reports, good standing certificates, annual returns, incorporations, and minute books across all 13 jurisdictions.",
};

const STATS = [
  { value: "13", label: "Jurisdictions covered" },
  { value: "5,000+", label: "Companies served" },
  { value: "1 hr", label: "Average response time" },
  { value: "100%", label: "Government-direct" },
];

const VALUES = [
  {
    icon: ShieldCheck,
    title: "Government-direct only",
    body: "We retrieve documents and file directly with the relevant provincial, territorial, or federal registry — no third-party databases, no aggregators.",
  },
  {
    icon: Clock,
    title: "Built for speed",
    body: "Most profile reports and certificates are delivered electronically within 3 hours. Filing quotes come back within 1 hour, any day of the week.",
  },
  {
    icon: Globe,
    title: "Pan-Canadian coverage",
    body: "Federal (Corporations Canada), all 10 provinces, and all 3 territories — one team, one point of contact, every jurisdiction.",
  },
  {
    icon: FileText,
    title: "End-to-end document service",
    body: "From a single corporate search to a complete minute book package — we handle preparation, filing, and delivery so you don't have to.",
  },
  {
    icon: Users,
    title: "Built for professionals",
    body: "Lawyers, accountants, and financial advisors rely on us for fast, accurate corporate records on behalf of their clients.",
  },
  {
    icon: CheckCircle2,
    title: "Transparent pricing",
    body: "Every order comes with a clear quote before you commit. All government fees are included — no surprises at checkout.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1 }}>
        {/* Hero */}
        <section
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-deep)",
            padding: "4rem 1.5rem",
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
              About CRS — Corporate Registry Services
            </span>
            <h1
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "clamp(2rem, 4vw, 2.75rem)",
                fontWeight: 700,
                lineHeight: 1.15,
                color: "var(--text)",
                marginBottom: "1.25rem",
              }}
            >
              Canada&apos;s dedicated corporate registry specialist
            </h1>
            <div className="gold-line" style={{ marginBottom: "1.25rem" }} />
            <p
              style={{
                fontSize: "1.05rem",
                color: "var(--text-muted)",
                lineHeight: 1.75,
                maxWidth: "60ch",
              }}
            >
              CRS — Corporate Registry Services was built for one purpose: making corporate registry work fast, accurate, and
              accessible for businesses and professionals across Canada. We file and retrieve
              directly from every government registry, so you always get the real thing.
            </p>
          </div>
        </section>

        {/* Stats bar */}
        <section
          style={{
            borderBottom: "1px solid var(--border)",
            padding: "2rem 1.5rem",
          }}
        >
          <div
            style={{
              maxWidth: "760px",
              margin: "0 auto",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {STATS.map(({ value, label }) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontFamily: "var(--font-display), Georgia, serif",
                    fontSize: "2rem",
                    fontWeight: 700,
                    color: "var(--gold)",
                    lineHeight: 1,
                    marginBottom: "0.375rem",
                  }}
                >
                  {value}
                </div>
                <div
                  style={{
                    fontSize: "0.78rem",
                    color: "var(--text-muted)",
                    fontFamily: "var(--font-mono), monospace",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Values */}
        <section style={{ maxWidth: "760px", margin: "0 auto", padding: "4rem 1.5rem" }}>
          <h2
            style={{
              fontFamily: "var(--font-display), Georgia, serif",
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--text)",
              marginBottom: "2rem",
            }}
          >
            How we work
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {VALUES.map(({ icon: Icon, title, body }) => (
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
                    width: "2.25rem",
                    height: "2.25rem",
                    borderRadius: "0.5rem",
                    background: "var(--gold-dim)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "0.875rem",
                  }}
                >
                  <Icon size={18} style={{ color: "var(--gold)" }} />
                </div>
                <h3
                  style={{
                    fontFamily: "var(--font-display), Georgia, serif",
                    fontSize: "1rem",
                    fontWeight: 600,
                    color: "var(--text)",
                    marginBottom: "0.375rem",
                  }}
                >
                  {title}
                </h3>
                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.65 }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--bg-deep)",
            padding: "4rem 1.5rem",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: "480px", margin: "0 auto" }}>
            <h2
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "var(--text)",
                marginBottom: "0.75rem",
              }}
            >
              Ready to get started?
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
              Use the wizard on our homepage to submit your request in under 2 minutes.
            </p>
            <a
              href="/#hero"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1.5rem",
                borderRadius: "0.5rem",
                background: "var(--primary)",
                color: "#FFFFFF",
                fontWeight: 600,
                textDecoration: "none",
                fontSize: "0.9rem",
              }}
            >
              Get a quote
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
