import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import OrderFlow from "./OrderFlow";
import { getPriceCents, swapPrice } from "@/lib/pricing";

const BASE_METADATA: Metadata = {
  title: "File your Annual Return — $99 all-in + GST — CRS",
  description:
    "File your Canadian corporate annual return through CRS. Look up your company, confirm what changed, pay $99 all-in + GST. Filed within 24 hours.",
  robots: { index: false, follow: false }, // checkout page; keep out of the index
};

/* Title and description quote the price, so they are generated per
   request from the pricing catalogue rather than baked in at build.
   Keeps the tab title honest when an operator changes a price. */
export async function generateMetadata(): Promise<Metadata> {
  const cents = await getPriceCents("annual-return");
  return {
    ...BASE_METADATA,
    title:       swapPrice(String(BASE_METADATA.title ?? ""), cents),
    description: swapPrice(String(BASE_METADATA.description ?? ""), cents),
  };
}

export default async function AnnualReturnOrderPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense
          fallback={
            <div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>
              Loading…
            </div>
          }
        >
          <OrderFlow perYearCents={await getPriceCents("annual-return")} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
