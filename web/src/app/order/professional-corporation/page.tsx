import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProCorpOrderFlow from "@/components/order/ProCorpOrderFlow";
import { getPrices } from "@/lib/pricing";

/**
 * Dedicated professional-corporation order page — lookup first, then pick
 * the service. Noindex like every other /order/* page: these are checkout
 * surfaces, not landing pages. The indexable equivalent is
 * /professional-corporation.
 */
export const metadata: Metadata = {
  title: "Professional Corporation Services — Find Your Corporation — CRS",
  description:
    "Search your professional corporation and order a profile report, annual return, change of information, or revival — priced for professional corporations.",
  robots: { index: false, follow: false },
};

export default async function ProCorpOrderPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense fallback={<div style={{ maxWidth: 680, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
          <ProCorpOrderFlow prices={await getPrices()} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
