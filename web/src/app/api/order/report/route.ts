import { NextResponse } from "next/server";
import Stripe from "stripe";
import { REPORT_CONFIGS, type ReportServiceKey } from "@/lib/report-config";
import { isProfessionalCorporation, proCorpPriceCents, PRO_CORP_SERVICES } from "@/lib/professional-corp";

/**
 * POST /api/order/report
 *
 * Body:
 * {
 *   service: "profile-report" | "good-standing",
 *   hit:     { name, registryId, businessNumber, jurisdiction, provinceKey,
 *              location, entityType, status, registrationDate },
 *   contact: { name, email, phone },
 *   src:     string
 * }
 *
 * Creates a Stripe Checkout Session for the chosen report service. Price and
 * copy come from REPORT_CONFIGS; ORDER_TEST_AMOUNT_CENTS overrides both like
 * the other order routes so a live-mode dollar test is possible.
 */

type Hit = {
  name:             string;
  registryId:       string;
  businessNumber:   string;
  jurisdiction:     string;
  provinceKey:      string;
  location:         string;
  entityType:       string;
  status:           string;
  registrationDate: string;
};

type Body = {
  service: ReportServiceKey;
  hit:     Hit;
  contact: { name: string; email: string; phone: string };
  src:     string;
};

const TEST_OVERRIDE_CENTS = parseInt(process.env.ORDER_TEST_AMOUNT_CENTS ?? "", 10);
const USE_TEST_PRICE = Number.isFinite(TEST_OVERRIDE_CENTS) && TEST_OVERRIDE_CENTS > 0;
if (USE_TEST_PRICE) {
  console.warn(`[order/report] TEST PRICE ACTIVE: charging ${TEST_OVERRIDE_CENTS} cents for every report order.`);
}

function isValid(body: Body): string | null {
  if (!body?.service || !(body.service in REPORT_CONFIGS)) return "Invalid or missing service.";
  if (!body?.hit?.name)                     return "Missing company selection.";
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

  const config = REPORT_CONFIGS[body.service];

  /* Professional-corporation pricing. Derived HERE from the registry hit —
     never from a client-sent flag, because the PC price is higher than the
     standard one and a lying client would otherwise underpay. Only the
     profile report has a published PC price; good-standing keeps its
     standard price until one is set. */
  const isPC     = body.service === "profile-report" && isProfessionalCorporation(body.hit);
  const pcCents  = isPC ? proCorpPriceCents(body.hit, "profile-report") : null;
  const baseCents = pcCents ?? config.priceCents;

  const unitAmount  = USE_TEST_PRICE ? TEST_OVERRIDE_CENTS : baseCents;
  const productName = isPC ? PRO_CORP_SERVICES["profile-report"].label : config.productName;
  const stripe      = new Stripe(secret);
  const origin      = req.headers.get("origin") ?? new URL(req.url).origin;

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
              name:        `${productName} — ${body.hit.jurisdiction}`,
              description: `${body.hit.name} · Registry ID ${body.hit.registryId || "—"}. ${config.productBlurb}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        service:         config.key,
        // Flags the fulfillment inbox that this is a professional corporation
        // and was charged at the PC rate.
        pro_corp:        isPC ? "yes" : "no",
        src:             body.src.slice(0, 100),
        company_name:    body.hit.name.slice(0, 100),
        registry_id:     (body.hit.registryId || "").slice(0, 100),
        business_number: (body.hit.businessNumber || "").slice(0, 100),
        jurisdiction:    body.hit.jurisdiction.slice(0, 100),
        province_key:    body.hit.provinceKey.slice(0, 20),
        location:        body.hit.location.slice(0, 200),
        entity_type:     (body.hit.entityType || "").slice(0, 200),
        registry_status: body.hit.status.slice(0, 20),
        incorp_date:     (body.hit.registrationDate || "").slice(0, 20),
        contact_name:    body.contact.name.slice(0, 200),
        contact_phone:   body.contact.phone.slice(0, 40),
      },
      success_url: `${origin}/order/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/order/${config.key}?jurisdiction=${encodeURIComponent(body.hit.provinceKey)}&src=${encodeURIComponent(body.src)}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Payment setup failed.";
    console.error("[order/report] Stripe error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
