/**
 * Proof that the customer ticked "I agree to the Terms and Conditions and Privacy Policy" (owner, Oct 2026).
 *
 * The tick box (components/order/TermsAgreement) already disables the pay button until it is ticked, but nothing
 * recorded it: an order could not show WHICH terms were agreed or WHEN. Every checkout route now writes
 * `terms_accepted` into the Stripe session metadata — Stripe keeps it with the payment, and docu10 shows it on the
 * order. "not recorded" means the request came without the flag (an old browser tab, or a flow that never asked).
 *
 * TERMS_VERSION is the "Last updated" date printed on /terms — change both together.
 */
export const TERMS_VERSION = "2026-10-05";

export function termsMeta(body: unknown): { terms_accepted: string } {
  const ok = !!body && typeof body === "object" && (body as { termsAccepted?: unknown }).termsAccepted === true;
  return { terms_accepted: ok ? `yes · terms ${TERMS_VERSION} · ${new Date().toISOString()}` : "not recorded" };
}
