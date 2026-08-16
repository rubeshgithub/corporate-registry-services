import { NextResponse } from "next/server";
import Stripe from "stripe";
import { CHANGE_CONFIGS, type ChangeServiceKey } from "@/lib/change-config";
import { isProfessionalCorporation, proCorpPriceCents, PRO_CORP_SERVICES, type ProCorpServiceKey } from "@/lib/professional-corp";

/**
 * POST /api/order/change-request
 *
 * Body: { service, hit, details, contact, src }
 * Handles the 4 form-based change services: director/officer change,
 * registered address change, voluntary dissolution, corporate revival.
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
  service: ChangeServiceKey;
  hit:     Hit;
  details: unknown;
  contact: { name: string; email: string; phone: string };
  src:     string;
};

const TEST_OVERRIDE_CENTS = parseInt(process.env.ORDER_TEST_AMOUNT_CENTS ?? "", 10);
const USE_TEST_PRICE = Number.isFinite(TEST_OVERRIDE_CENTS) && TEST_OVERRIDE_CENTS > 0;
if (USE_TEST_PRICE) {
  console.warn(`[order/change-request] TEST PRICE ACTIVE: charging ${TEST_OVERRIDE_CENTS} cents for every change-request order.`);
}

function isValid(body: Body): string | null {
  if (!body?.service || !(body.service in CHANGE_CONFIGS)) return "Invalid or missing service.";
  if (!body?.hit?.name)                     return "Missing company selection.";
  if (!body?.contact?.name?.trim())         return "Missing contact name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body?.contact?.email ?? "")) return "Invalid email.";
  if (!body?.contact?.phone?.trim())        return "Missing phone number.";
  if (!body?.details)                       return "Missing details.";
  return null;
}

/** JSON-serialize the details object and chunk it across 500-char metadata keys. */
function chunkJson(obj: unknown, prefix: string, maxChunks = 8): Record<string, string> {
  const raw = JSON.stringify(obj);
  const out: Record<string, string> = {};
  const chunkSize = 480;
  for (let i = 0, n = 1; i < raw.length && n <= maxChunks; i += chunkSize, n++) {
    out[`${prefix}_${n}`] = raw.slice(i, i + chunkSize);
  }
  return out;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Payments are not configured." }, { status: 500 });

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const err = isValid(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const config = CHANGE_CONFIGS[body.service];

  /* Professional-corporation pricing, derived server-side from the registry
     hit (never a client flag). Director/officer and registered-address
     changes both map to the single "change of information" PC price;
     revival has its own. Voluntary dissolution has no published PC price,
     so it keeps the standard one. */
  const PC_SERVICE_FOR: Partial<Record<ChangeServiceKey, ProCorpServiceKey>> = {
    "change-directors": "change-of-information",
    "change-address":   "change-of-information",
    "revival":          "revival",
  };
  const pcServiceKey = PC_SERVICE_FOR[body.service];
  const isPC     = !!pcServiceKey && isProfessionalCorporation(body.hit);
  const pcCents  = pcServiceKey ? proCorpPriceCents(body.hit, pcServiceKey) : null;

  const unitAmount  = USE_TEST_PRICE ? TEST_OVERRIDE_CENTS : (pcCents ?? config.priceCents);
  const productName = isPC && pcServiceKey ? PRO_CORP_SERVICES[pcServiceKey].label : config.productName;
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
        ...chunkJson(body.details, "details_json"),
      },
      success_url: `${origin}/order/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/order/${config.key}?jurisdiction=${encodeURIComponent(body.hit.provinceKey)}&src=${encodeURIComponent(body.src)}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Payment setup failed.";
    console.error("[order/change-request] Stripe error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
