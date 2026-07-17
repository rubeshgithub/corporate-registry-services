import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CorpDocOrderFlow from "@/components/order/CorpDocOrderFlow";
import { CORP_DOC_CONFIGS } from "@/lib/corp-doc-config";

export const metadata: Metadata = {
  title: "Order a Director Resolution — $79 all-in + GST — CRS",
  description:
    "Order a professionally drafted director resolution — annual package, share issuance, officer appointment, banking, or ad-hoc. Delivered as ready-to-sign PDFs within 1 business day. $79 all-in + GST.",
  robots: { index: false, follow: false },
};

export default function DirectorResolutionOrderPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense fallback={<div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
          <CorpDocOrderFlow config={CORP_DOC_CONFIGS["director-resolution"]} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
