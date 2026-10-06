import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy Policy — CRS — Corporate Registry Services",
  description: "CRS — Corporate Registry Services privacy policy — how we collect, use, and protect your personal information.",
};

const LAST_UPDATED = "October 6, 2026";

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

            <p>CRS — Corporate Registry Services (&ldquo;CRS&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is an independent filing agent based in Calgary, Alberta. This policy explains what personal information we collect when you use <strong>corporateregistryservices.ca</strong> or order from us, why, who we share it with, how long we keep it, and your rights. We follow Canada&rsquo;s <em>Personal Information Protection and Electronic Documents Act</em> (PIPEDA), Alberta&rsquo;s <em>Personal Information Protection Act</em>, and, for clients in Qu&eacute;bec, Qu&eacute;bec&rsquo;s private-sector privacy law.</p>

            <h2 id="officer">1. Who is responsible</h2>
            <p>Our Privacy Officer is accountable for how we handle personal information and answers every privacy question and request:</p>
            <ul>
              <li><strong>Privacy Officer, CRS — Corporate Registry Services</strong></li>
              <li><strong>Email:</strong> <a href="mailto:support@corporateregistryservices.ca">support@corporateregistryservices.ca</a> (please put &ldquo;Privacy&rdquo; in the subject)</li>
              <li><strong>Mail:</strong> 2618 Hopewell Pl NE, Calgary, AB T1Y 7J7</li>
            </ul>

            <h2>2. What we collect</h2>
            <ul>
              <li><strong>Contact details</strong> — your name, email address and phone number.</li>
              <li><strong>Order details</strong> — the corporation, the service, and the information a registry needs to file for you (for example directors, addresses, share details). Much of this is already on the public corporate register.</li>
              <li><strong>Registry access codes</strong> — if you give us a corporation&rsquo;s registry password or key (such as an Ontario Company Key or a BC company password). It is encrypted before it leaves our website and is stored encrypted; only the staff filing your order can open it.</li>
              <li><strong>Payment</strong> — handled by Stripe. We see that you paid, the amount, the tax and your billing province or country; we never see or store your full card number.</li>
              <li><strong>Messages</strong> — emails, form messages and notes of phone calls with you.</li>
              <li><strong>Order forms you start but don&rsquo;t finish</strong> — our order forms save your contact details and the corporation you picked as you type, so that we can help you finish, including by phone. We don&rsquo;t send marketing email on the strength of an unfinished form.</li>
              <li><strong>Searches</strong> — the company names or numbers you search for on our site.</li>
              <li><strong>How you use the site</strong> — pages visited, the page you came from, the device and browser type, your country, and a scrambled (hashed) form of your IP address, recorded by our own analytics under a random session identifier.</li>
            </ul>

            <h2 id="cookies">3. Cookies and analytics</h2>
            <ul>
              <li><strong><code>crs_session_id</code></strong> — our own cookie, kept for 30 days. It holds a random identifier that links the pages you view in a visit so we can see how people find and use the site. It does not identify you by name.</li>
              <li><strong>Google Analytics</strong> — Google&rsquo;s cookies measure visits and pages in aggregate. Google processes this data in the United States. You can opt out with Google&rsquo;s <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener">opt-out browser add-on</a> or by blocking cookies in your browser; the site still works.</li>
              <li>We do not use advertising or retargeting cookies, and we do not sell personal information.</li>
            </ul>

            <h2>4. Why we use it</h2>
            <ul>
              <li>To do what you asked: search, file, retrieve documents, deliver them, and invoice you.</li>
              <li>To answer you and follow up on a request or an unfinished order (usually by phone).</li>
              <li>To keep records the law requires (tax, accounting, and proof of what we filed).</li>
              <li>To send filing reminders and offers <strong>only</strong> where Canada&rsquo;s anti-spam law allows: when you ticked a box asking for them, or as a client or someone who asked us for something, within the time the law permits. Every such email says who we are and lets you unsubscribe in one step.</li>
              <li>To keep the site secure and understand how it is used, so we can improve it.</li>
            </ul>
            <p>We ask for your consent when we collect information, and you can withdraw it at any time (see section 8), subject to legal or contractual limits.</p>

            <h2 id="sharing">5. Who we share it with</h2>
            <p>We share personal information only to deliver our services, with organizations bound to protect it and to use it only for us:</p>
            <ul>
              <li><strong>Government registries and registry agents</strong> — to file or retrieve records for you (for example Alberta&rsquo;s registry agents, BC Registries, the Ontario Business Registry, Corporations Canada).</li>
              <li><strong>Stripe</strong> — payments and invoices.</li>
              <li><strong>Amazon Web Services</strong> — sending email and storing documents.</li>
              <li><strong>MongoDB Atlas</strong> — our database.</li>
              <li><strong>Render and OVHcloud</strong> — hosting our website and our internal order system.</li>
              <li><strong>Cloudflare</strong> — website security and delivery.</li>
              <li><strong>Microsoft 365</strong> — our email and business communications.</li>
              <li><strong>Google</strong> — website analytics (section 3).</li>
              <li><strong>Our accountant</strong> — financial records, as needed for tax filings.</li>
              <li><strong>Legal requirements</strong> — when the law, a court order or a regulator requires it.</li>
            </ul>
            <p id="outside-canada"><strong>Outside Canada.</strong> Some of these providers store or process information outside Canada, mainly in the United States. While it is there, it may be accessible to that country&rsquo;s courts, law enforcement and national security authorities. We choose providers with strong security and contractual protections.</p>

            <h2 id="retention">6. How long we keep it</h2>
            <ul>
              <li><strong>Orders, invoices and what we filed</strong> — seven years after the order, for tax and record-keeping.</li>
              <li><strong>Registry access codes</strong> — kept encrypted with the order they were given for; you can ask us to delete one at any time.</li>
              <li><strong>Enquiries and unfinished order forms that never became an order</strong> — up to 24 months after the last contact.</li>
              <li><strong>Website analytics</strong> — up to 24 months.</li>
              <li><strong>Unsubscribe requests</strong> — kept as long as needed to honour them.</li>
            </ul>
            <p>After that we delete or anonymize it. Backups are kept for up to 35 days.</p>

            <h2>7. How we protect it</h2>
            <p>Encrypted connections (HTTPS) everywhere; registry codes encrypted on our server before they are passed to anyone, and stored encrypted; staff access by individual sign-in, limited to what each person needs; encrypted, access-controlled storage; and daily backups. No system is perfect: if a breach creates a real risk of significant harm to you, we will tell you and the Privacy Commissioner as the law requires, and we keep a record of every breach.</p>

            <h2 id="rights">8. Your rights</h2>
            <ul>
              <li>See the personal information we hold about you, and learn how it has been used and shared.</li>
              <li>Have it corrected if it is wrong or incomplete.</li>
              <li>Withdraw consent — for example, stop marketing email (use the unsubscribe link or reply &ldquo;unsubscribe&rdquo;).</li>
              <li>Ask us to delete it, unless we must keep it by law (such as the seven-year tax record).</li>
            </ul>
            <p>Write to the Privacy Officer (section 1). We answer within 30 days and may need to confirm your identity first. There is no charge.</p>
            <p><strong>Complaints.</strong> If you are not satisfied with our answer, you can contact the <a href="https://www.priv.gc.ca" target="_blank" rel="noopener">Office of the Privacy Commissioner of Canada</a>, Alberta&rsquo;s <a href="https://oipc.ab.ca" target="_blank" rel="noopener">Information and Privacy Commissioner</a>, or, in Qu&eacute;bec, the <a href="https://www.cai.gouv.qc.ca" target="_blank" rel="noopener">Commission d&rsquo;acc&egrave;s &agrave; l&rsquo;information</a>.</p>

            <h2>9. Links to other sites</h2>
            <p>Our pages link to government registries and other sites. Their privacy practices are their own; please read their policies.</p>

            <h2>10. Children</h2>
            <p>Our services are for businesses and adults. We do not knowingly collect information from anyone under 18.</p>

            <h2>11. Changes to this policy</h2>
            <p>We will post any change here with a new &ldquo;Last updated&rdquo; date, and tell clients directly about any significant change.</p>

          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
