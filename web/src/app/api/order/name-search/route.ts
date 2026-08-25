import { NextResponse } from "next/server";
import Stripe from "stripe";
import { NAME_SEARCH_CONFIGS, type NameSearchServiceKey } from "@/lib/name-search-config";
import { JURISDICTIONS } from "@/lib/service-config";
import { getPriceCents } from "@/lib/pricing";

/**
 * POST /api/order/name-search
 *
 * Body:
 * {
 *   service:       "corporate-search" | "nuans-search",
 *   proposedName:  string,
 *   altName:       string,
 *   jurisdiction:  string (only required for corporate-search),
 *   contact:       { name, email, phone },
 *   src:           string
 * }
 */

type Body = {
  service:      NameSearchServiceKey;
  proposedName: string;
  altName:      string;
  jurisdiction: string;
  contact:      { name: string; email: string; phone: string };
  src:          string;
};

const TEST_OVERRIDE_CENTS = parseInt(process.env.ORDER_TEST_AMOUNT_CENTS ?? "", 10);
const USE_TEST_PRICE = Number.isFinite(TEST_OVERRIDE_CENTS) && TEST_OVERRIDE_CENTS > 0;
if (USE_TEST_PRICE) {
  console.warn(`[order/name-search] TEST PRICE ACTIVE: charging ${TEST_OVERRIDE_CENTS} cents for every name-search order.`);
}

function isValid(body: Body): string | null {
  if (!body?.service || !(body.service in NAME_SEARCH_CONFIGS)) return "Invalid or missing service.";
  if (!body?.proposedName || body.proposedName.trim().length < 2) return "Proposed name is required.";
  const config = NAME_SEARCH_CONFIGS[body.service];
  if (config.needsJurisdiction && !body.jurisdiction) return "Choose a jurisdiction.";
  if (!body?.contact?.name?.trim())         return "Missing contact name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body?.contact?.email ?? "")) return "Invalid email.";
  if (!body?.contact?.phone?.trim())        return "Missing phone number.";
  return null;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Payments are not configured." }, { status: 500 });

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const err = isValid(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const config     = NAME_SEARCH_CONFIGS[body.service];
  const unitAmount = USE_TEST_PRICE ? TEST_OVERRIDE_CENTS : await getPriceCents(body.service);
  const jurisdictionLabel = body.jurisdiction
    ? JURISDICTIONS.find((j) => j.key === body.jurisdiction)?.label ?? body.jurisdiction
    : "Federal";
  const stripe = new Stripe(secret);
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode:                       "payment",
      payment_method_types:       ["card"],
      customer_email:             body.contact.email.trim(),
      automatic_tax:              { enabled: true },
      billing_address_collection: "required",
      line_items: [
        {
          price_data: {
            currency:     "cad",
            unit_amount:  unitAmount,
            tax_behavior: "exclusive",
            product_data: {
              name:        `${config.productName} — ${jurisdictionLabel}`,
              description: `Proposed name: ${body.proposedName.trim()}${body.altName ? ` (fallback: ${body.altName.trim()})` : ""}. ${config.productBlurb}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        service:        config.key,
        src:            body.src.slice(0, 100),
        proposed_name:  body.proposedName.slice(0, 200),
        alt_name:       (body.altName || "").slice(0, 200),
        jurisdiction:   jurisdictionLabel.slice(0, 100),
        province_key:   body.jurisdiction.slice(0, 20),
        contact_name:   body.contact.name.slice(0, 200),
        contact_phone:  body.contact.phone.slice(0, 40),
      },
      success_url: `${origin}/order/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/order/${config.key}?jurisdiction=${encodeURIComponent(body.jurisdiction)}&src=${encodeURIComponent(body.src)}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Payment setup failed.";
    console.error("[order/name-search] Stripe error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
