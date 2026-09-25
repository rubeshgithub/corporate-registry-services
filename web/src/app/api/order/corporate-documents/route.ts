import { NextResponse } from "next/server";
import Stripe from "stripe";
import { findService } from "@/lib/service-config";
import { getPriceCents } from "@/lib/pricing";
import { quoteDocuments } from "@/lib/corporate-documents-pricing";

/**
 * POST /api/order/corporate-documents
 *
 * Copies of Corporation Documents — the full set on the registry file, from
 * the date of incorporation through to today. Flat price, paid upfront.
 *
 * This replaced a quote-first flow: the visitor used to pick documents and
 * wait for a manual quote, which meant a real order sat in an inbox instead
 * of taking payment. The product is now a single full-set deliverable at one
 * price, so there is nothing to quote.
 *
 * The document checkboxes are retained as fulfillment scope — they tell the
 * team what the customer is actually chasing — but they do not change the
 * price. Price is resolved server-side from SERVICE_BUCKETS, never sent by
 * the client.
 */

export const runtime = "nodejs";

const DOC_LABELS: Record<string, string> = {
  "certificate":           "Certificate of Incorporation",
  "articles":              "Articles of Incorporation",
  "annual-returns":        "Annual returns",
  "change-of-information": "Change of information filings (directors, shareholders, address)",
  "other":                 "Other document (see notes)",
  "full-set":              "Full set of documents — everything on file, up to date",
};

type Hit = {
  name:             string;
  registryId:       string;
  businessNumber:   string;
  jurisdiction:     string;
  provinceKey:      string;
  location:         string;
  entityType?:      string;
  status?:          string;
  registrationDate?: string;
};

type Body = {
  hit:       Hit;
  documents: string[];
  notes?:    string;
  contact:   { name: string; email: string; phone: string };
  src:       string;
};

const TEST_OVERRIDE_CENTS = parseInt(process.env.ORDER_TEST_AMOUNT_CENTS ?? "", 10);
const USE_TEST_PRICE = Number.isFinite(TEST_OVERRIDE_CENTS) && TEST_OVERRIDE_CENTS > 0;
if (USE_TEST_PRICE) {
  console.warn(`[order/corporate-documents] TEST PRICE ACTIVE: charging ${TEST_OVERRIDE_CENTS} cents.`);
}

function isValid(body: Body): string | null {
  if (!body?.hit?.name)              return "Missing company selection.";
  if (!body?.contact?.name?.trim())  return "Missing contact name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body?.contact?.email ?? "")) return "Invalid email.";
  if (!body?.contact?.phone?.trim()) return "Missing phone number.";
  for (const key of body.documents ?? []) {
    if (!(key in DOC_LABELS))        return `Unknown document: ${key}`;
  }
  if ((body.documents ?? []).includes("other") && !body.notes?.trim()) {
    return "Tell us which other document you need.";
  }
  return null;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Payments are not configured." }, { status: 500 });

  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const err = isValid(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const service = findService("corporate-documents");
  if (!service?.priceCents) {
    return NextResponse.json({ error: "Service is not priced." }, { status: 500 });
  }

  /* Per-document pricing (government fee included) with the full set as a
     cap — resolved server-side from the catalogue, never from the client. */
  const quote = quoteDocuments(
    body.documents ?? [],
    await getPriceCents("corporate-document-single"),
    await getPriceCents("corporate-documents"),
  );
  const unitAmount = USE_TEST_PRICE ? TEST_OVERRIDE_CENTS : quote.unitCents;
  const quantity   = USE_TEST_PRICE ? 1 : quote.quantity;
  const wanted     = (body.documents ?? []).map((k) => DOC_LABELS[k]).filter(Boolean);
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
              name:        quote.mode === "full-set"
                             ? `Corporate Documents — Full Set — ${body.hit.jurisdiction}`
                             : `Corporate Document Copy — ${body.hit.jurisdiction}`,
              description: (quote.mode === "full-set"
                             ? `${body.hit.name} · Registry ID ${body.hit.registryId || "—"}. Full set on file from the date of incorporation to date. Government fees included.`
                             : `${body.hit.name} · Registry ID ${body.hit.registryId || "—"}. Per document, government fee included.`).slice(0, 500),
            },
          },
          quantity,
        },
      ],
      metadata: {
        service:         "corporate-documents",
        service_label:   "Copies of Corporation Documents",
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
        // Scope hints for fulfillment — not price-affecting.
        docs_requested:  wanted.join(" · ").slice(0, 480) || "Full set",
        pricing_mode:    quote.mode,
        doc_count:       String(quote.count),
        notes:           (body.notes ?? "").slice(0, 480),
      },
      success_url: `${origin}/order/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/order/corporate-documents?jurisdiction=${encodeURIComponent(body.hit.provinceKey)}&src=${encodeURIComponent(body.src ?? "")}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Payment setup failed.";
    console.error("[order/corporate-documents] Stripe error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
