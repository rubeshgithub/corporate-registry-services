/**
 * Registry access credentials by jurisdiction.
 *
 * Most provinces gate filings behind a per-corporation credential. They all
 * call it something different, and using the wrong word tells the customer
 * you don't know their registry — so every string here is the province's own
 * terminology, verified against the registry's own documentation.
 *
 * ── The commercial point ────────────────────────────────────────────────
 * This looks like friction and is actually the moat. A customer who has lost
 * their Company Key literally cannot self-file — they are precisely the
 * person who should be paying us. So the copy never presents the credential
 * as a hurdle the customer must clear before we'll help; it presents having
 * it as a shortcut, and not having it as something we handle.
 *
 * The field is therefore ALWAYS optional and never gates payment.
 *
 * ── One honest limitation ───────────────────────────────────────────────
 * Every registry delivers a replacement credential to the corporation's own
 * registered email or mailing address — never to an agent. So we can request
 * it on the customer's behalf, but they must still be able to receive it.
 * When they can't, the real fix is a registered-address change first, which
 * is why that is offered as an explicit third option rather than discovered
 * later by email.
 *
 * Jurisdictions absent from this map show no credential block at all. That
 * is deliberate: silence is better than a guessed claim about someone's
 * registry.
 */

export type RegistryAccess = {
  /** The province's own name for the credential. */
  term:        string;
  /** Short label for the input field. */
  fieldLabel:  string;
  placeholder: string;
  /** One line explaining what it is and where it lives. */
  whatItIs:    string;
  /** What we do when the customer doesn't have it. */
  ifMissing:   string;
  /** Roughly how long a replacement takes, when the registry publishes it. */
  turnaround?: string;
};

export const REGISTRY_ACCESS: Record<string, RegistryAccess> = {
  on: {
    term:        "Company Key",
    fieldLabel:  "Company Key",
    placeholder: "9-digit Company Key",
    whatItIs:
      "Ontario requires a Company Key for any filing after incorporation. Corporations formed after 19 October 2021 received one at incorporation; older corporations have to request it.",
    ifMissing:
      "We'll submit the ServiceOntario request for you. The key is sent to the corporation's registered email address, or by mail if there is no email on file.",
    turnaround:  "usually about 3 business days",
  },

  bc: {
    term:        "access code or company password",
    fieldLabel:  "Access code or company password",
    placeholder: "Access code from your reminder notice",
    whatItIs:
      "BC accepts either the access code printed on your annual report reminder notice, or the company password if one was set for the company.",
    ifMissing:
      "We'll recover it with you — BC Registries has a self-serve reset for the company password, and we can request the access code where it applies.",
  },

  sk: {
    term:        "entity access code",
    fieldLabel:  "Entity access code",
    placeholder: "Access code from your renewal notice",
    whatItIs:
      "Saskatchewan issues an entity access code and emails it with your annual renewal notice. It's required to file annual returns and to update directors or addresses.",
    ifMissing:
      "We'll submit a Request Entity Access Code to the Corporate Registry for you. It's issued to the corporation's contact on record.",
  },

  mb: {
    term:        "barcode number",
    fieldLabel:  "Barcode number",
    placeholder: "Barcode from your Annual Return notice",
    whatItIs:
      "Manitoba prints a barcode number in the top-left corner of the Annual Return notice mailed to the corporation. That number is what authorises the online filing.",
    ifMissing:
      "We'll arrange a new barcode. Where the corporation is authorised online we can obtain one directly; otherwise the Companies Office mails a fresh Annual Return to the address on record.",
  },
};

/**
 * Alberta is the notable exception — filings go through an authorised
 * registry agent rather than a customer-facing portal, so there is no
 * per-corporation code for the customer to produce. We are that agent.
 */
export const NO_CREDENTIAL_JURISDICTIONS = new Set(["ab"]);

export function registryAccessFor(provinceKey: string | undefined | null): RegistryAccess | null {
  if (!provinceKey) return null;
  return REGISTRY_ACCESS[provinceKey.toLowerCase()] ?? null;
}

/**
 * Services that actually file with the registry, and therefore need the
 * corporation's credential. Read-only products (profile reports, good
 * standing certificates, document copies, name searches) and document
 * preparation (resolutions, by-laws, share certificates) never do — asking
 * for a credential there would be friction with nothing behind it.
 */
export const FILING_SERVICES = new Set([
  "annual-return",
  "annual-return-multiple",
  "change-directors",
  "change-address",
  "change-name",
  "articles-amendment",
  "share-split",
  "voluntary-dissolution",
  "revival",
  "continuance",
  "amalgamation",
  "extra-provincial",
]);

export function needsRegistryAccess(serviceKey: string, provinceKey: string | undefined | null): boolean {
  if (!FILING_SERVICES.has(serviceKey)) return false;
  if (!provinceKey) return false;
  if (NO_CREDENTIAL_JURISDICTIONS.has(provinceKey.toLowerCase())) return false;
  return !!registryAccessFor(provinceKey);
}

/** What the customer told us about their credential. */
export type RegistryAccessState = {
  /** "have" | "retrieve" | "no-access" */
  status: "have" | "retrieve" | "no-access" | "";
  code:   string;
};

/** Compact, human-readable form for the fulfillment email and Stripe metadata. */
export function summarizeRegistryAccess(
  state: RegistryAccessState | undefined,
  access: RegistryAccess | null,
): string {
  if (!access || !state?.status) return "";
  const term = access.term;
  if (state.status === "have") {
    return state.code.trim()
      ? `PROVIDED — ${term}: ${state.code.trim()}`
      : `Customer says they have the ${term} but did not enter it — ask before filing.`;
  }
  if (state.status === "retrieve") {
    return `NOT HELD — customer asked us to obtain the ${term}. Registered email/address is reachable.`;
  }
  return `NOT HELD — and the customer cannot access the registered email or address. A registered-address change is likely needed before the ${term} can be delivered.`;
}
