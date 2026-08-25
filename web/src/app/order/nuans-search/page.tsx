import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import NameSearchOrderFlow from "@/components/order/NameSearchOrderFlow";
import { NAME_SEARCH_CONFIGS } from "@/lib/name-search-config";
import { withLivePrice, getPriceCents, swapPrice } from "@/lib/pricing";

const BASE_METADATA: Metadata = {
  title: "Order a NUANS Name Search Report — $79 all-in + GST — CRS",
  description:
    "Federal NUANS name search required for incorporations and name changes. $79 all-in + GST. Delivered by email within one business hour.",
  robots: { index: false, follow: false },
};

/* Title and description quote the price, so they are generated per
   request from the pricing catalogue rather than baked in at build.
   Keeps the tab title honest when an operator changes a price. */
export async function generateMetadata(): Promise<Metadata> {
  const cents = await getPriceCents("nuans-search");
  return {
    ...BASE_METADATA,
    title:       swapPrice(String(BASE_METADATA.title ?? ""), cents),
    description: swapPrice(String(BASE_METADATA.description ?? ""), cents),
  };
}

export default async function NuansSearchOrderPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense fallback={<div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
          <NameSearchOrderFlow config={await withLivePrice(NAME_SEARCH_CONFIGS["nuans-search"], "nuans-search")} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
