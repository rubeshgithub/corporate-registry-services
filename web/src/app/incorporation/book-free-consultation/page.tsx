import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import IncorporationConsultationForm from "./IncorporationConsultationForm";
import { breadcrumbLd, faqLd, jsonLdScript } from "@/lib/structured-data";

/**
 * /incorporation/book-free-consultation
 *
 * Dedicated route that overrides the [section]/[slug] catch-all for
 * /incorporation/*. Mirrors the NFP consultation page pattern. A stub
 * content/incorporation/book-free-consultation.md exists so the sitemap
 * and internal linking know about the page, but the form itself is a
 * stateful React client component.
 *
 * Confirmation UX matches the NFP + MinuteBook pilot pattern: on submit,
 * flash "we'll reach out within one business day" — no calendar link.
 */

export const metadata: Metadata = {
  title:       "Free Incorporation Consultation — Federal or Provincial | CRS",
  description: "Book a free 30-minute consultation before you incorporate. Federal vs. provincial recommendation, name pre-screen, director residency check, and a written filing plan — no obligation.",
  alternates:  { canonical: "/incorporation/book-free-consultation" },
};

const FAQ = [
  {
    q: "Is the consultation really free?",
    a: "Yes. The 30-minute consultation, the name pre-screen, and the written filing checklist are free with no obligation. You only pay if you choose to have CRS prepare and file your incorporation, minute book, or annual returns — and we quote those fees before any work starts.",
  },
  {
    q: "I haven't decided federal vs. provincial yet. Should I still book?",
    a: "Yes — that's the first question the consultation answers. Tick 'I just want to talk first' on the contact step and the form skips straight to submit. On the call the specialist walks through your operations, expansion plans, director residency, and name-protection scope, then recommends the right jurisdiction.",
  },
  {
    q: "Why do you ask for three name options?",
    a: "Every registry rejects names that conflict with existing corporations or trademarks. Bringing three ranked options means that if your first choice fails the NUANS or registry search, we move to the next immediately instead of restarting the process — and you keep your filing timeline. If you're going numbered, you can skip the names entirely.",
  },
  {
    q: "What if I don't have all my directors lined up yet?",
    a: "All Canadian jurisdictions allow a corporation to be incorporated with a single director. You can add more directors later by resolution — the specialist will walk you through the timing and any residency rules that apply.",
  },
  {
    q: "Do you handle federal, all provinces, and all territories?",
    a: "Yes — CRS files incorporations under the Canada Business Corporations Act (CBCA) and in every province and territory under their business corporations acts. Same $699 all-in fee regardless of jurisdiction.",
  },
];

export default function BookIncorporationConsultationPage() {
  const breadcrumb = breadcrumbLd([
    { name: "Home",           url: "/" },
    { name: "Incorporation",  url: "/incorporation" },
    { name: "Free Consultation" },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(breadcrumb)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(faqLd(FAQ))} />
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <div style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-deep)" }}>
          <div style={{ maxWidth: "860px", margin: "0 auto", padding: "0.75rem 1.5rem", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
            <a href="/" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Home</a>
            <span>/</span>
            <a href="/incorporation" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Incorporation</a>
            <span>/</span>
            <span style={{ color: "var(--text)" }}>Free Consultation</span>
          </div>
        </div>

        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2.5rem 1.5rem 1rem" }}>
          <span className="category-chip" style={{ display: "inline-block", marginBottom: "0.75rem" }}>
            Free · No obligation
          </span>
          <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 700, lineHeight: 1.2, color: "var(--text)", marginBottom: "0.6rem" }}>
            Book Your Free Incorporation Consultation
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            One 30-minute call with an incorporation specialist. Federal vs. provincial recommendation for your situation, your name options pre-screened against NUANS or the provincial registry, director residency confirmed, and a written filing plan — federal or any of the 13 provinces / territories.
          </p>
        </div>

        <Suspense
          fallback={
            <div style={{ maxWidth: 860, margin: "0 auto", padding: "2rem 1.5rem", color: "var(--text-muted)" }}>
              Loading form…
            </div>
          }
        >
          <IncorporationConsultationForm />
        </Suspense>

        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "1.5rem 1.5rem 4rem" }}>
          <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.4rem", fontWeight: 700, color: "var(--text)", marginTop: "3rem", marginBottom: "1rem" }}>
            Frequently asked questions
          </h2>
          {FAQ.map((item) => (
            <div key={item.q} style={{ marginBottom: "1.2rem" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.35rem" }}>{item.q}</h3>
              <p style={{ fontSize: "0.92rem", color: "var(--text-muted)", lineHeight: 1.6, margin: 0 }}>{item.a}</p>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
