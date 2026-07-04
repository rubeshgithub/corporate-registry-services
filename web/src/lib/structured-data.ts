import { JURISDICTIONS } from "./service-config";
import type { ServiceContext } from "./service-context";

/**
 * JSON-LD builders. All emit plain objects; components render them via a
 * <script type="application/ld+json"> tag. Kept as objects (not strings) so
 * TypeScript can catch typos in property names before we ship.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.corporateregistryservices.ca";

/** Root Organization schema — emit once in RootLayout so every page carries it. */
export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type":    "Organization",
    name:       "Corporate Registry Services",
    url:        SITE_URL,
    logo:       `${SITE_URL}/icon.svg`,
    email:      "support@corporateregistryservices.ca",
    areaServed: { "@type": "Country", name: "Canada" },
    sameAs: [
      "https://minutebook.corporateregistryservices.ca",
    ],
  };
}

/**
 * BreadcrumbList — helps SERPs render the breadcrumb line instead of a raw
 * URL, and gives Google topical grouping signal for the section → article
 * hierarchy.
 */
export function breadcrumbLd(items: Array<{ name: string; url?: string }>) {
  return {
    "@context": "https://schema.org",
    "@type":    "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type":  "ListItem",
      position: i + 1,
      name:     item.name,
      ...(item.url ? { item: item.url.startsWith("http") ? item.url : `${SITE_URL}${item.url}` } : {}),
    })),
  };
}

/**
 * Service schema for pages describing a specific priced offering. Fed from
 * inferServiceContext so this stays in sync with the conversion strip.
 */
export function serviceLd({
  ctx,
  pageUrl,
  pageName,
}: {
  ctx:      ServiceContext;
  pageUrl:  string;
  pageName: string;
}) {
  const jurisdictionLabel = ctx.jurisdictionKey
    ? JURISDICTIONS.find((j) => j.key === ctx.jurisdictionKey)?.label
    : undefined;
  // Extract a numeric price from ctx.price like "$99 all-in + GST" → "99".
  const priceMatch = ctx.price.match(/\$(\d+)/);
  const priceValue = priceMatch ? priceMatch[1] : undefined;

  return {
    "@context": "https://schema.org",
    "@type":    "Service",
    name:       pageName,
    url:        pageUrl.startsWith("http") ? pageUrl : `${SITE_URL}${pageUrl}`,
    provider: {
      "@type": "Organization",
      name:    "Corporate Registry Services",
      url:     SITE_URL,
    },
    areaServed: jurisdictionLabel
      ? { "@type": "AdministrativeArea", name: jurisdictionLabel }
      : { "@type": "Country",            name: "Canada" },
    ...(priceValue
      ? {
          offers: {
            "@type":         "Offer",
            price:           priceValue,
            priceCurrency:   "CAD",
            priceSpecification: {
              "@type":         "PriceSpecification",
              price:           priceValue,
              priceCurrency:   "CAD",
              valueAddedTaxIncluded: false,
            },
          },
        }
      : {}),
  };
}

/** Render helper — turns a JSON-LD object into a <script> tag string via JSX. */
export function jsonLdScript(data: object) {
  return {
    __html: JSON.stringify(data),
  };
}
