import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import GenericServiceOrderFlow from "@/components/order/GenericServiceOrderFlow";
import { SERVICE_BUCKETS, findService, type ServiceItem } from "@/lib/service-config";
import { getPriceCents, priceKeyForService, swapPrice } from "@/lib/pricing";

/**
 * Generic per-service checkout. Covers every catalogue service that has a
 * price but no bespoke flow of its own, so nothing in the catalogue has to
 * fall back to a manual quote.
 *
 * Noindex like every other /order/* page — these are checkout surfaces.
 */

/* The page quotes the catalogue price — 60s ISR, like every other /order page. */
export const revalidate = 60;

type Params = { key: string };

/** The service with its catalogue price applied to the amount and the label that quotes it. */
async function withLiveFee(service: ServiceItem): Promise<ServiceItem> {
  try {
    const cents = await getPriceCents(priceKeyForService(service.key));
    return { ...service, priceCents: cents, estimatedFee: swapPrice(service.estimatedFee, cents) };
  } catch {
    return service;   // not in the catalogue — keep the shipped copy
  }
}

export function generateStaticParams(): Params[] {
  return SERVICE_BUCKETS
    .flatMap((b) => b.services)
    .filter((s) => s.priceCents != null && !s.orderPath)
    .map((s) => ({ key: s.key }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { key } = await params;
  const found = findService(key);
  if (!found) return { title: "Order — CRS", robots: { index: false, follow: false } };
  const service = await withLiveFee(found);
  return {
    title: `Order ${service.label} — ${service.estimatedFee} — CRS`,
    description: service.description,
    robots: { index: false, follow: false },
  };
}

export default async function GenericServiceOrderPage({ params }: { params: Promise<Params> }) {
  const { key } = await params;
  const found = findService(key);

  /* Only services without a dedicated flow are served here. Anything with
     its own orderPath belongs on that page, so 404 rather than offering a
     second checkout for the same thing. */
  if (!found || found.priceCents == null || found.orderPath) notFound();
  const service = await withLiveFee(found);

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
