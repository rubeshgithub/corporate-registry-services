import type { Section } from "./content";

/**
 * Maps a slug fragment to a JURISDICTIONS key from service-config.ts.
 * Case- and hyphenation-insensitive.
 */
const JURISDICTION_ALIASES: Record<string, string> = {
  alberta:                   "ab",
  "british-columbia":        "bc",
  bc:                        "bc",
  manitoba:                  "mb",
  "new-brunswick":           "nb",
  newfoundland:              "nl",
  "newfoundland-and-labrador": "nl",
  "newfoundland-labrador":   "nl",
  "northwest-territories":   "nt",
  "nova-scotia":             "ns",
  nunavut:                   "nu",
  ontario:                   "on",
  "prince-edward-island":    "pe",
  quebec:                    "qc",
  saskatchewan:              "sk",
  yukon:                     "yt",
  federal:                   "federal",
  "canada-federal":          "federal",
  canada:                    "federal",
};

function jurisdictionFromSlug(slug: string): string | null {
  const s = slug.toLowerCase();
  // Try multi-word aliases first (longest first) so "british-columbia" wins over "columbia"
  const sorted = Object.keys(JURISDICTION_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of sorted) {
    if (s.includes(alias)) return JURISDICTION_ALIASES[alias];
  }
  return null;
}

export type ServiceContext = {
  serviceKey:     string;         // e.g. "annual-return" — matches service-config.ts
  jurisdictionKey: string | null; // e.g. "bc" — null if not inferrable
  price:          string;         // e.g. "$99 + GST"
  ctaHeadline:    string;         // above-the-fold conversion strip headline
  ctaSubline:     string;         // supporting line
  ctaButton:      string;         // button label
  urgency?:       UrgencyBlock;   // optional red-tinted deadline callout
  stickyLabel?:   string;         // short label for the sticky mobile CTA
};

export type UrgencyBlock = {
  headline:    string;   // "Alberta gives you only 1 month."
  body:        string;   // Details on what happens if you miss the deadline.
};

/**
 * Annual-return deadlines vary wildly by jurisdiction. We only surface an
 * urgency callout for jurisdictions where the window is genuinely tight —
 * elsewhere ("file with your tax return", 6 months, etc.) the urgency
 * framing feels like scare-copy and undermines trust.
 */
const ANNUAL_RETURN_URGENCY: Partial<Record<string, UrgencyBlock>> = {
  ab: {
    headline: "Alberta gives you only 1 month after your incorporation anniversary — the shortest window in Canada.",
    body:     "Miss it and your corporation can be struck from the registry. Reinstatement costs more, takes weeks, and blocks financing, bank changes, and CRA filings while you wait.",
  },
  bc: {
    headline: "BC Annual Reports are due within 2 months of your incorporation anniversary.",
    body:     "Continued non-compliance places your corporation in non-compliance status, and if more than a year overdue the Registrar can dissolve it.",
  },
  federal: {
    headline: "Federal CBCA annual returns are due within 60 days of your anniversary.",
    body:     "Corporations Canada can dissolve a corporation for repeated missed filings — costly to reverse and disrupts existing contracts.",
  },
};

/**
 * Given (section, slug), return the CRS service the visitor is most likely
 * looking to buy, plus copy for the above-the-fold conversion strip.
 * Returns null when we can't confidently map — the strip won't render.
 */
