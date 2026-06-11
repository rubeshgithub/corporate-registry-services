import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy — CRS — Corporate Registry Services",
  description: "CRS — Corporate Registry Services privacy policy — how we collect, use, and protect your personal information.",
};

const LAST_UPDATED = "June 10, 2026";

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1 }}>
        <div style={{ borderBottom: "1px solid var(--border)", background: "linear-gradient(160deg,#E8F4FD 0%,#F8FAFC 100%)", padding: "3rem 1.5rem" }}>
          <div style={{ maxWidth: "760px", margin: "0 auto" }}>
            <span style={{ fontFamily: "var(--font-mono),monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)", display: "block", marginBottom: "0.75rem" }}>Legal</span>
            <h1 style={{ fontFamily: "var(--font-display),Georgia,serif", fontSize: "clamp(1.75rem,3vw,2.5rem)", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>Privacy Policy</h1>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontFamily: "var(--font-mono),monospace" }}>Last updated: {LAST_UPDATED}</p>
          </div>
        </div>

        <article style={{ maxWidth: "760px", margin: "0 auto", padding: "3rem 1.5rem 5rem" }}>
          <div className="prose">

            <p>CRS — Corporate Registry Services (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;) is committed to protecting your personal information. This Privacy Policy explains what information we collect when you use <strong>crs.ca</strong>, how we use it, and the choices you have.</p>

            <h2>1. Information We Collect</h2>
            <p>We collect information you provide directly when placing an order or contacting us:</p>
            <ul>
              <li><strong>Contact details</strong> — full name, email address, phone number, and company name.</li>
              <li><strong>Order information</strong> — the services requested, jurisdiction, and any details you provide to fulfil your order.</li>
              <li><strong>Communications</strong> — messages, emails, or notes you send us.</li>
            </ul>
            <p>We also collect limited technical data automatically:</p>
            <ul>
              <li>Browser type, IP address, referring URL, and pages visited (via standard server logs).</li>
              <li>We do <strong>not</strong> use persistent tracking cookies or third-party advertising pixels.</li>
            </ul>

            <h2>2. How We Use Your Information</h2>
            <p>We use your information solely to:</p>
            <ul>
              <li>Fulfil the corporate registry service you requested.</li>
              <li>Send you a quote, order confirmation, and delivery of completed documents.</li>
              <li>Respond to your questions and support requests.</li>
              <li>Comply with legal and regulatory obligations.</li>
            </ul>
            <p>We do <strong>not</strong> sell, rent, or share your personal information with third parties for marketing purposes.</p>

            <h2>3. How We Share Your Information</h2>
            <p>Your information may be shared only in these limited circumstances:</p>
            <ul>
              <li><strong>Government registries</strong> — we submit the information required to file or retrieve documents on your behalf (e.g., director names, addresses).</li>
              <li><strong>Email service providers</strong> — we use Amazon Web Services (AWS SES) to send transactional emails. AWS does not use your data for any other purpose.</li>
              <li><strong>Legal requirements</strong> — if required by law, court order, or regulatory authority.</li>
            </ul>

            <h2>4. Data Retention</h2>
            <p>We retain your order information for a minimum of seven (7) years to comply with Canadian tax and corporate law record-keeping requirements. Contact information is retained for as long as necessary to provide ongoing support.</p>

            <h2>5. Your Rights</h2>
            <p>Under Canadian privacy law (PIPEDA and applicable provincial legislation), you have the right to:</p>
            <ul>
              <li>Access the personal information we hold about you.</li>
              <li>Request correction of inaccurate information.</li>
              <li>Withdraw consent for non-essential communications.</li>
              <li>Request deletion of your information, subject to our legal retention obligations.</li>
            </ul>
            <p>To exercise any of these rights, contact us at <a href="mailto:info@crs.ca">info@crs.ca</a>.</p>

            <h2>6. Security</h2>
            <p>We use industry-standard security practices including encrypted data transmission (TLS/HTTPS), access controls, and secure cloud infrastructure. No method of transmission over the internet is 100% secure, but we take reasonable precautions to protect your information.</p>

            <h2>7. Third-Party Links</h2>
            <p>Our website may contain links to government registries and other third-party sites. We are not responsible for the privacy practices of those sites and encourage you to review their policies.</p>

            <h2>8. Children&apos;s Privacy</h2>
            <p>Our services are intended for businesses and adults. We do not knowingly collect personal information from individuals under the age of 18.</p>

            <h2>9. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated &ldquo;Last updated&rdquo; date. Continued use of our services after changes constitutes acceptance of the revised policy.</p>

            <h2>10. Contact Us</h2>
            <p>If you have questions or concerns about this Privacy Policy, please contact us:</p>
            <ul>
              <li><strong>Email:</strong> <a href="mailto:info@crs.ca">info@crs.ca</a></li>
              <li><strong>Website:</strong> <a href="https://www.crs.ca">www.crs.ca</a></li>
            </ul>

          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
