import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NameSearchOrderFlow from "@/components/order/NameSearchOrderFlow";
import { NAME_SEARCH_CONFIGS } from "@/lib/name-search-config";

export const metadata: Metadata = {
  title: "Order a Corporate Name Search — $49 all-in + GST — CRS",
  description:
    "Government-direct corporate name search across Canadian registries. $49 all-in + GST. Results by email within one business hour.",
  robots: { index: false, follow: false },
};

export default function CorporateSearchOrderPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense fallback={<div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
          <NameSearchOrderFlow config={NAME_SEARCH_CONFIGS["corporate-search"]} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
