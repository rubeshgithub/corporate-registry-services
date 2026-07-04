import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ReportOrderFlow from "@/components/order/ReportOrderFlow";
import { REPORT_CONFIGS } from "@/lib/report-config";

export const metadata: Metadata = {
  title: "Order a Certificate of Good Standing — $79 all-in + GST — CRS",
  description:
    "Government-issued Certificate of Good Standing for any Canadian corporation. Look up the company, confirm, pay $79 all-in + GST. Delivered as PDF within hours.",
  robots: { index: false, follow: false },
};

export default function GoodStandingOrderPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense fallback={<div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
          <ReportOrderFlow config={REPORT_CONFIGS["good-standing"]} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