export function inferServiceContext(section: Section, slug: string): ServiceContext | null {
  const s = slug.toLowerCase();
  const jurisdictionKey = jurisdictionFromSlug(s);

  // Annual return — the highest-intent page family
  if (section === "annual-return" || s.includes("annual-return")) {
    return {
      serviceKey:     "annual-return",
      jurisdictionKey,
      price:          "$99 all-in + GST",
      ctaHeadline:    "CRS files this for you — $99 all-in + GST.",
      ctaSubline:     "Government fee included. Filed within 24 hours. Deadline monitored every year.",
      ctaButton:      "File my annual return",
      urgency:        jurisdictionKey ? ANNUAL_RETURN_URGENCY[jurisdictionKey] : undefined,
      stickyLabel:    "$99 · File my annual return",
    };
  }

  if (section === "incorporation" || s.includes("incorporation")) {
    return {
      serviceKey:     "incorporation-numbered",
      jurisdictionKey,
      price:          "from $699 + GST",
      ctaHeadline:    "CRS incorporates your company — from $699 all-in.",
      ctaSubline:     "Includes government fees, NUANS (if named), articles, and organizing resolutions. Filed within 24 hours.",
      ctaButton:      "Start incorporation",
      stickyLabel:    "From $699 · Start incorporation",
    };
  }

  if (section === "good-standing" || s.includes("good-standing")) {
    return {
      serviceKey:     "good-standing",
      jurisdictionKey,
      price:          "$79 all-in + GST",
      ctaHeadline:    "Certificate of Good Standing — $79 all-in + GST.",
      ctaSubline:     "Government-issued, filed on your behalf. Government fee included. Turnaround in hours, not weeks.",
      ctaButton:      "Order certificate",
      stickyLabel:    "$79 · Order certificate",
    };
  }

  if (section === "profile-reports" || s.includes("profile-report")) {
    return {
      serviceKey:     "profile-report",
      jurisdictionKey,
      price:          "$49 all-in + GST",
      ctaHeadline:    "Corporate Profile Report — $49 all-in + GST.",
      ctaSubline:     "Direct from the government registry. Government fee included. Delivered as a PDF within one business hour.",
      ctaButton:      "Order profile report",
      stickyLabel:    "$49 · Order profile report",
    };
  }

  if (section === "minute-books" || s.includes("minute-book")) {
    return {
      serviceKey:     "minute-book-new",
      jurisdictionKey,
      price:          "from $299 + GST",
      ctaHeadline:    "Complete minute book, compliance-ready — from $299.",
      ctaSubline:     "Articles, by-laws, registers, share certificates, and resolutions. Delivered as a single PDF.",
      ctaButton:      "Get my minute book",
      stickyLabel:    "From $299 · Get my minute book",
    };
  }

  return null;
}

/**
 * Build the URL to buy this service. Annual return has a dedicated,
 * lookup-first checkout page at /order/annual-return; everything else
 * still routes through the homepage wizard with service + jurisdiction
 * preselected.
 */
export function wizardHref(ctx: ServiceContext, src: string): string {
  const params = new URLSearchParams();
  if (ctx.jurisdictionKey) params.set("jurisdiction", ctx.jurisdictionKey);
  params.set("src", src);

  if (ctx.serviceKey === "annual-return") {
    return `/order/annual-return?${params.toString()}`;
  }
  if (ctx.serviceKey === "profile-report") {
    return `/order/profile-report?${params.toString()}`;
  }
  if (ctx.serviceKey === "good-standing") {
    return `/order/good-standing?${params.toString()}`;
  }
  if (ctx.serviceKey === "corporate-search") {
    return `/order/corporate-search?${params.toString()}`;
  }
  if (ctx.serviceKey === "nuans-search") {
    return `/order/nuans-search?${params.toString()}`;
  }
  if (ctx.serviceKey.startsWith("incorporation-")) {
    // All incorporation subtypes route to the same page; the type is a query param.
    const type =
      ctx.serviceKey === "incorporation-numbered"     ? "numbered"
    : ctx.serviceKey === "incorporation-named"        ? "named"
    : ctx.serviceKey === "extra-provincial"           ? "extra-provincial"
    : ctx.serviceKey === "not-for-profit"             ? "not-for-profit"
    : "numbered";
    params.set("type", type);
    return `/order/incorporation?${params.toString()}`;
  }

  params.set("service", ctx.serviceKey);
  return `/?${params.toString()}#incorporate`;
}
