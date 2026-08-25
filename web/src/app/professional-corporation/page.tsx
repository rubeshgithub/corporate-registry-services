import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { ArrowRight, Check, Search, ShieldCheck } from "lucide-react";
import {
  PRO_CORP_SERVICES,
  PRO_CORP_ALL_SERVICES,
} from "@/lib/professional-corp";
import { breadcrumbLd, faqLd, jsonLdScript } from "@/lib/structured-data";
import { getPrices, getPriceCents, formatPriceLabel, formatCents } from "@/lib/pricing";
import { getPillar, listSection } from "@/lib/content";

/**
 * Public professional-corporation services hub — the indexable counterpart
 * to /order/professional-corporation.
 *
 * Editorial frame (matches the PC content cluster spec): a professional
 * corporation is a TWO-STEP product — incorporate at the registry AND hold
 * the regulator's permit / certificate of authorization — and both renew
 * annually. Every price on this page is the CRS registry-side fee; setup is
 * the one service that also carries the regulator's own fees.
 */

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.corporateregistryservices.ca";

/* Static page quoting live prices — revalidate so an admin change lands
   within a minute rather than at the next deploy. */
export const revalidate = 60;

/* The description quotes the setup price, so it is generated per request
   from the pricing catalogue — an indexable page must not advertise a
   figure the checkout will not honour. */
export async function generateMetadata(): Promise<Metadata> {
  const cents = await getPriceCents("pc-setup");
  return {
    title: "Professional Corporation Services in Canada — CRS",
    description:
      `Set up a professional corporation for ${formatCents(cents)} all-in including government and regulator fees, or file annual returns, changes, profile reports and revivals at professional-corporation rates.`,
    alternates: { canonical: "/professional-corporation" },
  };
}

