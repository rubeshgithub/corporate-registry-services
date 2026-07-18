import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NfpConsultationForm from "./NfpConsultationForm";
import { breadcrumbLd, faqLd, jsonLdScript } from "@/lib/structured-data";

/**
 * /not-for-profit/book-free-consultation
 *
 * Dedicated route that overrides the [section]/[slug] catch-all. The slug
 * still appears in content/not-for-profit/book-free-consultation.md so the
 * sitemap and pillar-page card-grid know about it, but the form itself
 * needs a stateful React client component — hence a real route.
 *
 * Confirmation UX mirrors the MinuteBook pilot pattern: on submit, we
 * flash "we'll reach out within one business day" — no calendar link, no
 * scheduling widget.
 */

export const metadata: Metadata = {
  title:       "Free Not-for-Profit Incorporation Consultation — CRS",
  description: "Book a free 30-minute consultation to incorporate your not-for-profit anywhere in Canada. Name pre-screen, board check, and written filing checklist — no obligation.",
  alternates:  { canonical: "/not-for-profit/book-free-consultation" },
};

const FAQ = [
  {
    q: "Is the consultation really free?",
    a: "Yes. The 30-minute consultation, the name pre-screen, and the written filing checklist are free with no obligation. You only pay if you choose to have CRS prepare and file your incorporation, minute book, or annual returns — and we quote those fees before any work starts.",
  },
  {
    q: "Why do you ask for three name options?",
    a: "Every registry rejects names that conflict with existing corporations or trademarks. Bringing three ranked options means that if your first choice fails the NUANS or registry search, we move to the next immediately instead of restarting the process — and you keep your filing timeline.",
  },
  {
    q: "What if I don't have a full board yet?",
    a: "Book anyway. Requirements range from one director federally to three in most provinces, and five members or incorporators in provinces like Alberta and Nova Scotia. Your specialist will tell you exactly how many people you need, what roles to fill, and what information each person must provide.",
  },
  {
    q: "Do you handle both federal and provincial incorporation?",
    a: "Yes — CRS files in all 14 Canadian jurisdictions: federally under the Canada Not-for-profit Corporations Act and in every province and territory under their societies and not-for-profit corporations legislation. If you're unsure which is right, that's the first question the consultation answers.",
  },
];

export default function BookConsultationPage() {
  const breadcrumb = breadcrumbLd([
    { name: "Home",                   url: "/" },
    { name: "Not-for-Profit",         url: "/not-for-profit" },
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
            <a href="/not-for-profit" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Not-for-Profit</a>
            <span>/</span>
            <span style={{ color: "var(--text)" }}>Free Consultation</span>
          </div>
        </div>

        <div style={{ maxWidth: "860px", margin: "0 auto", padding: "2.5rem 1.5rem 1rem" }}>
          <span className="category-chip" style={{ display: "inline-block", marginBottom: "0.75rem" }}>
            Free · No obligation
          </span>
          <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 700, lineHeight: 1.2, color: "var(--text)", marginBottom: "0.6rem" }}>
            Book Your Free Not-for-Profit Consultation
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            One 30-minute call with an incorporation specialist. Your three proposed names pre-screened, your board checked against your jurisdiction's requirements, and a written filing plan — federal or any of the 13 provinces / territories.
          </p>
        </div>

        <Suspense
          fallback={
            <div style={{ maxWidth: 860, margin: "0 auto", padding: "2rem 1.5rem", color: "var(--text-muted)" }}>
              Loading form…
            </div>
          }
        >
          <NfpConsultationForm />
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
