/**
 * Configuration for the Minute Book order funnel (/order/minute-book).
 *
 * Pricing is age-tiered: the corporation's incorporation date (from the
 * registry search hit, or customer-supplied when the registry omits it)
 * determines the tier, and each tier has two prices — self-serve online or
 * built by the CRS team. The amounts live in the price catalogue under
 * `minute-book-<tier>-<path>`, so operators set them from /admin/analytics.
 * The API route re-derives the tier server-side from the incorporation date
 * so a client can never send its own price.
 */

export type MinuteBookTierKey = "young" | "growing" | "established" | "legacy";
export type MinuteBookPath    = "self" | "crs";

export type MinuteBookTier = {
  key:      MinuteBookTierKey;
  label:    string;        // "Up to 2 years"
  maxYears: number | null; // upper age bound in years; null = no cap
  blurb:    string;        // one line under the tier in the reveal grid
};

/* Display order matters — the reveal grid renders these left to right. */
export const MINUTE_BOOK_TIERS: MinuteBookTier[] = [
  { key: "young",       label: "Up to 2 years", maxYears: 2,    blurb: "Organization documents plus every year since incorporation." },
  { key: "growing",     label: "2 – 5 years",   maxYears: 5,    blurb: "Full reconstruction with annual resolutions for each year." },
  { key: "established", label: "5 – 10 years",  maxYears: 10,   blurb: "Deep history rebuild — registers, resolutions, certificates." },
  { key: "legacy",      label: "10+ years",     maxYears: null, blurb: "A decade or more of records, brought fully current." },
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

/** Price-catalogue key for a tier and path. */
export function minuteBookPriceKey(tier: MinuteBookTierKey, path: MinuteBookPath): string {
  return `minute-book-${tier}-${path}`;
}

/** Every tier's two prices, in cents — what the order and pricing pages are handed. */
export type MinuteBookPrices = Record<MinuteBookTierKey, Record<MinuteBookPath, number>>;

export function minuteBookPrices(prices: Record<string, number>): MinuteBookPrices {
  const out = {} as MinuteBookPrices;
  for (const t of MINUTE_BOOK_TIERS) {
    out[t.key] = {
      self: prices[minuteBookPriceKey(t.key, "self")],
      crs:  prices[minuteBookPriceKey(t.key, "crs")],
    };
  }
  return out;
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
