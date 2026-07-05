import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ChangeOrderFlow from "@/components/order/ChangeOrderFlow";
import { CHANGE_CONFIGS } from "@/lib/change-config";

export const metadata: Metadata = {
  title: "File a Voluntary Dissolution — $399 all-in + GST — CRS",
  description:
    "Formally dissolve your Canadian corporation with the government registry. $399 all-in + GST. Filed within 24 hours.",
  robots: { index: false, follow: false },
};

export default function VoluntaryDissolutionOrderPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense fallback={<div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
          <ChangeOrderFlow config={CHANGE_CONFIGS["voluntary-dissolution"]} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
