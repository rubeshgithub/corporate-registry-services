import { NextResponse } from "next/server";
import Stripe from "stripe";
import { findService, findBucketForService } from "@/lib/service-config";

/**
 * POST /api/order/service
 *
 * Generic checkout for catalogue services that don't have a bespoke
 * lookup-first flow of their own — extra-provincial registration, name
 * changes, articles of amendment, share splits, amalgamation, continuance,
 * registered office, compliance review, minute books.
 *
 * Price comes from SERVICE_BUCKETS (the single source of truth) resolved
 * server-side from the service key. The client sends the key, never a
 * price — same trust boundary as every other order route here.
 *
 * Body: { serviceKey, hit, details, contact, src }
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
  serviceKey: string;
  hit:        Hit;
  details:    Record<string, string>;
  contact:    { name: string; email: string; phone: string };
  src:        string;
};

const TEST_OVERRIDE_CENTS = parseInt(process.env.ORDER_TEST_AMOUNT_CENTS ?? "", 10);
const USE_TEST_PRICE = Number.isFinite(TEST_OVERRIDE_CENTS) && TEST_OVERRIDE_CENTS > 0;
if (USE_TEST_PRICE) {
  console.warn(`[order/service] TEST PRICE ACTIVE: charging ${TEST_OVERRIDE_CENTS} cents for every generic service order.`);
}

function isValid(body: Body): string | null {
  if (!body?.serviceKey)                    return "Missing service.";
  if (!body?.hit?.name)                     return "Missing company selection.";
  if (!body?.contact?.name?.trim())         return "Missing contact name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body?.contact?.email ?? "")) return "Invalid email.";
  if (!body?.contact?.phone?.trim())        return "Missing phone number.";
  return null;
}

/** Chunk the details payload across 500-char metadata keys, same convention
 *  the other order routes use so the webhook can reassemble it. */
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

  /* Resolve the service — and therefore the price — server-side. A client
     that sends an unknown key, or one for a service that isn't directly
     purchasable, gets rejected rather than a guessed amount. */
  const service = findService(body.serviceKey);
  if (!service) return NextResponse.json({ error: "Unknown service." }, { status: 400 });
  if (service.priceCents == null) {
    return NextResponse.json({ error: "This service is not available for direct checkout." }, { status: 400 });
  }
  if (service.orderPath) {
    /* Guard against drift: if a service later gains its own flow, that flow
       owns the checkout and this generic route should stop serving it. */
    return NextResponse.json({ error: "This service has a dedicated order flow." }, { status: 400 });
  }

  const bucket     = findBucketForService(body.serviceKey);
  const unitAmount = USE_TEST_PRICE ? TEST_OVERRIDE_CENTS : service.priceCents;
  const stripe     = new Stripe(secret);
  const origin     = req.headers.get("origin") ?? new URL(req.url).origin;

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
              name:        `${service.label} — ${body.hit.jurisdiction}`,
              description: `${body.hit.name} · Registry ID ${body.hit.registryId || "—"}. ${service.description}`.slice(0, 500),
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        service:         service.key,
        service_label:   service.label.slice(0, 100),
        bucket:          bucket?.key ?? "",
        src:             (body.src ?? "").slice(0, 100),
        company_name:    body.hit.name.slice(0, 100),
        registry_id:     (body.hit.registryId || "").slice(0, 100),
        business_number: (body.hit.businessNumber || "").slice(0, 100),
        jurisdiction:    body.hit.jurisdiction.slice(0, 100),
        province_key:    body.hit.provinceKey.slice(0, 20),
        location:        (body.hit.location || "").slice(0, 200),
        entity_type:     (body.hit.entityType || "").slice(0, 200),
        registry_status: (body.hit.status || "").slice(0, 20),
        incorp_date:     (body.hit.registrationDate || "").slice(0, 20),
        contact_name:    body.contact.name.slice(0, 200),
        contact_phone:   body.contact.phone.slice(0, 40),
        ...chunkJson(body.details ?? {}, "details_json"),
      },
      success_url: `${origin}/order/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/order/service/${service.key}?jurisdiction=${encodeURIComponent(body.hit.provinceKey)}&src=${encodeURIComponent(body.src ?? "")}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Payment setup failed.";
    console.error("[order/service] Stripe error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
