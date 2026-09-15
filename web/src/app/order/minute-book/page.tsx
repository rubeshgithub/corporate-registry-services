import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MinuteBookOrderFlow from "./MinuteBookOrderFlow";

export const metadata: Metadata = {
  title:       "Order a Corporate Minute Book — Alberta, BC, Ontario & Federal",
  description: "Rebuild your corporation's minute book from the official registry record. Age-based all-inclusive pricing, profile report included.",
  robots:      { index: false, follow: false },
};

export default function MinuteBookOrderPage() {
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
          <MinuteBookOrderFlow />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
