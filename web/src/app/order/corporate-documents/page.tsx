import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CorporateDocumentsFlow from "@/components/order/CorporateDocumentsFlow";

export const metadata: Metadata = {
  title: "Order Corporate Documents — Articles + Historical Filings — CRS",
  description:
    "Order the full set of corporate documents on file — articles of incorporation, historical filings, annual returns, director/address changes. Government-direct retrieval. Quote in a few hours, delivered within 24 hours of approval.",
  robots: { index: false, follow: false },
};

export default function CorporateDocumentsOrderPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense fallback={<div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
          <CorporateDocumentsFlow />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
