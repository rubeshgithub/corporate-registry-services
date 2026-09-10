/**
 * The price catalogue and its pure helpers — no Mongo, no Node APIs — so any
 * component, client or server, can import it. The live layer (operator
 * overrides from /admin/analytics, caching, checkout resolution) lives in
 * pricing.ts, which re-exports everything here so server code keeps a single
 * import.
 *
 * Why the split: client components (the corporation profile CTA, the wizard
 * basket, the article lookup widget) need to format a price the server handed
 * them. Importing pricing.ts from a client file would drag the Mongo driver
 * into the browser bundle, so the pure parts live here.
 */

export type PriceUnit = "once" | "per-year";

export type PriceItem = {
  /** Canonical key. Stable — it is the Mongo _id for any override. */
  key:          string;
  label:        string;
  /** UI grouping on the admin screen. */
  group:        "Reports & searches" | "Filings & changes" | "Documents" | "Incorporation" | "Professional corporations";
  defaultCents: number;
  unit:         PriceUnit;
  /** Shown under the field in the admin UI when the price needs context. */
  note?:        string;
};

/**
 * Every chargeable item. Adding a service means adding a row here and
 * reading it by key — never a new hardcoded constant.
 */
export const PRICE_CATALOGUE: PriceItem[] = [
  /* ── Reports & searches ─────────────────────────────────────────── */
  { key: "profile-report",        label: "Corporate Profile Report",          group: "Reports & searches", defaultCents: 4900,  unit: "once" },
  { key: "good-standing",         label: "Certificate of Good Standing",      group: "Reports & searches", defaultCents: 7900,  unit: "once" },
  { key: "corporate-search",      label: "Name Availability - NUANS - Pre-Screen Name Search", group: "Reports & searches", defaultCents: 4900,  unit: "once" },
  { key: "nuans-search",          label: "NUANS Name Search Report",          group: "Reports & searches", defaultCents: 7900,  unit: "once" },
  { key: "corporate-documents",   label: "Copies of Corporation Documents",   group: "Reports & searches", defaultCents: 48900, unit: "once", note: "Full set from date of incorporation to date" },

  /* ── Filings & changes ──────────────────────────────────────────── */
  { key: "annual-return",         label: "Annual Return",                     group: "Filings & changes", defaultCents: 9900,  unit: "per-year", note: "Charged per year filed" },
  { key: "change-directors",      label: "Director / Officer Change",         group: "Filings & changes", defaultCents: 9900,  unit: "once" },
  { key: "change-address",        label: "Registered Office Address Change",  group: "Filings & changes", defaultCents: 9900,  unit: "once" },
  { key: "change-name",           label: "Corporate Name Change",             group: "Filings & changes", defaultCents: 29900, unit: "once" },
  { key: "articles-amendment",    label: "Articles of Amendment",             group: "Filings & changes", defaultCents: 19900, unit: "once" },
  { key: "share-split",           label: "Share Split or Consolidation",      group: "Filings & changes", defaultCents: 19900, unit: "once" },
  { key: "voluntary-dissolution", label: "Voluntary Dissolution",             group: "Filings & changes", defaultCents: 39900, unit: "once" },
  { key: "revival",               label: "Corporate Revival",                 group: "Filings & changes", defaultCents: 39900, unit: "once" },
  { key: "amalgamation",          label: "Amalgamation",                      group: "Filings & changes", defaultCents: 79900, unit: "once" },
  { key: "continuance",           label: "Continuance (jurisdiction transfer)", group: "Filings & changes", defaultCents: 49900, unit: "once" },
  { key: "extra-provincial",      label: "Extra-Provincial Registration",     group: "Filings & changes", defaultCents: 29900, unit: "once" },
  { key: "registered-office",     label: "Registered Office Service",         group: "Filings & changes", defaultCents: 39900, unit: "per-year" },
  { key: "compliance-review",     label: "Corporate Compliance Review",       group: "Filings & changes", defaultCents: 49900, unit: "once" },
  { key: "transparency-register", label: "BC Transparency Register",          group: "Filings & changes", defaultCents: 29900, unit: "once", note: "Required of every private B.C. company since 1 Oct 2020" },

  /* ── Documents ──────────────────────────────────────────────────── */
  { key: "share-certificate",      label: "Share Certificate",                group: "Documents", defaultCents: 4900,  unit: "once" },
  { key: "director-resolution",    label: "Director Resolution",              group: "Documents", defaultCents: 7900,  unit: "once" },
  { key: "shareholder-resolution", label: "Shareholder Resolution",           group: "Documents", defaultCents: 7900,  unit: "once" },
  { key: "bylaws",                 label: "Corporate By-Laws",                group: "Documents", defaultCents: 9900,  unit: "once" },
  { key: "minute-book-new",        label: "New Minute Book Package",          group: "Documents", defaultCents: 29900, unit: "once" },
  { key: "minute-book-update",     label: "Minute Book Update",               group: "Documents", defaultCents: 29900, unit: "once" },

  /* ── Incorporation ──────────────────────────────────────────────── */
  { key: "incorporation-numbered", label: "Numbered Company Incorporation",   group: "Incorporation", defaultCents: 69900, unit: "once" },
  { key: "incorporation-named",    label: "Named Company Incorporation",      group: "Incorporation", defaultCents: 74900, unit: "once" },
  { key: "incorporation-nfp",      label: "Not-for-Profit Incorporation",     group: "Incorporation", defaultCents: 69900, unit: "once" },

  /* ── Professional corporations ──────────────────────────────────── */
  { key: "pc-profile-report",        label: "PC — Corporate Profile Report",  group: "Professional corporations", defaultCents: 6900,   unit: "once" },
  { key: "pc-setup",                 label: "PC — New setup (all-in)",        group: "Professional corporations", defaultCents: 169900, unit: "once", note: "Includes government registry and regulator fees" },
  { key: "pc-annual-return",         label: "PC — Annual Return",             group: "Professional corporations", defaultCents: 13900,  unit: "per-year" },
  { key: "pc-change-of-information", label: "PC — Change of Information",     group: "Professional corporations", defaultCents: 16900,  unit: "once" },
  { key: "pc-revival",               label: "PC — Revival",                   group: "Professional corporations", defaultCents: 48900,  unit: "once" },
];

