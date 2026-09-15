/**
 * Configuration for the Minute Book order funnel (/order/minute-book).
 *
 * Pricing is age-tiered: the corporation's incorporation date (from the
 * registry search hit, or customer-supplied when the registry omits it)
 * determines the tier, and each tier has two prices — self-serve online
 * or built by the CRS team. The API route re-derives the tier server-side
 * from the incorporation date so a client can never send its own price.
 */

export type MinuteBookTierKey = "young" | "growing" | "established" | "legacy";
export type MinuteBookPath    = "self" | "crs";

export type MinuteBookTier = {
  key:        MinuteBookTierKey;
  label:      string;        // "Up to 2 years"
  maxYears:   number | null; // upper age bound in years; null = no cap
  selfCents:  number;        // self-serve price, pre-tax
  crsCents:   number;        // built-by-CRS price, pre-tax
  selfLabel:  string;        // "$289"
  crsLabel:   string;        // "$389"
  blurb:      string;        // one line under the tier in the reveal grid
};

/* Display order matters — the reveal grid renders these left to right. */
export const MINUTE_BOOK_TIERS: MinuteBookTier[] = [
  {
    key: "young",       label: "Up to 2 years",  maxYears: 2,
    selfCents: 28900,  crsCents: 38900,  selfLabel: "$289",   crsLabel: "$389",
    blurb: "Organization documents plus every year since incorporation.",
  },
  {
    key: "growing",     label: "2 – 5 years",    maxYears: 5,
    selfCents: 58900,  crsCents: 68900,  selfLabel: "$589",   crsLabel: "$689",
    blurb: "Full reconstruction with annual resolutions for each year.",
  },
  {
    key: "established", label: "5 – 10 years",   maxYears: 10,
    selfCents: 88900,  crsCents: 99900,  selfLabel: "$889",   crsLabel: "$999",
    blurb: "Deep history rebuild — registers, resolutions, certificates.",
  },
  {
    key: "legacy",      label: "10+ years",      maxYears: null,
    selfCents: 139900, crsCents: 159900, selfLabel: "$1,399", crsLabel: "$1,599",
    blurb: "A decade or more of records, brought fully current.",
  },
];

export function tierByKey(key: string | null | undefined): MinuteBookTier | null {
  return MINUTE_BOOK_TIERS.find((t) => t.key === key) ?? null;
}

/**
 * Resolve the pricing tier from an ISO incorporation date (YYYY-MM-DD).
 * Returns null when the date is missing, unparseable, or in the future —
 * callers must then collect the date from the customer before quoting.
 */
export function tierForIncorpDate(iso: string | null | undefined, now: Date = new Date()): MinuteBookTier | null {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10));
  if (Number.isNaN(d.getTime()) || d.getTime() > now.getTime()) return null;
  const years = (now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  for (const tier of MINUTE_BOOK_TIERS) {
    if (tier.maxYears === null || years <= tier.maxYears) return tier;
  }
  return MINUTE_BOOK_TIERS[MINUTE_BOOK_TIERS.length - 1];
}

export function priceCentsFor(tier: MinuteBookTier, path: MinuteBookPath): number {
  return path === "crs" ? tier.crsCents : tier.selfCents;
}

export function priceLabelFor(tier: MinuteBookTier, path: MinuteBookPath): string {
  return path === "crs" ? tier.crsLabel : tier.selfLabel;
}

/* Phase 1 jurisdictions. provinceKey values as used by /api/company-search. */
export const MINUTE_BOOK_PROVINCES = ["ab", "bc", "on", "federal"] as const;

export function isSupportedProvince(provinceKey: string | null | undefined): boolean {
  return !!provinceKey && (MINUTE_BOOK_PROVINCES as readonly string[]).includes(provinceKey);
}

/* How the customer supplies the mandatory Corporate Profile Report. */
export type ReportSource = "crs_pull" | "customer_upload";

export const MINUTE_BOOK_COPY = {
  label:       "Corporate Minute Book",
  headline:    "Rebuild your corporation's minute book",
  description: "Every resolution, register and share certificate from incorporation to today — reconstructed from your corporation's official registry record.",
  productName: "Corporate Minute Book",
  deliveryPromise:
    "Your current Corporate Profile Report is included and emailed within one business day; your book follows from the official record.",
  guarantee:
    "If your registry record reveals events outside this order's scope — an amalgamation, a revival, a continuance — we pause and confirm a revised quote with you before any work begins, or refund you in full.",
} as const;
