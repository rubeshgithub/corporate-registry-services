import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ChangeOrderFlow from "@/components/order/ChangeOrderFlow";
import { CHANGE_CONFIGS } from "@/lib/change-config";
import { withLivePrice, getPriceCents, swapPrice } from "@/lib/pricing";

const BASE_METADATA: Metadata = {
  title: "Change of Registered Office Address — $99 all-in + GST — CRS",
  description:
    "Update your corporation's registered office address on the Canadian corporate registry. $99 all-in + GST. Filed within 24 hours.",
  robots: { index: false, follow: false },
};

/* Title and description quote the price, so they are generated per
   request from the pricing catalogue rather than baked in at build.
   Keeps the tab title honest when an operator changes a price. */
export async function generateMetadata(): Promise<Metadata> {
  const cents = await getPriceCents("change-address");
  return {
    ...BASE_METADATA,
    title:       swapPrice(String(BASE_METADATA.title ?? ""), cents),
    description: swapPrice(String(BASE_METADATA.description ?? ""), cents),
  };
}

export default async function ChangeAddressOrderPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense fallback={<div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
          <ChangeOrderFlow config={await withLivePrice(CHANGE_CONFIGS["change-address"], "change-address")} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
