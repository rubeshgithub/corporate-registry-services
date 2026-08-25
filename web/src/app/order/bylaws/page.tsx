import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CorpDocOrderFlow from "@/components/order/CorpDocOrderFlow";
import { CORP_DOC_CONFIGS } from "@/lib/corp-doc-config";
import { withLivePrice, getPriceCents, swapPrice } from "@/lib/pricing";

const BASE_METADATA: Metadata = {
  title: "Order Corporate By-Laws — $99 all-in + GST — CRS",
  description:
    "Order professionally drafted corporate By-Law No. 1 for your Canadian corporation, or an amendment to an existing by-law. Standard or custom provisions. Delivered as ready-to-sign PDFs within 1 business day. $99 all-in + GST.",
  robots: { index: false, follow: false },
};

/* Title and description quote the price, so they are generated per
   request from the pricing catalogue rather than baked in at build.
   Keeps the tab title honest when an operator changes a price. */
export async function generateMetadata(): Promise<Metadata> {
  const cents = await getPriceCents("bylaws");
  return {
    ...BASE_METADATA,
    title:       swapPrice(String(BASE_METADATA.title ?? ""), cents),
    description: swapPrice(String(BASE_METADATA.description ?? ""), cents),
  };
}

export default async function BylawsOrderPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense fallback={<div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
          <CorpDocOrderFlow config={await withLivePrice(CORP_DOC_CONFIGS["bylaws"], "bylaws")} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
