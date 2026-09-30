import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  MINUTE_BOOK_COPY,
  isSupportedProvince,
  minuteBookPriceKey,
  tierForIncorpDate,
  type MinuteBookPath,
  type ReportSource,
} from "@/lib/minute-book-config";
import { formatCents, getPriceCents } from "@/lib/pricing";

/**
 * Creates the Stripe Checkout session for a minute book order.
 * The tier (and therefore the price) is re-derived here from the
 * incorporation date — the client never sends an amount.
 */

const TEST_OVERRIDE_CENTS = parseInt(process.env.ORDER_TEST_AMOUNT_CENTS ?? "", 10);
const USE_TEST_PRICE = Number.isFinite(TEST_OVERRIDE_CENTS) && TEST_OVERRIDE_CENTS > 0;
if (USE_TEST_PRICE) console.warn(`[order/minute-book] TEST PRICE ACTIVE: ${TEST_OVERRIDE_CENTS} cents`);

type Hit = {
  name:             string;
  businessNumber:   string;
  registryId:       string;
  location:         string;
  status:           string;
  entityType:       string;
  registrationDate: string;
  jurisdiction:     string;
  provinceKey:      string;
};

type Body = {
  hit:               Hit;
  contact:           { name: string; email: string; phone: string; role: string };
  path:              MinuteBookPath;
  reportSource:      ReportSource;
  manualIncorpDate?: string; // YYYY-MM-DD, only when the registry hit has no date
  src:               string;
};

function isValid(body: Body): string | null {
  if (!body?.hit?.name?.trim())                       return "Pick your corporation first.";
  if (!isSupportedProvince(body.hit.provinceKey))     return "Minute books are currently available for Alberta, British Columbia, Ontario, and federal corporations.";
  if (!body.contact?.name?.trim())                    return "Please provide your full name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.contact?.email?.trim() ?? "")) return "Please provide a valid email address.";
  if (!body.contact?.phone?.trim())                   return "Please provide a phone number.";
  if (body.path !== "self" && body.path !== "crs")    return "Choose how you'd like the book built.";
  if (body.reportSource !== "crs_pull" && body.reportSource !== "customer_upload") return "Choose how we get your profile report.";
  return null;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Payments are not configured." }, { status: 500 });

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const err = isValid(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  /* Tier comes from the registry date when present, else the customer-supplied
     date (verified later against the profile report we pull). */
  const registryDate  = body.hit.registrationDate?.slice(0, 10) || "";
  const incorpDate    = registryDate || (body.manualIncorpDate?.slice(0, 10) ?? "");
  const incorpSource  = registryDate ? "registry" : "customer";
  const tier          = tierForIncorpDate(incorpDate);
  if (!tier) return NextResponse.json({ error: "We need your incorporation date to price the book. Please enter it." }, { status: 400 });

  const priceCents = await getPriceCents(minuteBookPriceKey(tier.key, body.path));
  const unitAmount = USE_TEST_PRICE ? TEST_OVERRIDE_CENTS : priceCents;
  const stripe     = new Stripe(secret);
  const origin     = req.headers.get("origin") ?? new URL(req.url).origin;

  const pathLabel = body.path === "crs" ? "Built by CRS" : "Self-serve online";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: body.contact.email.trim(),
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      line_items: [{
        price_data: {
          currency: "cad",
          unit_amount: unitAmount,
          tax_behavior: "exclusive",
          product_data: {
            name:        `${MINUTE_BOOK_COPY.productName} — ${tier.label} (${pathLabel})`,
            description: `${body.hit.name} · Registry ID ${body.hit.registryId || "—"} · ${body.hit.jurisdiction}. Current Corporate Profile Report included. All-inclusive — ${formatCents(priceCents)} + tax.`,
          },
        },
        quantity: 1,
      }],
      metadata: {
        service:          "minute-book",
        src:              (body.src || "direct").slice(0, 40),
        company_name:     body.hit.name.slice(0, 200),
        registry_id:      (body.hit.registryId || "").slice(0, 60),
        business_number:  (body.hit.businessNumber || "").slice(0, 40),
        jurisdiction:     (body.hit.jurisdiction || "").slice(0, 60),
        province_key:     (body.hit.provinceKey || "").slice(0, 20),
        location:         (body.hit.location || "").slice(0, 120),
        entity_type:      (body.hit.entityType || "").slice(0, 80),
        registry_status:  (body.hit.status || "").slice(0, 40),
        incorp_date:      incorpDate.slice(0, 10),
        contact_name:     body.contact.name.trim().slice(0, 120),
        contact_phone:    body.contact.phone.trim().slice(0, 40),
        mb_tier:          tier.key,
        mb_path:          body.path,
        mb_report_source: body.reportSource,
        mb_incorp_source: incorpSource,
        mb_contact_role:  (body.contact.role || "").slice(0, 40),
      },
      success_url: `${origin}/order/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/order/minute-book?src=${encodeURIComponent(body.src || "direct")}`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[order/minute-book] Stripe error:", msg);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
