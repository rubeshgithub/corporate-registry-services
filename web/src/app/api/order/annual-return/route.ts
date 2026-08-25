import { NextResponse } from "next/server";
import Stripe from "stripe";
import { isProfessionalCorporation } from "@/lib/professional-corp";
import { getPriceCents, proCorpPriceCentsLive } from "@/lib/pricing";

/**
 * POST /api/order/annual-return
 *
 * Body:
 * {
 *   hit:            { name, registryId, businessNumber, jurisdiction, provinceKey, location, entityType, status, registrationDate },
 *   changeKind:     "none" | "directors" | "address",
 *   changeDetails:  string,
 *   contact:        { name, email, phone },
 *   src:            string   // article-<slug> for attribution
 * }
 *
 * Creates a Stripe Checkout Session for the $99 annual return service and
 * returns { url } for the client to redirect to. All order data lives in
 * session metadata so it survives Stripe's redirect and is fetchable on
 * the thanks page for fulfillment.
 */

/**
 * Charge amount per year, in CAD cents. Normally $99.00.
 * If ORDER_TEST_AMOUNT_CENTS is set on the server, we use that instead so a
 * real card can complete a live-mode end-to-end test for cheap. Unset the
 * env var after testing to restore the real price — no code deploy needed.
 */
const REAL_PRICE_PER_YEAR_CAD_CENTS = 9900;
const TEST_OVERRIDE_CENTS = parseInt(process.env.ORDER_TEST_AMOUNT_CENTS ?? "", 10);
const USE_TEST_PRICE = Number.isFinite(TEST_OVERRIDE_CENTS) && TEST_OVERRIDE_CENTS > 0;
const PRICE_PER_YEAR_CAD_CENTS = USE_TEST_PRICE
  ? TEST_OVERRIDE_CENTS
  : REAL_PRICE_PER_YEAR_CAD_CENTS;
if (PRICE_PER_YEAR_CAD_CENTS !== REAL_PRICE_PER_YEAR_CAD_CENTS) {
  console.warn(`[order/annual-return] TEST PRICE ACTIVE: charging ${PRICE_PER_YEAR_CAD_CENTS} cents per year (real price is ${REAL_PRICE_PER_YEAR_CAD_CENTS}).`);
}

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

type Changes = {
  directors: Array<{ id: string; type: string; name: string; effectiveDate: string; newAddress: string }>;
  shareholders: Array<{ id: string; type: string; name: string; effectiveDate: string; newAddress: string; oldPercent: string; newPercent: string }>;
  registeredAddress: { changed: boolean; newAddress: string; effectiveDate: string };
  recordsAddress:    { changed: boolean; newAddress: string; effectiveDate: string };
  authorizedAgent:   { changed: boolean; newAgent:    string; effectiveDate: string };
  other:             string;
};

type Body = {
  hit:      Hit;
  years:    number;
  changes:  Changes;
  contact:  { name: string; email: string; phone: string };
  src:      string;
  ref?:     string;   // outreach token from /o/<token> — used to attribute conversions
};

function isValid(body: Body): string | null {
  if (!body?.hit?.name)                     return "Missing company selection.";
  if (!body?.contact?.name?.trim())         return "Missing contact name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body?.contact?.email ?? "")) return "Invalid email.";
  if (!body?.contact?.phone?.trim())        return "Missing phone number.";
  if (!Number.isFinite(body.years) || body.years < 1 || body.years > 10) return "Years must be between 1 and 10.";
  if (!body.changes)                        return "Missing changes payload.";
  const c = body.changes;
  for (const d of c.directors) {
    if (!d.name?.trim() || !d.effectiveDate) return "Every director change needs a name and effective date.";
    if (d.type === "address" && !d.newAddress?.trim()) return "Director address change needs the new address.";
  }
  for (const s of c.shareholders) {
    if (!s.name?.trim() || !s.effectiveDate) return "Every shareholder change needs a name and effective date.";
    if (s.type === "address" && !s.newAddress?.trim()) return "Shareholder address change needs the new address.";
    if (s.type === "voting"  && (!s.oldPercent?.trim() || !s.newPercent?.trim())) return "Voting % change needs old and new values.";
  }
  if (c.registeredAddress?.changed && (!c.registeredAddress.newAddress?.trim() || !c.registeredAddress.effectiveDate)) return "Registered address change needs the new address and date.";
  if (c.recordsAddress?.changed    && (!c.recordsAddress.newAddress?.trim()    || !c.recordsAddress.effectiveDate))    return "Records address change needs the new address and date.";
  if (c.authorizedAgent?.changed   && (!c.authorizedAgent.newAgent?.trim()     || !c.authorizedAgent.effectiveDate))   return "Authorized agent change needs the new agent and date.";
  return null;
}

/**
 * Human-readable single-line summary — goes into Stripe metadata so the
 * fulfillment inbox has an at-a-glance view without expanding JSON.
 */
