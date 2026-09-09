import { type Collection } from "mongodb";
import { db } from "./mongo";
import { DEFAULT_PRICES, swapPrice } from "./price-catalogue";

/**
 * Single source of truth for every price CRS charges.
 *
 * Before this, prices lived in five config files plus hardcoded constants in
 * two order routes, which meant changing one meant hunting for the others and
 * risking a card charge that disagreed with the page.
 *
 * Model: a code-defined catalogue of defaults (price-catalogue.ts — pure,
 * importable from client components), overlaid by operator overrides stored
 * in Mongo and edited from /admin/analytics. Code defaults are the floor — an
 * override is only ever a deliberate change, and deleting one restores the
 * default. Nothing about a deploy resets an override.
 *
 * ── Authority ────────────────────────────────────────────────────────────
 * Order routes resolve the effective price server-side by key. The client
 * never sends an amount, and display labels are derived from the same number
 * so the page and the Stripe charge cannot drift.
 */

export {
  PRICE_CATALOGUE,
  PRICE_KEYS,
  priceItem,
  DEFAULT_PRICES,
  priceKeyForService,
  formatCents,
  formatPriceLabel,
  swapPrice,
  swapAllPrices,
} from "./price-catalogue";
export type { PriceUnit, PriceItem } from "./price-catalogue";

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

/** A config object carrying a price and the copy that quotes it. */
type PricedConfig = {
  priceCents:   number;
  priceLabel:   string;
  buttonLabel?: string;
};

/**
 * Return a copy of a service config with the live price applied to both the
 * amount and every string that quotes it. Order pages are server components,
 * so they call this and hand the result to the client flow — which means the
 * page can never advertise a price the checkout won't honour.
 */
export async function withLivePrice<T extends PricedConfig>(cfg: T, key: string): Promise<T> {
  let cents: number;
  try {
    cents = await getPriceCents(key);
  } catch {
    return cfg;   // unknown key — leave the shipped copy untouched
  }
  if (cents === cfg.priceCents) return cfg;
  return {
    ...cfg,
    priceCents:  cents,
    priceLabel:  swapPrice(cfg.priceLabel, cents),
    ...(cfg.buttonLabel ? { buttonLabel: swapPrice(cfg.buttonLabel, cents) } : {}),
  };
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
