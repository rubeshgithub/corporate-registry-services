import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ContactForm from "@/components/ContactForm";
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
    value: "support@corporateregistryservices.ca",
    href: "mailto:support@corporateregistryservices.ca",
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
              Have a question? We respond within 1 hour.
            </h1>
            <div className="gold-line" style={{ marginBottom: "1.25rem" }} />
            <p style={{ fontSize: "1rem", color: "var(--text-muted)", lineHeight: 1.75 }}>
              Reach us by email or use the form below. Our team is available Monday – Friday, 8 am – 8 pm ET.
            </p>
          </div>
        </section>

        <section style={{ maxWidth: "760px", margin: "0 auto", padding: "3rem 1.5rem 5rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "2rem", alignItems: "start" }}>

            {/* Left — contact details */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {CONTACT_ITEMS.map(({ icon: Icon, label, value, href, note }) => (
                <div
                  key={label}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: "0.875rem",
                    padding: "1rem", background: "var(--card)",
                    border: "1px solid var(--border)", borderRadius: "0.75rem",
                  }}
                >
                  <div
                    style={{
                      width: "2rem", height: "2rem", borderRadius: "0.5rem",
                      background: "var(--gold-dim)", display: "flex",
                      alignItems: "center", justifyContent: "center",
                      flexShrink: 0, marginTop: "0.1rem",
                    }}
                  >
                    <Icon size={15} style={{ color: "var(--gold)" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "0.65rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "0.15rem" }}>
                      {label}
                    </div>
                    {href ? (
                      <a href={href} style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--gold)", textDecoration: "none", wordBreak: "break-all" }}>
                        {value}
                      </a>
                    ) : (
                      <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text)" }}>{value}</div>
                    )}
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.15rem" }}>{note}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Right — enquiry form */}
            <div>
              <h2
                style={{
                  fontFamily: "var(--font-display), Georgia, serif",
                  fontSize: "1.1rem", fontWeight: 700,
                  color: "var(--text)", marginBottom: "1rem",
                }}
              >
                Send us a message
              </h2>
              <ContactForm />
            </div>
          </div>

          {/* Responsive: stack on mobile */}
          <style>{`
            @media (max-width: 640px) {
              .contact-grid { grid-template-columns: 1fr !important; }
            }
          `}</style>
        </section>
      </main>
      <Footer />
    </>
  );
}
