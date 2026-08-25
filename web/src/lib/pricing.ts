import { type Collection } from "mongodb";
import { db } from "./mongo";

/**
 * Single source of truth for every price CRS charges.
 *
 * Before this, prices lived in five config files plus hardcoded constants in
 * two order routes, which meant changing one meant hunting for the others and
 * risking a card charge that disagreed with the page.
 *
 * Model: a code-defined catalogue of defaults, overlaid by operator overrides
 * stored in Mongo and edited from /admin/analytics. Code defaults are the
 * floor — an override is only ever a deliberate change, and deleting one
 * restores the default. Nothing about a deploy resets an override.
 *
 * ── Authority ────────────────────────────────────────────────────────────
 * Order routes resolve the effective price server-side by key. The client
 * never sends an amount, and display labels are derived from the same number
 * so the page and the Stripe charge cannot drift.
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
  { key: "corporate-search",      label: "Corporate Name Search",             group: "Reports & searches", defaultCents: 4900,  unit: "once" },
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

/** Code defaults, keyed. Used as the fallback whenever Mongo is unreachable. */
export const DEFAULT_PRICES: Record<string, number> = Object.fromEntries(
  PRICE_CATALOGUE.map((p) => [p.key, p.defaultCents]),
);

/* ── Storage ──────────────────────────────────────────────────────── */

export type PriceOverrideDoc = {
  _id:        string;    // price key
  priceCents: number;
  updatedAt:  Date;
  updatedBy?: string;
};

export async function priceOverrides(): Promise<Collection<PriceOverrideDoc>> {
  return (await db()).collection<PriceOverrideDoc>("pricing_overrides");
}

/* In-process cache. Checkout is on the hot path and a Mongo round-trip per
   order is wasteful, but an operator changing a price wants it live quickly —
   30s is the compromise. Admin reads bypass this entirely. */
let cache: { at: number; prices: Record<string, number> } | null = null;
const CACHE_MS = 30_000;

/** Effective prices: code defaults with any operator overrides applied. */
export async function getPrices(opts: { fresh?: boolean } = {}): Promise<Record<string, number>> {
  if (!opts.fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.prices;

  const merged = { ...DEFAULT_PRICES };
  try {
    const col  = await priceOverrides();
    const docs = await col.find({}).toArray();
    for (const d of docs) {
      /* Ignore overrides for keys that no longer exist, and any nonsense
         value — a bad row must never zero out a live price. */
      if (!(d._id in merged)) continue;
      if (!Number.isFinite(d.priceCents) || d.priceCents < 0) continue;
      merged[d._id] = Math.round(d.priceCents);
    }
  } catch (e) {
    /* Mongo down → charge the code defaults rather than failing checkout. */
    console.error("[pricing] override read failed, using defaults:", e instanceof Error ? e.message : e);
  }

  cache = { at: Date.now(), prices: merged };
  return merged;
}

/** Effective price for one key. Throws on an unknown key so a typo surfaces
 *  at the call site instead of silently charging zero. */
export async function getPriceCents(key: string): Promise<number> {
  const prices = await getPrices();
  const cents  = prices[key];
  if (cents == null) throw new Error(`Unknown price key: ${key}`);
  return cents;
}

/** Drop the cache — called after an admin edit so the next checkout is
 *  immediately correct rather than up to 30s stale. */
export function invalidatePriceCache(): void {
  cache = null;
}

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

/**
 * Effective professional-corporation price, or null when the record is not a
 * PC or the PC service has no published price. PC prices live in the same
 * catalogue (keys prefixed `pc-`) so the admin screen controls them too.
 */
export async function proCorpPriceCentsLive(
  isPc: boolean,
  pcServiceKey: string,
): Promise<number | null> {
  if (!isPc) return null;
  const key = `pc-${pcServiceKey}`;
  const prices = await getPrices();
  return prices[key] ?? null;
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

let indexEnsured = false;
export async function ensurePricingIndexes(): Promise<void> {
  if (indexEnsured) return;
  indexEnsured = true;
  try {
    const col = await priceOverrides();
    await col.createIndex({ updatedAt: -1 });
  } catch (e) {
    indexEnsured = false;
    console.error("[pricing] failed to ensure indexes:", e);
  }
}
