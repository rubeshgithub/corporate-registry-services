import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Mail, Clock, Globe } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact CRS — Canadian Corporate Registry Services",
  description:
    "Contact CRS for corporate profile reports, good standing certificates, annual returns, incorporations, and minute books. We respond within 1 hour.",
};

const CONTACT_ITEMS = [
  {
    icon: Mail,
    label: "Email",
    value: "info@crs.ca",
    href: "mailto:info@crs.ca",
    note: "We reply within 1 hour on business days",
  },
  {
    icon: Clock,
    label: "Response time",
    value: "Within 1 hour",
    href: null,
    note: "Monday – Friday, 8 am – 8 pm ET",
  },
  {
    icon: Globe,
    label: "Coverage",
    value: "All 13 Canadian jurisdictions",
    href: null,
    note: "Federal, all provinces & territories",
  },
];

export default function ContactPage() {
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
          <div style={{ maxWidth: "660px", margin: "0 auto" }}>
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
              Contact
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
              We&apos;re here to help
            </h1>
            <div className="gold-line" style={{ marginBottom: "1.25rem" }} />
            <p style={{ fontSize: "1rem", color: "var(--text-muted)", lineHeight: 1.75 }}>
              Have a question about a service, need a custom quote, or want to check the status of
              an order? Reach out — we respond within 1 hour.
            </p>
          </div>
        </section>

        {/* Contact details + wizard prompt */}
        <section style={{ maxWidth: "660px", margin: "0 auto", padding: "3.5rem 1.5rem 5rem" }}>
          {/* Contact cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "3rem" }}>
            {CONTACT_ITEMS.map(({ icon: Icon, label, value, href, note }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "1rem",
                  padding: "1.125rem 1.25rem",
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.75rem",
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
                    flexShrink: 0,
                    marginTop: "0.1rem",
                  }}
                >
                  <Icon size={17} style={{ color: "var(--gold)" }} />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      fontFamily: "var(--font-mono), monospace",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--text-muted)",
                      marginBottom: "0.2rem",
                    }}
                  >
                    {label}
                  </div>
                  {href ? (
                    <a
                      href={href}
                      style={{
                        fontSize: "1rem",
                        fontWeight: 600,
                        color: "var(--gold)",
                        textDecoration: "none",
                      }}
                    >
                      {value}
                    </a>
                  ) : (
                    <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)" }}>
                      {value}
                    </div>
                  )}
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                    {note}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Wizard prompt */}
          <div
            style={{
              padding: "1.75rem",
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "0.875rem",
              borderLeft: "3px solid var(--gold)",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "1.15rem",
                fontWeight: 600,
                color: "var(--text)",
                marginBottom: "0.5rem",
              }}
            >
              Fastest way to get a quote
            </h2>
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.65, marginBottom: "1.25rem" }}>
              Use the order wizard on our homepage — select your service, jurisdiction, and contact
              details. We&apos;ll send a custom quote to your inbox within 1 hour.
            </p>
            <a
              href="/#hero"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.625rem 1.25rem",
                borderRadius: "0.5rem",
                background: "var(--primary)",
                color: "#FFFFFF",
                fontWeight: 600,
                fontSize: "0.875rem",
                textDecoration: "none",
              }}
            >
              Start your request
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
