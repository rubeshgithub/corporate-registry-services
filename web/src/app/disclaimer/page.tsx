import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Disclaimer — CRS — Corporate Registry Services",
  description:
    "Important disclaimer regarding the accuracy, completeness, and use of the publicly available Canadian corporate registry information presented through CRS — Corporate Registry Services.",
};

const LAST_UPDATED = "July 6, 2026";

const SECTIONS = [
  {
    number: "1",
    title: "Data Accuracy and Currency",
    body: [
      "The business registry search results displayed on this website reflect information that is available to the public as published by the provincial, territorial, and federal corporate registries in Canada. CRS — Corporate Registry Services does not own, operate, or control any of these registries or their underlying records.",
      "While we make reasonable efforts to present the information accurately, we cannot guarantee that the data returned is complete, current, or free from error. Registry records may be delayed by hours or days relative to the underlying government records. Corporate status, director information, registered addresses, and other details can change without notice.",
      "You should not rely on search results displayed on this website as definitive proof of a corporation's legal status, good standing, or any other corporate attribute.",
    ],
  },
  {
    number: "2",
    title: "Official Documents for Legal Purposes",
    body: [
      "For any legally binding or official purpose — including due diligence, financing transactions, legal proceedings, regulatory filings, or compliance requirements — you must obtain certified documents from the relevant provincial, territorial, or federal corporate registry.",
      "A corporate profile report or certificate of good standing issued directly by the applicable registry is the only authoritative confirmation of a corporation's status. CRS — Corporate Registry Services can obtain these official documents on your behalf — please use our order form to request them.",
    ],
  },
  {
    number: "3",
    title: "Not Legal Advice",
    body: [
      "The information provided through this website, including registry search results, guides, articles, and any other content, does not constitute legal, corporate, tax, accounting, or professional advice of any kind.",
      "CRS — Corporate Registry Services is a document preparation and registry filing service. We are not a law firm, and we do not provide legal advice. No information on this website creates a solicitor-client or professional-client relationship.",
      "If you require legal advice regarding a corporation's status, its obligations, a corporate transaction, or any other matter, please consult a qualified lawyer licensed in the relevant jurisdiction. If you require accounting or tax advice, please consult a qualified accountant or CPA.",
    ],
  },
  {
    number: "4",
    title: "Source of Registry Information",
    body: [
      "The registry search feature on this website presents information that is made available to the public by Canada's provincial, territorial, and federal corporate registries.",
      "This information is accessed in good faith and presented for general informational purposes only. Its presentation on this website is not endorsed, certified, or otherwise sanctioned by any government authority, and all rights in the underlying data remain with the respective registry authorities.",
    ],
  },
  {
    number: "5",
    title: "No Affiliation with Government Registries",
    body: [
      "CRS — Corporate Registry Services is an independent, privately operated service. We are not affiliated with, endorsed by, sponsored by, or an official agent of any federal, provincial, or territorial government or registry authority in Canada.",
      "Use of the name 'Corporate Registry Services', references to publicly available registry information, or display of registry data on this website does not imply any official relationship with any government body.",
      "The official corporate registries can be accessed directly through each province, territory, or the federal government's respective official channels. CRS — Corporate Registry Services provides a convenience search and document-retrieval service to help Canadians navigate corporate registry information more efficiently.",
    ],
  },
  {
    number: "6",
    title: "Limitation of Liability",
    body: [
      "To the maximum extent permitted by applicable law, CRS — Corporate Registry Services shall not be liable for any loss, damage, or expense — direct, indirect, or consequential — arising from your reliance on registry search results or other information displayed on this website.",
      "This includes, without limitation, losses arising from: decisions made on the basis of inaccurate or out-of-date registry information; failure to obtain certified documents for legal or regulatory purposes; or any errors, omissions, delays, or interruptions in the information published by the underlying registries.",
    ],
  },
  {
    number: "7",
    title: "Changes to This Disclaimer",
    body: [
      "We may update this Disclaimer from time to time to reflect changes in our services or applicable law. The current version will always be posted at corporateregistryservices.ca/disclaimer with the “Last updated” date shown above.",
    ],
  },
  {
    number: "8",
    title: "Contact",
    body: [
      "If you have questions about the information displayed on this website or about this Disclaimer, please contact us:",
    ],
    contact: true,
  },
];

export default function DisclaimerPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1 }}>
        {/* Header strip */}
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            background: "linear-gradient(160deg,#E8F4FD 0%,#F8FAFC 100%)",
            padding: "3rem 1.5rem",
          }}
        >
          <div style={{ maxWidth: "760px", margin: "0 auto" }}>
            <span
              style={{
                fontFamily: "var(--font-mono),monospace",
                fontSize: "0.7rem",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                color: "var(--gold)",
                display: "block",
                marginBottom: "0.75rem",
              }}
            >
              Legal
            </span>
            <h1
              style={{
                fontFamily: "var(--font-display),Georgia,serif",
                fontSize: "clamp(1.75rem,3vw,2.5rem)",
                fontWeight: 700,
                color: "var(--text)",
                marginBottom: "0.5rem",
              }}
            >
              Disclaimer
            </h1>
            <p
              style={{
                fontSize: "0.82rem",
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono),monospace",
                marginBottom: "0.75rem",
              }}
            >
              Last updated: {LAST_UPDATED}
            </p>
            <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", lineHeight: 1.7, maxWidth: "54ch" }}>
              This Disclaimer applies to all information provided through{" "}
              <strong>corporateregistryservices.ca</strong>, including the
              Canadian corporate registry search tool and all related content.
              Please read it carefully before using our services.
            </p>
          </div>
        </div>

        {/* Quick-nav summary box */}
        <div style={{ maxWidth: "760px", margin: "0 auto", padding: "2.5rem 1.5rem 0" }}>
          <div
            style={{
              background: "var(--bg-deep)",
              border: "1px solid var(--border)",
              borderLeft: "3px solid var(--gold)",
              borderRadius: "0.75rem",
              padding: "1.25rem 1.5rem",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-mono),monospace",
                fontSize: "0.68rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
                marginBottom: "0.75rem",
              }}
            >
              Key Points
            </p>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {[
                "Registry information reflects data made publicly available by provincial, territorial, and federal corporate registries and may not be current.",
                "Always obtain certified documents from the relevant registry for any legal or official purpose.",
                "Nothing on this website constitutes legal, corporate, or professional advice.",
                "CRS is an independent service — not affiliated with any government registry or authority.",
                "Governed by Alberta law. Contact: support@corporateregistryservices.ca",
              ].map((point) => (
                <li key={point} style={{ fontSize: "0.83rem", color: "var(--text)", lineHeight: 1.6 }}>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Body */}
        <article style={{ maxWidth: "760px", margin: "0 auto", padding: "2.5rem 1.5rem 5rem" }}>
          <div className="prose">
            {SECTIONS.map((s) => (
              <div key={s.number}>
                <h2>{s.number}. {s.title}</h2>
                {s.body.map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
                {"contact" in s && s.contact && (
                  <ul>
                    <li>
                      <strong>Email:</strong>{" "}
                      <a href="mailto:support@corporateregistryservices.ca">
                        support@corporateregistryservices.ca
                      </a>
                    </li>
                    <li>
                      <strong>Website:</strong>{" "}
                      <a href="https://www.corporateregistryservices.ca">
                        www.corporateregistryservices.ca
                      </a>
                    </li>
                  </ul>
                )}
              </div>
            ))}
          </div>
        </article>
      </main>
      <Footer />
    </>
  );
}
