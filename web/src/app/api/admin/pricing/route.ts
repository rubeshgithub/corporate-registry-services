import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  PRICE_CATALOGUE,
  DEFAULT_PRICES,
  getPrices,
  priceOverrides,
  priceItem,
  invalidatePriceCache,
  ensurePricingIndexes,
} from "@/lib/pricing";

/**
 * GET  /api/admin/pricing   → the catalogue with current + default prices
 * PUT  /api/admin/pricing   → set or clear overrides
 *
 * Admin-gated. This is the only write path for prices; order routes read the
 * resolved value and never accept one from a client.
 *
 * PUT body: { changes: { [key]: number | null } }
 *   number → set that price, in cents
 *   null   → clear the override, reverting to the code default
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Guard rails on operator input. A price is dollars-and-cents, never
 *  negative, and a fat-fingered extra zero on a $99 service should be
 *  caught here rather than by a customer. */
const MAX_CENTS = 10_000_00; // $10,000

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensurePricingIndexes();

  /* Fresh read — the admin screen must show what is actually stored, not a
     value cached for the checkout path. */
  const [prices, overrides] = await Promise.all([
    getPrices({ fresh: true }),
    priceOverrides().then((c) => c.find({}).toArray()).catch(() => []),
  ]);

  const overrideMap = new Map(overrides.map((o) => [o._id, o]));

  return NextResponse.json({
    items: PRICE_CATALOGUE.map((item) => {
      const o = overrideMap.get(item.key);
      return {
        key:           item.key,
        label:         item.label,
        group:         item.group,
        unit:          item.unit,
        note:          item.note ?? null,
        defaultCents:  item.defaultCents,
        currentCents:  prices[item.key] ?? item.defaultCents,
        isOverridden:  !!o,
        updatedAt:     o?.updatedAt ? new Date(o.updatedAt).toISOString() : null,
      };
    }),
  });
}

export async function PUT(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { changes?: Record<string, number | null> };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const changes = body?.changes ?? {};
  const keys = Object.keys(changes);
  if (keys.length === 0) {
    return NextResponse.json({ error: "No changes supplied." }, { status: 400 });
  }

  /* Validate everything before writing anything — a partial apply would
     leave pricing in a state the operator did not intend. */
  for (const key of keys) {
    if (!priceItem(key)) {
      return NextResponse.json({ error: `Unknown price key: ${key}` }, { status: 400 });
    }
    const v = changes[key];
    if (v === null) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) {
      return NextResponse.json({ error: `${key}: price must be a number.` }, { status: 400 });
    }
    if (!Number.isInteger(v)) {
      return NextResponse.json({ error: `${key}: price must be a whole number of cents.` }, { status: 400 });
    }
    if (v < 0)          return NextResponse.json({ error: `${key}: price cannot be negative.` }, { status: 400 });
    if (v > MAX_CENTS)  return NextResponse.json({ error: `${key}: price exceeds the $10,000 ceiling — raise MAX_CENTS if this is intended.` }, { status: 400 });
  }

  try {
    await ensurePricingIndexes();
    const col = await priceOverrides();
    const now = new Date();

    for (const key of keys) {
      const v = changes[key];
      if (v === null || v === DEFAULT_PRICES[key]) {
        /* Clearing, or setting back to the code default — drop the override
           so the row does not pin a value that a future deploy changes. */
        await col.deleteOne({ _id: key });
      } else {
        /* replaceOne's type excludes _id from the replacement doc — the
           filter supplies it — so set only the mutable fields. */
        await col.replaceOne(
          { _id: key },
          { priceCents: v, updatedAt: now, updatedBy: "admin" },
          { upsert: true },
        );
      }
    }

    /* Make the change effective for the next checkout immediately rather
       than waiting out the 30s read cache. */
    invalidatePriceCache();

    const prices = await getPrices({ fresh: true });
    return NextResponse.json({ ok: true, updated: keys.length, prices });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to save prices.";
    console.error("[admin/pricing] save failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
