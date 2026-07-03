import { NextResponse } from "next/server";
import Stripe from "stripe";

/**
 * POST /api/order/incorporation
 *
 * Body: { form: FormState, src: string }
 *
 * FormState mirrors the client-side type in IncorporationOrderFlow.tsx.
 * We flatten a summary into Stripe session metadata so the webhook can
 * fulfill without a separate DB lookup.
 */

/**
 * Charge amount per incorporation type, in CAD cents.
 * If ORDER_TEST_AMOUNT_CENTS is set on the server, every subtype charges
 * that amount instead — used for one-off live-mode end-to-end tests.
 * Unset the env var after testing to restore real prices.
 */
const REAL_PRICE_CENTS: Record<string, number> = {
  numbered:            69900,
  named:               74900,
  "extra-provincial":  29900,
  "not-for-profit":    69900,
};
const TEST_OVERRIDE_CENTS = parseInt(process.env.ORDER_TEST_AMOUNT_CENTS ?? "", 10);
const USE_TEST_PRICE = Number.isFinite(TEST_OVERRIDE_CENTS) && TEST_OVERRIDE_CENTS > 0;
const PRICE_CENTS: Record<string, number> = USE_TEST_PRICE
  ? Object.fromEntries(Object.keys(REAL_PRICE_CENTS).map((k) => [k, TEST_OVERRIDE_CENTS]))
  : REAL_PRICE_CENTS;
if (USE_TEST_PRICE) {
  console.warn(`[order/incorporation] TEST PRICE ACTIVE: charging ${TEST_OVERRIDE_CENTS} cents for every incorporation type.`);
}

const LABEL: Record<string, string> = {
  numbered:           "Numbered Company",
  named:              "Named Company",
  "extra-provincial": "Extra-Provincial Registration",
  "not-for-profit":   "Not-for-Profit",
};

type Address = { street: string; city: string; province: string; postalCode: string; country: string };
type Person  = { fullName: string; street: string; city: string; province: string; postal: string; country: string; email: string; phone: string };
type Shareholder = Person & { sharePercent: string };
type Body    = {
  form: {
    companyType:      "numbered" | "named" | "extra-provincial" | "not-for-profit";
    jurisdictionKey:  string;
    nameOptions:      [string, string, string];
    homeJurisdiction: string;
    existingCorpName: string;
    registeredAddress: Address;
    recordsSameAsRegistered: boolean;
    recordsAddress:    Address;
    directors:         Person[];
    shareholders:      Shareholder[];
    incorporator: {
      fullName: string;
      email: string;
      phone: string;
      relationship: string;
      relationshipOther: string;
    };
    natureOfBusiness: string;
    fiscalYearEnd:    string;
    restrictions:     string;
  };
  src: string;
};

function isValid(b: Body): string | null {
  const f = b.form;
  if (!f)                            return "Missing form.";
  if (!(f.companyType in PRICE_CENTS)) return "Invalid company type.";
  if (!f.jurisdictionKey)            return "Choose a jurisdiction.";
  if (f.companyType === "named" && !f.nameOptions.some((n) => n.trim())) return "At least one proposed name is required.";
  if (f.companyType === "extra-provincial" && (!f.homeJurisdiction || !f.existingCorpName.trim())) return "Home jurisdiction and existing name are required.";
  if (!f.registeredAddress.street || !f.registeredAddress.city || !f.registeredAddress.province || !f.registeredAddress.postalCode) return "Registered address is incomplete.";
  if (!f.recordsSameAsRegistered) {
    const r = f.recordsAddress;
    if (!r.street || !r.city || !r.province || !r.postalCode) return "Records address is incomplete.";
  }
  if (!f.directors.length) return "At least one director is required.";
  for (const d of f.directors) {
    if (!d.fullName.trim() || !d.street || !d.city || !d.province || !d.postal) return "Every director needs a name and full address.";
  }
  const inc = f.incorporator;
  if (!inc.fullName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inc.email) || !inc.phone.trim()) return "Incorporator name, email, and phone are required.";
  if (inc.relationship === "Other" && !inc.relationshipOther.trim()) return "Please specify the incorporator relationship.";
  if (!f.natureOfBusiness.trim()) return "Nature of business is required.";
  return null;
}

function summarize(f: Body["form"]) {
  const fmtAddr = (a: Address) =>
    [a.street, a.city, a.province, a.postalCode, a.country].filter(Boolean).join(", ");
  const directorsSummary = f.directors.map((d) => `${d.fullName} — ${d.street}, ${d.city}, ${d.province} ${d.postal}`).join(" | ");
  const shareholdersSummary = f.shareholders.length
    ? f.shareholders.map((s) => `${s.fullName} (${s.sharePercent}%) — ${s.street}, ${s.city}, ${s.province} ${s.postal}`).join(" | ")
    : "Deferred to first-year tax filing";
  return { directorsSummary, shareholdersSummary, registered: fmtAddr(f.registeredAddress), records: f.recordsSameAsRegistered ? "Same as registered" : fmtAddr(f.recordsAddress) };
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Payments are not configured." }, { status: 500 });

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }

  const err = isValid(body);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const f = body.form;
  const stripe = new Stripe(secret);
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const sum = summarize(f);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: f.incorporator.email.trim(),
      line_items: [
        {
          price_data: {
            currency: "cad",
            unit_amount: PRICE_CENTS[f.companyType],
            product_data: {
              name: `Incorporation — ${LABEL[f.companyType]} — ${f.jurisdictionKey.toUpperCase()}`,
              description: f.companyType === "named"
                ? `Proposed names: ${f.nameOptions.filter((n) => n.trim()).join(" · ")}. Filed by CRS within 24 hours.`
                : `${LABEL[f.companyType]}. Filed by CRS within 24 hours.`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        service:              "incorporation",
        incorporation_type:   f.companyType,
        src:                  body.src.slice(0, 100),
        jurisdiction:         f.jurisdictionKey.slice(0, 20),
        name_options:         f.nameOptions.filter((n) => n.trim()).join(" · ").slice(0, 300),
        existing_corp_name:   (f.existingCorpName || "").slice(0, 200),
        home_jurisdiction:    (f.homeJurisdiction || "").slice(0, 20),
        registered_address:   sum.registered.slice(0, 400),
        records_address:      sum.records.slice(0, 400),
        directors_count:      String(f.directors.length),
        directors_summary:    sum.directorsSummary.slice(0, 500),
        shareholders_count:   String(f.shareholders.length),
        shareholders_summary: sum.shareholdersSummary.slice(0, 500),
        nature_of_business:   f.natureOfBusiness.slice(0, 500),
        fiscal_year_end:      f.fiscalYearEnd.slice(0, 10),
        restrictions:         f.restrictions.slice(0, 400),
        incorp_name:          f.incorporator.fullName.slice(0, 200),
        incorp_phone:         f.incorporator.phone.slice(0, 40),
        incorp_relationship:  (f.incorporator.relationship === "Other" ? f.incorporator.relationshipOther : f.incorporator.relationship).slice(0, 100),
      },
      success_url: `${origin}/order/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/order/incorporation?jurisdiction=${encodeURIComponent(f.jurisdictionKey)}&type=${encodeURIComponent(f.companyType)}&src=${encodeURIComponent(body.src)}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Payment setup failed.";
    console.error("[order/incorporation] Stripe error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
