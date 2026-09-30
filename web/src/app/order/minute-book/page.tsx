import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MinuteBookOrderFlow from "./MinuteBookOrderFlow";
import { getPrices } from "@/lib/pricing";
import { minuteBookPrices } from "@/lib/minute-book-config";

/* Prices are resolved from the catalogue at render — 60s ISR, same as the
   other price-quoting pages, so an operator's change shows within a minute. */
export const revalidate = 60;

export const metadata: Metadata = {
  title:       "Order a Corporate Minute Book — Alberta, BC, Ontario & Federal",
  description: "Rebuild your corporation's minute book from the official registry record. Age-based all-inclusive pricing, profile report included.",
  robots:      { index: false, follow: false },
};

export default async function MinuteBookOrderPage() {
  const prices = minuteBookPrices(await getPrices());
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense
          fallback={
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>
              Loading…
            </div>
          }
        >
          <MinuteBookOrderFlow prices={prices} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
