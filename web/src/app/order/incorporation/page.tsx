import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import IncorporationOrderFlow from "./IncorporationOrderFlow";

export const metadata: Metadata = {
  title: "Incorporate your company — CRS",
  description:
    "Incorporate federally or in any Canadian province through CRS. Named or numbered. All-in pricing. Filed within 24 hours.",
  robots: { index: false, follow: false },
};

export default function IncorporationOrderPage() {
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
          <IncorporationOrderFlow />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
