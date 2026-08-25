import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ReportOrderFlow from "@/components/order/ReportOrderFlow";
import { REPORT_CONFIGS } from "@/lib/report-config";
import { withLivePrice, getPriceCents, swapPrice } from "@/lib/pricing";

const BASE_METADATA: Metadata = {
  title: "Order a Corporate Profile Report — $49 all-in + GST — CRS",
  description:
    "Government-direct Canadian corporate profile report. Look up the company, confirm, pay $49 all-in + GST. Delivered as PDF within one business hour.",
  robots: { index: false, follow: false },
};

/* Title and description quote the price, so they are generated per
   request from the pricing catalogue rather than baked in at build.
   Keeps the tab title honest when an operator changes a price. */
export async function generateMetadata(): Promise<Metadata> {
  const cents = await getPriceCents("profile-report");
  return {
    ...BASE_METADATA,
    title:       swapPrice(String(BASE_METADATA.title ?? ""), cents),
    description: swapPrice(String(BASE_METADATA.description ?? ""), cents),
  };
}

export default async function ProfileReportOrderPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense fallback={<div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
          <ReportOrderFlow config={await withLivePrice(REPORT_CONFIGS["profile-report"], "profile-report")} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
