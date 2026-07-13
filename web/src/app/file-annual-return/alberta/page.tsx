import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AlbertaSearchIsland from "./AlbertaSearchIsland";

export const metadata: Metadata = {
  title: "File Your Alberta Annual Return in Minutes — CRS",
  description:
    "Search your Alberta corporation and file your annual return with the Alberta registrar in minutes. $99 all-in + gst. Filed within 24 hours.",
};

export default function FileAlbertaAnnualReturnPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1 }}>
        {/* Hero */}
        <section
          style={{
            background: "linear-gradient(160deg, #F1F5F8 0%, #EEF4FA 45%, #E4ECF2 100%)",
            padding: "3rem 1.5rem",
          }}
        >
          <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
            <div
              style={{
                display: "inline-flex", alignItems: "center", gap: "0.4rem",
                padding: "0.35rem 0.85rem",
                background: "var(--gold-dim)", color: "var(--gold)",
                border: "1px solid rgba(249,172,0,0.35)",
                borderRadius: "9999px",
                fontFamily: "var(--font-mono), monospace",
                fontSize: "0.72rem", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.08em",
                marginBottom: "1.25rem",
              }}
            >
              Official Filing Service · Alberta
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display), Georgia, serif",
                fontSize: "clamp(2rem, 4vw, 3rem)",
                fontWeight: 700,
                lineHeight: 1.15,
                color: "var(--text)",
                margin: "0 0 1rem",
              }}
            >
              File Your Alberta Annual Return{" "}
              <span style={{ color: "var(--gold)" }}>in Minutes</span>
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "1.05rem", lineHeight: 1.6, margin: "0 auto 1.75rem", maxWidth: "48ch" }}>
              Search your Alberta corporation below. We&apos;ll pull your details from the registry and file your annual return
              — <strong style={{ color: "var(--text)" }}>$99</strong>
              <span style={{ fontSize: "0.85em", color: "var(--text-muted)" }}> + gst</span>, filed within 24 hours.
            </p>

            <AlbertaSearchIsland />

            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "1.5rem", marginTop: "1.5rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
              <span>✓ Trusted by Alberta corporations</span>
              <span>✓ Filed with the Alberta Corporate Registry</span>
              <span>✓ 24-hour turnaround</span>
            </div>
          </div>
        </section>

        {/* Why us */}
        <section style={{ padding: "3rem 1.5rem", background: "var(--card)" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <div style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
                Why file with CRS
              </div>
              <h2 className="card-heading" style={{ fontSize: "1.6rem", marginTop: "0.35rem" }}>
                Simple, secure, and built for Alberta corporations
              </h2>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
              {[
                { title: "Done in 5 Minutes",   body: "We pre-fill your data from the Alberta registry so you can file faster than the government portal." },
                { title: "Government-direct",   body: "Filed directly with the Alberta Corporate Registry — not a third-party rebooking service." },
                { title: "Compliance Alerts",   body: "We'll email you 30 days before next year's anniversary date so you never miss another filing." },
              ].map(({ title, body }) => (
                <div key={title} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)", padding: "1.5rem", boxShadow: "var(--shadow-card)" }}>
                  <h3 className="card-heading" style={{ fontSize: "1.02rem", marginBottom: "0.4rem" }}>{title}</h3>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Deadline reminder banner */}
        <section style={{ padding: "2rem 1.5rem", background: "var(--bg-deep)" }}>
          <div style={{
            maxWidth: 900, margin: "0 auto",
            padding: "1.25rem 1.5rem",
            background: "var(--card)", border: "1px solid #B45309",
            borderLeft: "4px solid #B45309",
            borderRadius: "var(--radius-card)",
            display: "flex", gap: "0.85rem", alignItems: "flex-start",
          }}>
            <div style={{ fontSize: "1.5rem" }}>⚠</div>
            <div>
              <div className="card-heading" style={{ fontSize: "1rem", color: "#B45309", marginBottom: "0.3rem" }}>
                Did you know?
              </div>
              <p style={{ fontSize: "0.88rem", color: "var(--text)", lineHeight: 1.6, margin: 0 }}>
                Alberta corporations that miss their annual return get flagged <strong>Liable for Dissolution</strong> — after 4 months, the registrar strikes the corporation off the register, freezing bank accounts, financing, and contracts. Don&apos;t risk your business status.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
