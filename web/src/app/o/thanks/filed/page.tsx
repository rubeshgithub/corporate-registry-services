import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CheckCircle2 } from "lucide-react";

export const metadata = {
  title: "Thanks for letting us know — CRS",
  robots: { index: false, follow: false },
};

/**
 * Landing page after a recipient clicks the "already filed" anti-CTA in an
 * outreach email. We record the acknowledgement on the token in the /o
 * route; this page just confirms and gently offers other services.
 */
export default function AlreadyFiledPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)", padding: "4rem 1.5rem" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
          <CheckCircle2 size={44} style={{ color: "var(--secondary)", margin: "0 auto 1.25rem", display: "block" }} />

          <h1 className="card-heading" style={{ fontSize: "1.65rem", marginBottom: "0.6rem" }}>
            Thanks for letting us know
          </h1>

          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.75rem" }}>
            We&apos;ve marked your corporation as already filed. You won&apos;t receive further
            annual return reminders from us on this record.
          </p>

          <div
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-card)",
              padding: "1.5rem 1.75rem",
              boxShadow: "var(--shadow-card)",
              textAlign: "left",
              marginBottom: "1.25rem",
            }}
          >
            <div className="card-heading" style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
              While you&apos;re here — other things CRS handles
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: 1.6, margin: "0 0 0.85rem" }}>
              Directors changed? Address moved? Need a Corporate Profile Report or Certificate of Good Standing? We file everything with the registry and email the confirmation the same business day.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem" }}>
              <a href="/order/profile-report?src=outreach-ack-filed" className="section-card" style={{ padding: "0.7rem 0.9rem", fontSize: "0.82rem" }}>
                Corporate Profile Report — $49
              </a>
              <a href="/order/good-standing?src=outreach-ack-filed" className="section-card" style={{ padding: "0.7rem 0.9rem", fontSize: "0.82rem" }}>
                Certificate of Good Standing — $79
              </a>
              <a href="/order/change-directors?src=outreach-ack-filed" className="section-card" style={{ padding: "0.7rem 0.9rem", fontSize: "0.82rem" }}>
                Director / officer change
              </a>
              <a href="/order/change-address?src=outreach-ack-filed" className="section-card" style={{ padding: "0.7rem 0.9rem", fontSize: "0.82rem" }}>
                Registered address change
              </a>
            </div>
          </div>

          <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: 1.6 }}>
            Questions or need to unsubscribe from all CRS emails? Email{" "}
            <a href="mailto:support@corporateregistryservices.ca" style={{ color: "var(--secondary)" }}>
              support@corporateregistryservices.ca
            </a>.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