function summarizeChanges(c: Changes): { summary: string; hasAny: boolean } {
  const parts: string[] = [];
  if (c.directors.length)      parts.push(`${c.directors.length} director change${c.directors.length === 1 ? "" : "s"}`);
  if (c.shareholders.length)   parts.push(`${c.shareholders.length} shareholder change${c.shareholders.length === 1 ? "" : "s"}`);
  if (c.registeredAddress.changed) parts.push("registered address change");
  if (c.recordsAddress.changed)    parts.push("records address change");
  if (c.authorizedAgent.changed)   parts.push("authorized agent change");
  if (c.other.trim())              parts.push("other change (see notes)");
  return { summary: parts.length ? parts.join(" · ") : "no changes reported", hasAny: parts.length > 0 };
}

/**
 * JSON-serialize the changes and split across `changes_json_1..N` metadata
 * keys of ≤500 chars each so Stripe metadata never truncates real payloads.
 * The webhook reassembles by key prefix.
 */
function chunkJson(obj: unknown, prefix: string, maxChunks = 8): Record<string, string> {
  const raw = JSON.stringify(obj);
  const out: Record<string, string> = {};
  const chunkSize = 480; // leave headroom for safety
  for (let i = 0, n = 1; i < raw.length && n <= maxChunks; i += chunkSize, n++) {
    out[`${prefix}_${n}`] = raw.slice(i, i + chunkSize);
  }
  return out;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Payments are not configured. Set STRIPE_SECRET_KEY." }, { status: 500 });
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const err = isValid(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const stripe = new Stripe(secret);
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const years  = Math.round(body.years);

  /* Professional corporations file the same registry annual return but on a
     second track alongside their regulator's permit renewal, and are priced
     accordingly. Derived server-side from the registry hit — a client-sent
     flag would let the customer pick the cheaper standard rate. */
  const isPC       = isProfessionalCorporation(body.hit);
  const pcPerYear  = await proCorpPriceCentsLive(isPC, "annual-return");
  const perYearCents = USE_TEST_PRICE
    ? PRICE_PER_YEAR_CAD_CENTS
    : (pcPerYear ?? await getPriceCents("annual-return"));

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: body.contact.email.trim(),
      // Let Stripe compute GST/HST/PST from the billing address the customer
      // supplies on Stripe's hosted page. Requires Stripe Tax to be enabled
      // in the dashboard (Settings → Tax → Configure).
      automatic_tax: { enabled: true },
      billing_address_collection: "required",
      line_items: [
        {
          price_data: {
            currency:     "cad",
            unit_amount:  perYearCents,
            // "exclusive" — GST is added on top of the all-in price, matching
            // the "$99 all-in + GST" ($139 for professional corporations)
            // messaging on every surface.
            tax_behavior: "exclusive",
            product_data: {
              name: (() => {
                const label = isPC ? "Professional Corporation Annual Return" : "Annual Return";
                return years === 1
                  ? `${label} — ${body.hit.jurisdiction}`
                  : `${label} (${years} years) — ${body.hit.jurisdiction}`;
              })(),
              description: `${body.hit.name} · Registry ID ${body.hit.registryId || "—"}. Filed by CRS within 24 hours.`,
            },
          },
          quantity: years,
        },
      ],
      // All the data our fulfillment team needs — Stripe caps each value at
      // 500 chars and each key at 40 chars; metadata is capped at 50 keys.
      metadata: {
        service:            years === 1 ? "annual-return" : "annual-return-multiple",
        pro_corp:           isPC ? "yes" : "no",
        years_filed:        String(years),
        src:                body.src.slice(0, 100),
        outreach_ref:       (body.ref ?? "").slice(0, 32),
        company_name:       body.hit.name.slice(0, 100),
        registry_id:        (body.hit.registryId || "").slice(0, 100),
        business_number:    (body.hit.businessNumber || "").slice(0, 100),
        jurisdiction:       body.hit.jurisdiction.slice(0, 100),
        province_key:       body.hit.provinceKey.slice(0, 20),
        location:           body.hit.location.slice(0, 200),
        entity_type:        (body.hit.entityType || "").slice(0, 200),
        registry_status:    body.hit.status.slice(0, 20),
        incorp_date:        (body.hit.registrationDate || "").slice(0, 20),
        contact_name:       body.contact.name.slice(0, 200),
        contact_phone:      body.contact.phone.slice(0, 40),
        // Structured changes: summary for at-a-glance, full JSON chunked below.
        changes_summary:    summarizeChanges(body.changes).summary.slice(0, 480),
        ...chunkJson(body.changes, "changes_json"),
      },
      success_url: `${origin}/order/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/order/annual-return?jurisdiction=${encodeURIComponent(body.hit.provinceKey)}&src=${encodeURIComponent(body.src)}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Payment setup failed.";
    console.error("[order/annual-return] Stripe error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
