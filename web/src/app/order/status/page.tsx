import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import StatusLookup from "./StatusLookup";

export const metadata: Metadata = {
  title: "Check order status — CRS",
  description:
    "Look up the status of a CRS filing order using the reference number in your confirmation email.",
  robots: { index: false, follow: false },
};

export default function OrderStatusPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)", padding: "3rem 1.5rem" }}>
        <StatusLookup />
      </main>
      <Footer />
    </>
  );
}
