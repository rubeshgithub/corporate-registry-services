import { NextResponse } from "next/server";
import Stripe from "stripe";
import { findService, getBucket, JURISDICTIONS } from "@/lib/service-config";
import { getPriceCents, priceKeyForService } from "@/lib/pricing";

/**
 * POST /api/order/wizard-checkout
 *
 * Multi-service checkout for the homepage wizard.
 *
 * The wizard already fast-paths a single-service selection into that
 * service's own order flow. What it could not do was sell a basket: pick
 * three services and the whole thing fell through to /api/wizard-submit,
 * which emails a quote. That is how a $99 annual return — a product with a
 * working one-click checkout — ended up as an email to answer by hand.
 *
 * This takes the basket and bills it as one Stripe session with a line item
 * per service. Prices are resolved server-side from the pricing catalogue by
 * key; the client sends service keys and never an amount.
 *
 * Services with no direct price (currently only not-for-profit, which routes
 * to a consultation) are rejected here so the caller falls back to the quote
 * path rather than silently dropping one from the basket.
 */

export const runtime = "nodejs";

type Body = {
  bucketKey?:       string;
  serviceKeys?:     string[];
  jurisdictionKey?: string;
  details?:         Record<string, string>;
  customer?: {
    fullName?: string;
    email?:    string;
    phone?:    string;
    company?:  string;
    preferredContact?: string;
  };
  src?: string;
};

const TEST_OVERRIDE_CENTS = parseInt(process.env.ORDER_TEST_AMOUNT_CENTS ?? "", 10);
const USE_TEST_PRICE = Number.isFinite(TEST_OVERRIDE_CENTS) && TEST_OVERRIDE_CENTS > 0;

/** Stripe caps metadata at 50 keys / 500 chars per value. */
function chunkJson(obj: unknown, prefix: string, maxChunks = 6): Record<string, string> {
  const raw = JSON.stringify(obj);
  const out: Record<string, string> = {};
  const size = 480;
  for (let i = 0, n = 1; i < raw.length && n <= maxChunks; i += size, n++) {
    out[`${prefix}_${n}`] = raw.slice(i, i + size);
  }
  return out;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Payments are not configured." }, { status: 500 });

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const keys = (body.serviceKeys ?? []).filter(Boolean);
  if (keys.length === 0)               return NextResponse.json({ error: "No services selected." }, { status: 400 });
  if (!body.customer?.fullName?.trim())return NextResponse.json({ error: "Missing contact name." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customer?.email ?? "")) {
    return NextResponse.json({ error: "Invalid email." }, { status: 400 });
  }

  /* Resolve every service before charging anything. If any one of them can't
     be sold directly, bail entirely — a partial basket would bill the
     customer for some of what they asked for and silently drop the rest. */
  const resolved: Array<{ key: string; label: string; cents: number; qty: number }> = [];
  for (const key of keys) {
    const svc = findService(key);
    if (!svc) return NextResponse.json({ error: `Unknown service: ${key}` }, { status: 400 });
    if (svc.priceCents == null) {
      return NextResponse.json(
        { error: "not-directly-purchasable", service: key },
        { status: 409 },
      );
    }
    let cents: number;
    try {
      cents = USE_TEST_PRICE ? TEST_OVERRIDE_CENTS : await getPriceCents(priceKeyForService(key));
    } catch {
      return NextResponse.json({ error: "not-directly-purchasable", service: key }, { status: 409 });
    }

    /* Multi-year annual return catch-up is billed per year, and the wizard
       collects the count in details.yearsOwing. */
    let qty = 1;
    if (key === "annual-return-multiple") {
      const n = parseInt(body.details?.yearsOwing ?? "", 10);
      qty = Number.isFinite(n) && n >= 2 && n <= 10 ? n : 2;
    }

    resolved.push({ key, label: svc.label, cents, qty });
  }

  const jurisdiction = JURISDICTIONS.find((j) => j.key === body.jurisdictionKey);
  const bucket       = getBucket(body.bucketKey ?? "");
  const stripe       = new Stripe(secret);
  const origin       = req.headers.get("origin") ?? new URL(req.url).origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode:                       "payment",
      payment_method_types:       ["card"],
      customer_email:             body.customer.email!.trim(),
      automatic_tax:              { enabled: true },
      billing_address_collection: "required",
      line_items: resolved.map((r) => ({
        price_data: {
          currency:     "cad",
          unit_amount:  r.cents,
          tax_behavior: "exclusive" as const,
          product_data: {
            name: jurisdiction ? `${r.label} — ${jurisdiction.label}` : r.label,
            description: [
              body.customer?.company ? `For ${body.customer.company}.` : "",
              "Filed by CRS. All government fees included.",
            ].filter(Boolean).join(" ").slice(0, 500),
          },
        },
        quantity: r.qty,
      })),
      metadata: {
        /* Multi-service basket — the webhook's generic branch handles it. */
        service:        resolved.length === 1 ? resolved[0].key : "wizard-multi",
        service_label:  resolved.map((r) => r.label).join(" · ").slice(0, 100),
        bucket:         bucket?.key ?? "",
        src:            (body.src ?? "wizard").slice(0, 100),
        company_name:   (body.customer?.company ?? "").slice(0, 100),
        jurisdiction:   jurisdiction?.label ?? "",
        province_key:   (body.jurisdictionKey ?? "").slice(0, 20),
        contact_name:   body.customer.fullName!.slice(0, 200),
        contact_phone:  (body.customer?.phone ?? "").slice(0, 40),
        services_count: String(resolved.length),
        services_list:  resolved.map((r) => `${r.key}${r.qty > 1 ? `×${r.qty}` : ""}`).join(",").slice(0, 480),
        ...chunkJson(body.details ?? {}, "details_json"),
      },
      success_url: `${origin}/order/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/#incorporate`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Payment setup failed.";
    console.error("[order/wizard-checkout] Stripe error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
