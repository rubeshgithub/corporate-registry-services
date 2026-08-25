import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SearchOrderRouter from "./SearchOrderRouter";
import { withLivePrice, getPriceCents, swapPrice } from "@/lib/pricing";
import { NAME_SEARCH_CONFIGS } from "@/lib/name-search-config";

const BASE_METADATA: Metadata = {
  title: "Order a Corporate Name Search — $49 all-in + GST — CRS",
  description:
    "Government-direct corporate name search across Canadian registries. $49 all-in + GST. Results by email within one business hour.",
  robots: { index: false, follow: false },
};

/* Title and description quote the price, so they are generated per
   request from the pricing catalogue rather than baked in at build.
   Keeps the tab title honest when an operator changes a price. */
export async function generateMetadata(): Promise<Metadata> {
  const cents = await getPriceCents("corporate-search");
  return {
    ...BASE_METADATA,
    title:       swapPrice(String(BASE_METADATA.title ?? ""), cents),
    description: swapPrice(String(BASE_METADATA.description ?? ""), cents),
  };
}

/**
 * Corporate search order page with dual flows:
 * 1. When `src=article-status-search-*`: Show found corporation details + service selection
 *    (visitor searched on an article, found a corp, now ordering a service on it)
 * 2. Otherwise: Show name search form
 *    (visitor wants to propose/search for a corporate name to check availability)
 */
export default async function CorporateSearchOrderPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense fallback={<div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
          <SearchOrderRouter nameSearchConfig={await withLivePrice(NAME_SEARCH_CONFIGS["corporate-search"], "corporate-search")} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
