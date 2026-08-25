import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ReportOrderFlow from "@/components/order/ReportOrderFlow";
import { REPORT_CONFIGS } from "@/lib/report-config";
import { withLivePrice, getPriceCents, swapPrice } from "@/lib/pricing";

const BASE_METADATA: Metadata = {
  title: "Order a Certificate of Good Standing — $79 all-in + GST — CRS",
  description:
    "Government-issued Certificate of Good Standing for any Canadian corporation. Look up the company, confirm, pay $79 all-in + GST. Delivered as PDF within hours.",
  robots: { index: false, follow: false },
};

/* Title and description quote the price, so they are generated per
   request from the pricing catalogue rather than baked in at build.
   Keeps the tab title honest when an operator changes a price. */
export async function generateMetadata(): Promise<Metadata> {
  const cents = await getPriceCents("good-standing");
  return {
    ...BASE_METADATA,
    title:       swapPrice(String(BASE_METADATA.title ?? ""), cents),
    description: swapPrice(String(BASE_METADATA.description ?? ""), cents),
  };
}

export default async function GoodStandingOrderPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense fallback={<div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
          <ReportOrderFlow config={await withLivePrice(REPORT_CONFIGS["good-standing"], "good-standing")} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