export default async function ProfessionalCorporationHub() {
  /* This static route shadows the generic /[section] index, so the cluster's
     pillar (_index.md) would otherwise never render. Pull it in and show it
     below the commercial block — prices and CTAs first, long-form SEO copy
     underneath. The 14 child guides come from listSection. */
  const prices = await getPrices();
  /* Live prices from the admin-editable catalogue, so the cards and the
     Offer schema never advertise a figure checkout will not honour. */
  const priceFor = (key: string, fallback: number) => prices[`pc-${key}`] ?? fallback;

  const pillar = await getPillar("professional-corporation");
  const guides = listSection("professional-corporation");

  const breadcrumb = breadcrumbLd([
    { name: "Home", url: "/" },
    { name: "Professional Corporations" },
  ]);

  /* Service + Offer schema with real prices — the PC keyword strategy calls
     for this on every transactional page. */
  const serviceLd = {
    "@context": "https://schema.org",
    "@type":    "Service",
    "name":     "Professional Corporation Services",
    "provider": { "@type": "Organization", "name": "Corporate Registry Services" },
    "areaServed": { "@type": "Country", "name": "Canada" },
    "url":      `${BASE_URL}/professional-corporation`,
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name":  "Professional Corporation Services",
      "itemListElement": PRO_CORP_ALL_SERVICES.map((key) => {
        const svc = PRO_CORP_SERVICES[key];
        return {
          "@type": "Offer",
          "name":  svc.label,
          "price": (priceFor(svc.key, svc.priceCents) / 100).toFixed(2),
          "priceCurrency": "CAD",
        };
      }),
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(breadcrumb)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(serviceLd)} />
      {pillar?.faq && pillar.faq.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(faqLd(pillar.faq))} />
      )}
      <Header />
      <main style={{ flex: 1, background: "var(--bg)" }}>
        {/* Hero */}
        <section style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-deep)" }}>
          <div style={{ maxWidth: 860, margin: "0 auto", padding: "3rem 1.5rem 2.5rem" }}>
            <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--gold)" }}>
              Professional Corporations
            </span>
            <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 700, lineHeight: 1.2, color: "var(--text)", margin: "0.5rem 0 1rem" }}>
              Professional corporation services across Canada
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "1rem", lineHeight: 1.65, maxWidth: "62ch", margin: 0 }}>
              A professional corporation runs on two tracks: the corporate registry, and your
              regulator&rsquo;s permit or certificate of authorization. Both have to be set up
              correctly and both renew. We handle the registry side end to end — and for a new
              corporation, we coordinate the regulator side too.
            </p>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
              <a
                href="/order/professional-corporation"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.75rem 1.25rem", borderRadius: "0.5rem", background: "var(--primary)", color: "#FFFFFF", fontWeight: 600, fontSize: "0.9rem", textDecoration: "none" }}
              >
                <Search size={15} /> Find my corporation
              </a>
              <a
                href={PRO_CORP_SERVICES.setup.href}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.75rem 1.25rem", borderRadius: "0.5rem", border: "1px solid var(--gold)", color: "var(--text)", fontWeight: 600, fontSize: "0.9rem", textDecoration: "none" }}
              >
                Set up a new PC — ${(priceFor("setup", PRO_CORP_SERVICES.setup.priceCents) / 100).toLocaleString()} <ArrowRight size={14} />
              </a>
            </div>
          </div>
        </section>

        {/* Services */}
        <section style={{ maxWidth: 860, margin: "0 auto", padding: "3rem 1.5rem" }}>
          <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
            What we do, and what it costs
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", margin: "0 0 1.75rem", lineHeight: 1.6 }}>
            All prices are all-in plus GST. Every service except new setup starts with a registry
            lookup so we work from your corporation&rsquo;s actual record.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {PRO_CORP_ALL_SERVICES.map((key) => {
              const svc = PRO_CORP_SERVICES[key];
              const href = svc.requiresExistingCorporation
                ? `/order/professional-corporation?src=pc-hub-${svc.key}`
                : svc.href;
              return (
                <div
                  key={svc.key}
                  style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-card)", padding: "1.5rem 1.75rem", background: "var(--card)", boxShadow: "var(--shadow-card)" }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "baseline", justifyContent: "space-between" }}>
                    <div className="card-heading" style={{ fontSize: "1.1rem" }}>{svc.label}</div>
                    <div style={{ fontWeight: 700, color: "var(--gold)", fontSize: "1rem", whiteSpace: "nowrap" }}>
                      {formatPriceLabel(priceFor(svc.key, svc.priceCents), svc.perYear ? "per-year" : "once")}
                      {svc.perYear ? <span style={{ color: "var(--text-muted)", fontWeight: 500, fontSize: "0.82rem" }}> per year</span> : null}
                    </div>
                  </div>

                  <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", margin: "0.5rem 0 1rem", lineHeight: 1.6 }}>
                    {svc.blurb}
                  </p>

                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.25rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {svc.includes.map((item) => (
                      <li key={item} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", fontSize: "0.85rem", color: "var(--text)", lineHeight: 1.5 }}>
                        <Check size={14} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.2rem" }} />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <a
                    href={href}
                    style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.6rem 1.1rem", borderRadius: "0.5rem", background: "var(--primary)", color: "#FFFFFF", fontWeight: 600, fontSize: "0.85rem", textDecoration: "none" }}
                  >
                    {svc.requiresExistingCorporation ? "Find my corporation" : "Book a free consultation"}
                    <ArrowRight size={14} />
                  </a>
                </div>
              );
            })}
          </div>
        </section>

        {/* Jurisdiction + profession guides — the cluster's child pages. */}
        {guides.length > 0 && (
          <section style={{ borderTop: "1px solid var(--border)", background: "var(--bg-deep)" }}>
            <div style={{ maxWidth: 860, margin: "0 auto", padding: "2.5rem 1.5rem" }}>
              <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem" }}>
                Guides by province and profession
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", margin: "0 0 1.5rem", lineHeight: 1.6 }}>
                Each guide names your regulator, the exact authorization it issues, and the forms
                involved — because the registry step and the regulator step have to line up.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.6rem" }}>
                {guides.map((g) => (
                  <a
                    key={g.slug}
                    href={`/professional-corporation/${g.slug}`}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.6rem", padding: "0.75rem 1rem", border: "1px solid var(--border)", borderRadius: "0.5rem", background: "var(--card)", textDecoration: "none", color: "var(--text)", fontSize: "0.85rem", lineHeight: 1.4 }}
                  >
                    <span>{g.title}</span>
                    <ArrowRight size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  </a>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Pillar long-form copy from content/professional-corporation/_index.md */}
        {pillar?.contentHtml && (
          <section style={{ borderTop: "1px solid var(--border)" }}>
            <div style={{ maxWidth: 780, margin: "0 auto", padding: "3rem 1.5rem" }}>
              <div className="prose" dangerouslySetInnerHTML={{ __html: pillar.contentHtml }} />
            </div>
          </section>
        )}

        {/* Two-track explainer */}
        <section style={{ borderTop: "1px solid var(--border)", background: "var(--bg-deep)" }}>
          <div style={{ maxWidth: 860, margin: "0 auto", padding: "2.5rem 1.5rem 3rem" }}>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <ShieldCheck size={20} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.15rem" }} />
              <div>
                <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.25rem", fontWeight: 700, color: "var(--text)", margin: "0 0 0.5rem" }}>
                  Why professional corporations are priced differently
                </h2>
                <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", lineHeight: 1.65, margin: 0, maxWidth: "64ch" }}>
                  A professional corporation is not just a corporation with a longer name. Its
                  articles carry restrictions your regulator requires, its name has to follow a
                  format set by regulation, only licensed members may hold voting shares, and every
                  registry filing has to stay consistent with what your regulator holds on file.
                  Get any of that out of step and a permit renewal can stall. Our pricing reflects
                  that second track — the registry filing is the visible half of the work.
                </p>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", lineHeight: 1.65, marginTop: "0.9rem", maxWidth: "64ch" }}>
                  Tax treatment of a professional corporation is a question for your accountant. We
                  handle the filings, not the tax advice.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
