import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ReportOrderFlow from "@/components/order/ReportOrderFlow";
import { REPORT_CONFIGS } from "@/lib/report-config";

export const metadata: Metadata = {
  title: "Order a Corporate Profile Report — $49 all-in + GST — CRS",
  description:
    "Government-direct Canadian corporate profile report. Look up the company, confirm, pay $49 all-in + GST. Delivered as PDF within one business hour.",
  robots: { index: false, follow: false },
};

export default function ProfileReportOrderPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense fallback={<div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
          <ReportOrderFlow config={REPORT_CONFIGS["profile-report"]} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
