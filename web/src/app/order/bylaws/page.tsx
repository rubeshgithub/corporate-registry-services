import { Suspense } from "react";
import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import CorpDocOrderFlow from "@/components/order/CorpDocOrderFlow";
import { CORP_DOC_CONFIGS } from "@/lib/corp-doc-config";

export const metadata: Metadata = {
  title: "Order Corporate By-Laws — $99 all-in + GST — CRS",
  description:
    "Order professionally drafted corporate By-Law No. 1 for your Canadian corporation, or an amendment to an existing by-law. Standard or custom provisions. Delivered as ready-to-sign PDFs within 1 business day. $99 all-in + GST.",
  robots: { index: false, follow: false },
};

export default function BylawsOrderPage() {
  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense fallback={<div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
          <CorpDocOrderFlow config={CORP_DOC_CONFIGS["bylaws"]} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
