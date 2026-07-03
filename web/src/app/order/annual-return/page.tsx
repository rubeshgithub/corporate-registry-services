import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import OrderFlow from "./OrderFlow";

export const metadata: Metadata = {
  title: "File your Annual Return — $99 all-in + GST — CRS",
  description:
    "File your Canadian corporate annual return through CRS. Look up your company, confirm what changed, pay $99 all-in + GST. Filed within 24 hours.",
  robots: { index: false, follow: false }, // checkout page; keep out of the index
};

export default function AnnualReturnOrderPage() {
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
          <OrderFlow />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
