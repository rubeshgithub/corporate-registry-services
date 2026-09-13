import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import IncorporationOrderFlow from "./IncorporationOrderFlow";
import { getPrices } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Incorporate your company — CRS",
  description:
    "Incorporate federally or in any Canadian province through CRS. Named or numbered. All-in pricing. Filed within 1 business day.",
  robots: { index: false, follow: false },
};

/* Prices come from the catalogue, so the picker must re-render when an admin
   changes one — 60s ISR, same as every other price-quoting order page. Before
   this the flow hardcoded 699/749/299 and the page passed nothing, so an
   override reached the Stripe charge but never the screen. */
export const revalidate = 60;

export default async function IncorporationOrderPage() {
  const prices = await getPrices();
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
          <IncorporationOrderFlow prices={prices} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
