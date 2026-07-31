import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SearchOrderRouter from "./SearchOrderRouter";

export const metadata: Metadata = {
  title: "Order a Corporate Name Search — $49 all-in + GST — CRS",
  description:
    "Government-direct corporate name search across Canadian registries. $49 all-in + GST. Results by email within one business hour.",
  robots: { index: false, follow: false },
};

/**
 * Corporate search order page with dual flows:
 * 1. When `src=article-status-search-*`: Show found corporation details + service selection
 *    (visitor searched on an article, found a corp, now ordering a service on it)
 * 2. Otherwise: Show name search form
 *    (visitor wants to propose/search for a corporate name to check availability)
 */
export default function CorporateSearchOrderPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense fallback={<div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
          <SearchOrderRouter />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
