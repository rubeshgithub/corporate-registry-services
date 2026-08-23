import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GenericServiceOrderFlow from "@/components/order/GenericServiceOrderFlow";
import { SERVICE_BUCKETS, findService } from "@/lib/service-config";

/**
 * Generic per-service checkout. Covers every catalogue service that has a
 * price but no bespoke flow of its own, so nothing in the catalogue has to
 * fall back to a manual quote.
 *
 * Noindex like every other /order/* page — these are checkout surfaces.
 */

type Params = { key: string };

export function generateStaticParams(): Params[] {
  return SERVICE_BUCKETS
    .flatMap((b) => b.services)
    .filter((s) => s.priceCents != null && !s.orderPath)
    .map((s) => ({ key: s.key }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { key } = await params;
  const service = findService(key);
  if (!service) return { title: "Order — CRS", robots: { index: false, follow: false } };
  return {
    title: `Order ${service.label} — ${service.estimatedFee} — CRS`,
    description: service.description,
    robots: { index: false, follow: false },
  };
}

export default async function GenericServiceOrderPage({ params }: { params: Promise<Params> }) {
  const { key } = await params;
  const service = findService(key);

  /* Only services without a dedicated flow are served here. Anything with
     its own orderPath belongs on that page, so 404 rather than offering a
     second checkout for the same thing. */
  if (!service || service.priceCents == null || service.orderPath) notFound();

  return (
    <>
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        <Suspense fallback={<div style={{ maxWidth: 620, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)" }}>Loading…</div>}>
          <GenericServiceOrderFlow service={service} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