export const PRICE_KEYS = PRICE_CATALOGUE.map((p) => p.key);

export function priceItem(key: string): PriceItem | undefined {
  return PRICE_CATALOGUE.find((p) => p.key === key);
}

/** Code defaults, keyed. The fallback whenever Mongo is unreachable, and the
 *  fallback for any client component rendering before prices arrive. */
export const DEFAULT_PRICES: Record<string, number> = Object.fromEntries(
  PRICE_CATALOGUE.map((p) => [p.key, p.defaultCents]),
);

/**
 * Map a SERVICE_BUCKETS service key to its catalogue price key. Almost all
 * are identical; these are the handful that aren't, kept here so the
 * divergence lives in one place instead of at each call site.
 */
const SERVICE_KEY_ALIASES: Record<string, string> = {
  "not-for-profit":         "incorporation-nfp",
  "annual-return-multiple": "annual-return",
};

export function priceKeyForService(serviceKey: string): string {
  return SERVICE_KEY_ALIASES[serviceKey] ?? serviceKey;
}

/* ── Formatting ───────────────────────────────────────────────────── */

/** "$489" / "$1,699" — no cents shown, since every price is a whole dollar. */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  const whole   = Number.isInteger(dollars) ? dollars.toFixed(0) : dollars.toFixed(2);
  return `$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** House display string: "$99 all-in + GST", "$399/year all-in + GST". */
export function formatPriceLabel(cents: number, unit: PriceUnit = "once"): string {
  return unit === "per-year"
    ? `${formatCents(cents)}/year all-in + GST`
    : `${formatCents(cents)} all-in + GST`;
}

/**
 * Rewrite the dollar figure inside an existing copy string to the live price.
 *
 * Deliberately a token swap rather than rebuilding the sentence: every config
 * has its own wording ("Pay $99 + GST and file" vs "…and order" vs "…and
 * start revival"), and regenerating would flatten those. Swapping just the
 * number keeps the copy and guarantees it matches what Stripe charges.
 *
 * Handles "$99", "$1,699", "from $299", "$99/year".
 */
export function swapPrice(copy: string, cents: number): string {
  return copy.replace(/\$[\d,]+(?:\.\d{2})?/, formatCents(cents));
}

/** Same, for copy that repeats one price ("$99 per year … included in the $99"). */
export function swapAllPrices(copy: string, cents: number): string {
  return copy.replace(/\$[\d,]+(?:\.\d{2})?/g, formatCents(cents));
}
