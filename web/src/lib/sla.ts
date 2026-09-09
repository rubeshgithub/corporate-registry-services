/**
 * Turnaround promises, in one place.
 *
 * Customer feedback, Sept 2026: an order placed before the Labour Day weekend
 * carried a bare "filed within 24 hours" promise. The customer did not expect
 * a filing on the holiday itself, but reasonably expected one on the Saturday
 * — nothing on the site said registries are shut. That is an expectation the
 * copy set, not a delivery failure.
 *
 * Two things follow, and both live here so the promise is changed once rather
 * than across ~130 lines of copy:
 *
 *   1. Durations are stated in business days / business hours, never in bare
 *      clock time.
 *   2. Anywhere a customer commits money, we say plainly when registries are
 *      open, because that is the constraint they are actually buying into.
 */

/** Filing SLA. Business days, because registries are shut on weekends. */
export const FILING_TURNAROUND = "1 business day";

/** Response / delivery SLA for reports, quotes and enquiries. */
export const RESPONSE_TIME = "1 business hour";

/**
 * Shown at the point of payment and on the receipt. Keep it one short
 * sentence — it is a clarification, not a disclaimer, and burying the
 * constraint in fine print is what caused the confusion in the first place.
 */
export const REGISTRY_CLOSURE_NOTE =
  "Registries are closed weekends and statutory holidays.";
