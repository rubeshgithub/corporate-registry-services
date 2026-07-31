import { NextResponse } from "next/server";
import Stripe from "stripe";

/**
 * GET /api/order/session?id={session_id}
 *
 * Server-side check that the payment actually succeeded before we tell
 * the customer we've received it. Returns a small summary suitable for
 * the thanks page — we never expose the full session object client-side.
 */
export async function GET(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Payments are not configured." }, { status: 500 });
  }

  const url = new URL(req.url);
  const id  = url.searchParams.get("id");
  if (!id || !id.startsWith("cs_")) {
    return NextResponse.json({ error: "Invalid session id." }, { status: 400 });
  }

  const stripe = new Stripe(secret);
  try {
    const session = await stripe.checkout.sessions.retrieve(id);
    return NextResponse.json({
      status:       session.payment_status === "paid" ? "paid" : "unpaid",
      company:      (session.metadata?.company_name as string) ?? "",
      jurisdiction: (session.metadata?.jurisdiction as string) ?? "",
      amount:       session.amount_total ? `$${(session.amount_total / 100).toFixed(2)} ${session.currency?.toUpperCase()}` : "",
      // Used by the thanks page to fire the GA4 purchase event.
      service:      (session.metadata?.service as string) ?? "",
      value:        session.amount_total ? session.amount_total / 100 : 0,
      currency:     session.currency?.toUpperCase() ?? "CAD",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Session lookup failed.";
    console.error("[order/session] Stripe error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
