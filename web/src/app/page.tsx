import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WizardIsland from "@/components/wizard/WizardIsland";
import HeroAsset from "@/components/HeroAsset";
import ContactForm from "@/components/ContactForm";
import {
  ShieldCheck,
  Clock,
  Building2,
  CheckCircle2,
  FileText,
  Search,
  Globe,
} from "lucide-react";

const TRUST_BADGES = [
  { icon: Globe,       label: "All 13 jurisdictions" },
  { icon: Clock,       label: "Response within 1 hour" },
  { icon: ShieldCheck, label: "Government-direct" },
];

const WHY_ITEMS = [
  { icon: CheckCircle2, title: "Official sources only",       body: "We file and retrieve directly from government registries — no third-party intermediaries." },
  { icon: Clock,        title: "Fast turnaround",             body: "Most profile reports and certificates delivered in minutes. Filing quotes within 1 hour." },
  { icon: Globe,        title: "All of Canada",               body: "Federal, all 10 provinces, and all 3 territories — one trusted source." },
  { icon: FileText,     title: "Complete document packages",  body: "From a single search to a full minute book — we handle the paperwork end to end." },
];

export default function HomePage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1 }}>

        {/* ── Hero ── */}
        <div
          style={{
            background: "linear-gradient(160deg, #CBE2EF 0%, #DCE9F2 35%, #F1F5F8 100%)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {/* Top row: text + wizard */}
          <section
            id="hero"
            style={{
              scrollMarginTop: "4rem",
              maxWidth: "1200px",
              margin: "0 auto",
              padding: "2rem 1.5rem 2rem",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "3rem",
              alignItems: "flex-start",
            }}
          >
            {/* Left column — with professional person image behind text */}
            <div style={{ position: "relative" }}>
              {/*
                Place a professional headshot at /public/hero-person.jpg
                (portrait crop, North American professional, light background).
                The div renders the image behind the text at low opacity.
                If the file is absent it simply shows nothing.
              */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: "-3rem",
                  right: "-2rem",
                  bottom: "-3rem",
                  left: "30%",
                  backgroundImage: "url('/hero-person.jpg')",
                  backgroundSize: "cover",
                  backgroundPosition: "center top",
                  opacity: 0.13,
                  maskImage: "linear-gradient(to left, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)",
                  WebkitMaskImage: "linear-gradient(to left, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%)",
                  pointerEvents: "none",
                }}
              />

              {/* Content sits above the image */}
              <div style={{ position: "relative", zIndex: 1 }}>
                <span
                  style={{
                    display: "inline-block",
                    fontFamily: "var(--font-mono), monospace",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "var(--gold)",
                    marginBottom: "1rem",
                    background: "var(--gold-dim)",
                    padding: "0.25rem 0.65rem",
                    borderRadius: "4px",
                  }}
                >
                  Canadian Corporate Registry Services
                </span>

                <h1
                  style={{
                    fontFamily: "var(--font-display), Georgia, serif",
                    fontSize: "clamp(2rem, 3.5vw, 2.875rem)",
                    fontWeight: 700,
                    lineHeight: 1.13,
                    color: "var(--text)",
                    marginBottom: "1.1rem",
                  }}
                >
                  Your Canadian Corporation,{" "}
                  <span style={{ color: "var(--gold)" }}>Ready in Hours —</span>
                  <br />Not Weeks
                </h1>

                <div className="gold-line" style={{ marginBottom: "1.25rem" }} />

                <p
                  style={{
                    fontSize: "1.05rem",
                    color: "var(--text-muted)",
                    lineHeight: 1.7,
                    marginBottom: "1.75rem",
                    maxWidth: "38ch",
                  }}
                >
                  Say goodbye to expensive lawyers, CPAs, and long wait times. Incorporate,
                  file annual returns, order certificates, and build your minute book
                  — all through official government registries, at transparent
                  flat-fee pricing.
                </p>

                {/* Trust badges */}
                <div style={{ display: "flex", flexWrap: "nowrap", gap: "0.5rem", marginBottom: "1.25rem" }}>
                  {TRUST_BADGES.map(({ icon: Icon, label }) => (
                    <div key={label} className="badge-pill">
                      <Icon size={12} style={{ color: "var(--gold)", flexShrink: 0 }} />
                      {label}
                    </div>
                  ))}
                </div>

                {/* Secondary CTA */}
                <a href="/canada-corporations-search" className="btn-search-corp">
                  <Search size={15} />
                  Search a Corporation
                </a>
              </div>
            </div>

            {/* Right column — wizard */}
            <div>
              <WizardIsland />
            </div>
          </section>

          {/* Asset row: floating document cards — hidden below 900px */}
          <div
            id="hero-asset"
            style={{
              maxWidth: "1200px",
              margin: "0 auto",
              padding: "0 1.5rem 2.5rem",
              overflow: "hidden",
            }}
          >
            <HeroAsset />
          </div>
        </div>

        <style>{`
          @media (max-width: 900px) {
            #hero-asset { display: none !important; }
          }
          @media (max-width: 768px) {
            #hero { grid-template-columns: 1fr !important; gap: 1.5rem !important; padding: 1.75rem 1rem 1rem !important; }
          }
          @media (max-width: 480px) {
            #hero h1 { font-size: 1.75rem !important; }
            #hero p  { font-size: 0.95rem !important; }
          }
          @keyframes corp-pulse {
            0%   { box-shadow: 0 0 0 0 rgba(12, 61, 97, 0.4); }
            65%  { box-shadow: 0 0 0 9px rgba(12, 61, 97, 0); }
            100% { box-shadow: 0 0 0 0 rgba(12, 61, 97, 0); }
          }
          .btn-search-corp {
            display: inline-flex; align-items: center; gap: 0.5rem;
            padding: 0.6rem 1.25rem; border-radius: 0.5rem;
            border: 1.5px solid var(--primary); color: var(--primary);
            background: transparent; font-weight: 600; font-size: 0.875rem;
            text-decoration: none; transition: background 0.15s, color 0.15s;
            animation: corp-pulse 2.4s ease-out infinite;
          }
          .btn-search-corp:hover {
            background: var(--primary); color: #fff;
            animation: none; box-shadow: none;
          }
        `}</style>

        {/* ── Why CRS ── */}
        <section
          id="why"
          style={{
            borderBottom: "1px solid var(--border)",
            padding: "4rem 1.5rem",
          }}
        >
          <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
                Why choose us
              </span>
              <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "clamp(1.5rem, 2.5vw, 2rem)", fontWeight: 700, color: "var(--text)", marginTop: "0.5rem" }}>
                Trusted by Canadian businesses &amp; professionals
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem" }}>
              {WHY_ITEMS.map(({ icon: Icon, title, body }) => (
                <div key={title} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem", boxShadow: "var(--shadow)" }}>
                  <div style={{ width: "2.25rem", height: "2.25rem", borderRadius: "0.5rem", background: "var(--gold-dim)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "0.875rem" }}>
                    <Icon size={18} style={{ color: "var(--gold)" }} />
                  </div>
                  <h3 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1rem", fontWeight: 600, color: "var(--text)", marginBottom: "0.375rem" }}>
                    {title}
                  </h3>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: 1.6 }}>{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Services overview ── */}
        <section id="services" style={{ background: "var(--bg-deep)", borderBottom: "1px solid var(--border)", padding: "4rem 1.5rem" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
              <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
                What we offer
              </span>
              <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "clamp(1.5rem, 2.5vw, 2rem)", fontWeight: 700, color: "var(--text)", marginTop: "0.5rem" }}>
                All services available nationwide
              </h2>
              <p style={{ color: "var(--text-muted)", marginTop: "0.5rem", fontSize: "0.9rem" }}>
                Every service comes with a custom quote — no hidden fees, no surprises.
              </p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
              {[
                { icon: Search,       label: "Corporate Profile Reports",        href: "/profile-reports" },
                { icon: ShieldCheck,  label: "Certificates of Good Standing",    href: "/good-standing" },
                { icon: CheckCircle2, label: "Annual Return Filings",            href: "/annual-return" },
                { icon: Building2,    label: "Incorporation — All Jurisdictions", href: "/incorporation" },
                { icon: FileText,     label: "Corporate Minute Books",           href: "/minute-books" },
                { icon: Globe,        label: "Guides &amp; Resources",           href: "/guides" },
              ].map(({ icon: Icon, label, href }) => (
                <a key={label} href={href} className="section-card">
                  <span style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                    <Icon size={16} style={{ color: "var(--gold)", flexShrink: 0 }} />
                    <span dangerouslySetInnerHTML={{ __html: label }} />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ── Contact CTA ── */}
        <section id="contact" style={{ padding: "4rem 1.5rem" }}>
          <div style={{ maxWidth: "620px", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
              <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "clamp(1.4rem, 2.5vw, 1.85rem)", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
                Have a question? We respond within 1 hour.
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                Monday – Friday, 8 am – 8 pm ET. Or email us at{" "}
                <a href="mailto:support@corporateregistryservices.ca" style={{ color: "var(--gold)", textDecoration: "none" }}>
                  support@corporateregistryservices.ca
                </a>
              </p>
            </div>
            <ContactForm compact />
          </div>
        </section>

      </main>
      <Footer />
    </>
  );
}
