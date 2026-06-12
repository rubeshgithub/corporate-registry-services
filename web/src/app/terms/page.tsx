import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Terms of Service — CRS — Corporate Registry Services",
  description: "CRS — Corporate Registry Services terms of service — the agreement that governs your use of our corporate registry services.",
};

const LAST_UPDATED = "June 10, 2026";

export default function TermsPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1 }}>
        <div style={{ borderBottom: "1px solid var(--border)", background: "linear-gradient(160deg,#E8F4FD 0%,#F8FAFC 100%)", padding: "3rem 1.5rem" }}>
          <div style={{ maxWidth: "760px", margin: "0 auto" }}>
            <span style={{ fontFamily: "var(--font-mono),monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)", display: "block", marginBottom: "0.75rem" }}>Legal</span>
            <h1 style={{ fontFamily: "var(--font-display),Georgia,serif", fontSize: "clamp(1.75rem,3vw,2.5rem)", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>Terms of Service</h1>
            <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", fontFamily: "var(--font-mono),monospace" }}>Last updated: {LAST_UPDATED}</p>
          </div>
        </div>

        <article style={{ maxWidth: "760px", margin: "0 auto", padding: "3rem 1.5rem 5rem" }}>
          <div className="prose">

            <p>Please read these Terms of Service (&ldquo;Terms&rdquo;) carefully before using <strong>corporateregistryservices.ca</strong> or placing an order with CRS — Corporate Registry Services. By submitting an order or using our website, you agree to be bound by these Terms.</p>

            <h2>1. Services</h2>
            <p>CRS — Corporate Registry Services provides corporate registry document retrieval and filing services for Canadian corporations, including but not limited to:</p>
            <ul>
              <li>Corporate profile reports and certificates of good standing</li>
              <li>Annual return filings</li>
              <li>Incorporation services</li>
              <li>Corporate minute books</li>
              <li>Director, officer, and address change filings</li>
              <li>Dissolution, revival, and amalgamation filings</li>
            </ul>
            <p><strong>CRS — Corporate Registry Services is not a law firm and does not provide legal advice.</strong> Our services are document preparation and filing services for self-represented clients. If you require legal advice, please consult a qualified lawyer.</p>

            <h2>2. Orders and Quotes</h2>
            <p>Submitting a request through our website constitutes a request for a quote, not a completed purchase. An order is confirmed only when:</p>
            <ul>
              <li>You receive a written quote from CRS — Corporate Registry Services, and</li>
              <li>You accept the quote and provide payment.</li>
            </ul>
            <p>We reserve the right to decline any order at our discretion.</p>

            <h2>3. Fees and Payment</h2>
            <ul>
              <li>All fees are quoted in Canadian dollars (CAD).</li>
              <li>Quoted fees include applicable government fees unless otherwise stated.</li>
              <li>Payment is due before we commence work on your order unless otherwise agreed in writing.</li>
              <li>Accepted payment methods include Interac e-Transfer, credit card, and debit.</li>
            </ul>

            <h2>4. Turnaround Times</h2>
            <p>Estimated turnaround times are provided in good faith based on typical government processing times. CRS — Corporate Registry Services is not responsible for delays caused by government registries, system outages, or information that is inaccurate or incomplete at the time of filing.</p>

            <h2>5. Accuracy of Information</h2>
            <p>You are responsible for ensuring that all information provided to CRS — Corporate Registry Services is accurate, complete, and current. CRS — Corporate Registry Services is not liable for errors, rejections, or additional costs arising from inaccurate or incomplete information provided by you.</p>

            <h2>6. Refunds and Cancellations</h2>
            <ul>
              <li>Orders cancelled before work has commenced are eligible for a full refund.</li>
              <li>Orders cancelled after work has commenced may be subject to a partial refund at our discretion.</li>
              <li>Government fees that have already been submitted to a registry are non-refundable.</li>
              <li>Completed orders are non-refundable.</li>
            </ul>

            <h2>7. Limitation of Liability</h2>
            <p>To the maximum extent permitted by applicable law, CRS — Corporate Registry Services&apos;s total liability to you for any claim arising from or related to our services shall not exceed the total fees you paid for the specific service giving rise to the claim.</p>
            <p>CRS — Corporate Registry Services is not liable for:</p>
            <ul>
              <li>Indirect, incidental, or consequential damages</li>
              <li>Loss of business, revenue, or profits</li>
              <li>Government registry errors or delays</li>
              <li>Reliance on documents retrieved on your behalf without independent verification</li>
            </ul>

            <h2>8. Intellectual Property</h2>
            <p>All content on corporateregistryservices.ca — including text, graphics, and software — is the property of CRS — Corporate Registry Services and may not be reproduced without written permission. Documents retrieved or prepared on your behalf are your property upon payment in full.</p>

            <h2>9. Governing Law</h2>
            <p>These Terms are governed by the laws of the Province of Alberta and the federal laws of Canada applicable therein, without regard to conflict of law principles. Any disputes shall be subject to the exclusive jurisdiction of the courts of Alberta.</p>

            <h2>10. Changes to These Terms</h2>
            <p>We may update these Terms from time to time. The current version will always be posted at <a href="/terms">corporateregistryservices.ca/terms</a> with the &ldquo;Last updated&rdquo; date. Continued use of our services after changes constitutes acceptance.</p>

            <h2>11. Contact</h2>
            <p>Questions about these Terms? Contact us at <a href="mailto:support@corporateregistryservices.ca">support@corporateregistryservices.ca</a>.</p>

          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
