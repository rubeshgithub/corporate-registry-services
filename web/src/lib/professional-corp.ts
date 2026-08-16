/**
 * Professional-corporation detection + the CRS professional-corporation
 * service catalogue.
 *
 * ── Why detection is name-first ──────────────────────────────────────────
 * A professional corporation (PC) is, at the registry level, an ordinary
 * business corporation — the professional layer is a permit issued by the
 * practitioner's regulator (CPSA, CPSO, CPSBC, a law society, CPA Ontario,
 * a college of pharmacists…), which the registry does not record.
 *
 * That has a hard consequence for us: the upstream Canada Business
 * Registries (CBR) API returns a GENERIC `Entity_Type` for every PC —
 * "ONTARIO BUSINESS CORP.", "Business Corporation", "FEDERAL CORP WITH
 * SHARE", "Alberta Business Corporation". Verified live against CBR for
 * Ontario / Alberta / federal medicine, law and dental PCs. There is no
 * CBR field that says "this is a professional corporation".
 *
 * Our own Alberta gazette corpus (crs.companies) DOES carry the real type,
 * because scripts/import_registrar.mjs parses it out of the Registrar's
 * Periodical. Census at time of writing:
 *
 *     Medical Professional Corporation        9,022
 *     Legal Professional Corporation          3,826
 *     Professional Corporation (generic)      3,279
 *     Dental Professional Corporation         3,094
 *     Chiropractic Professional Corporation     548
 *     ─────────────────────────────────────────────
 *     typed as Professional*                 19,769
 *     name contains "PROFESSIONAL CORPORATION" 20,962
 *     name says PC but entityType does not     2,652
 *
 * Neither signal alone is complete, so we test BOTH and union them.
 *
 * The name test generalises nationally because every province's naming
 * rules REQUIRE a PC's legal name to identify it as a professional
 * corporation — e.g. O. Reg. 665/05 in Ontario mandates the form
 * "[Surname] Medicine Professional Corporation" and permits nothing else
 * after it. That makes an end-anchored name match both safe and portable.
 *
 * Quebec / New Brunswick style the French name with the qualifier at the
 * FRONT ("CORPORATION PROFESSIONNELLE MÉDICALE …"), so the French patterns
 * are deliberately not end-anchored.
 *
 * ── Trust boundary ───────────────────────────────────────────────────────
 * PC status changes what the customer pays, so it must be derived on the
 * SERVER from the registry hit — never accepted as a client-supplied flag.
 * Order routes call isProfessionalCorporation(hit) themselves.
 */

/** The subset of a registry search result that PC detection needs. */
export type PcDetectable = {
  name?:       string | null;
  entityType?: string | null;
};

/* English: end-anchored. A PC's registered name ends with the qualifier,
 * so anchoring avoids false positives on businesses that merely mention
 * the phrase (e.g. "PROFESSIONAL CORPORATION SERVICES INC"). Trailing
 * punctuation and whitespace are tolerated. */
const PC_NAME_EN = /\bprofessional\s+corporation\b[\s.,]*$/i;

/* French: qualifier leads the name, so no anchor. Accents optional because
 * upstream data is inconsistently accented. */
const PC_NAME_FR = /\b(?:corporation|soci[eé]t[eé])\s+professionnelle\b/i;

/* Entity type: only our Alberta corpus populates this meaningfully. */
const PC_ENTITY_TYPE = /professional\s+corporation/i;

/**
 * True when the registry record is a professional corporation.
 *
 * Union of two independent signals — see the file header for why neither
 * is sufficient on its own.
 */
export function isProfessionalCorporation(hit: PcDetectable | null | undefined): boolean {
  if (!hit) return false;
  const name = (hit.name ?? "").trim();
  const type = (hit.entityType ?? "").trim();
  if (type && PC_ENTITY_TYPE.test(type)) return true;
  if (!name) return false;
  return PC_NAME_EN.test(name) || PC_NAME_FR.test(name);
}

/* ── Profession ─────────────────────────────────────────────────────────── */

export type Profession =
  | "medical" | "dental" | "legal" | "chiropractic" | "optometric"
  | "veterinary" | "engineering" | "accounting" | "pharmacy" | "general";

/** Ordered most-specific-first; the first hit wins. Applied to entityType
 *  then name, because the Alberta entityType is the more reliable source. */
const PROFESSION_PATTERNS: Array<[Profession, RegExp]> = [
  ["medical",      /\b(?:medical|medicine|m[ée]dicale?)\b/i],
  ["dental",       /\b(?:dental|dentistry|dentaire)\b/i],
  ["chiropractic", /\bchiropract/i],
  ["optometric",   /\boptometr/i],
  ["veterinary",   /\bveterinar/i],
  ["engineering",  /\bengineer/i],
  ["pharmacy",     /\bpharmac/i],
  ["accounting",   /\b(?:accounting|accountants?|chartered\s+professional\s+accountant|cpa)\b/i],
  ["legal",        /\b(?:legal|law|barrist|solicit|juridique)\b/i],
];

/**
 * Best-effort profession classification, used to route the customer to the
 * right regulator guidance. Returns "general" when nothing matches — the
 * generic "Professional Corporation" type is common and carries no
 * profession signal.
 */
export function detectProfession(hit: PcDetectable | null | undefined): Profession {
  if (!hit) return "general";
  for (const source of [hit.entityType ?? "", hit.name ?? ""]) {
    if (!source) continue;
    for (const [profession, re] of PROFESSION_PATTERNS) {
      if (re.test(source)) return profession;
    }
  }
  return "general";
}

/** Human label for a profession, for on-screen copy. */
export const PROFESSION_LABELS: Record<Profession, string> = {
  medical:      "Medicine",
  dental:       "Dentistry",
  legal:        "Law",
  chiropractic: "Chiropractic",
  optometric:   "Optometry",
  veterinary:   "Veterinary medicine",
  engineering:  "Engineering",
  accounting:   "Accounting (CPA)",
  pharmacy:     "Pharmacy",
  general:      "Professional practice",
};

/* ── Service catalogue ──────────────────────────────────────────────────── */

export type ProCorpServiceKey =
  | "profile-report"
  | "setup"
  | "annual-return"
  | "change-of-information"
  | "revival";

export type ProCorpService = {
  key:         ProCorpServiceKey;
  label:       string;
  /** Short label for tight UI (service picker tiles, chips). */
  shortLabel:  string;
  priceCents:  number;
  priceLabel:  string;
  blurb:       string;
  /** Where the CTA sends the customer. */
  href:        string;
  /** True when the price is charged per year rather than once. */
  perYear?:    boolean;
  /**
   * True when the service acts on a corporation that already exists, so the
   * order flow must identify it via registry lookup first. False for setup,
   * where there is nothing to look up yet.
   */
  requiresExistingCorporation: boolean;
  /** What the customer gets — rendered as a checklist on the hub page. */
  includes:    string[];
};

/**
 * CRS professional-corporation pricing. PC work carries a premium over the
 * standard corporate equivalents because every filing has a second track —
 * the regulator's permit or certificate of authorization — that has to be
 * kept in step with the registry.
 *
 * Setup is a flat national price INCLUDING all government registry fees and
 * the regulator's application fee (e.g. CPSA in Alberta, CPSO in Ontario),
 * and covers name reservation, articles preparation, by-laws, coordination
 * with the regulator, and filing.
 *
 * This is the single source of truth for PC prices — order routes read
 * priceCents from here, never from the client.
 */
export const PRO_CORP_SERVICES: Record<ProCorpServiceKey, ProCorpService> = {
  "profile-report": {
    key:        "profile-report",
    label:      "Professional Corporation Profile Report",
    shortLabel: "Profile report",
    priceCents: 6900,
    priceLabel: "$69 all-in + GST",
    blurb:      "The full registry record for your professional corporation — status, directors, and filing history.",
    href:       "/order/profile-report",
    requiresExistingCorporation: true,
    includes: [
      "Official registry record, direct from the government",
      "Current status, directors, officers and registered office",
      "The document regulators ask for at permit renewal",
      "PDF within one business hour",
    ],
  },
  "setup": {
    key:        "setup",
    label:      "Set up a new Professional Corporation",
    shortLabel: "New PC setup",
    priceCents: 169900,
    priceLabel: "$1,699 all-in + GST",
    blurb:      "Everything included: government registry fees, regulator fees, name reservation, articles, by-laws, coordination with your regulator, and filing.",
    href:       "/incorporation/book-free-consultation",
    requiresExistingCorporation: false,
    includes: [
      "All government registry fees included",
      "All regulator fees included (CPSA, CPSO, CPSBC, law society, CPA…)",
      "Name reservation to your regulator's naming rules",
      "Articles of incorporation with the restrictions your regulator requires",
      "By-laws prepared",
      "Coordination with your regulator and filing, end to end",
    ],
  },
  "annual-return": {
    key:        "annual-return",
    label:      "Professional Corporation Annual Return",
    shortLabel: "Annual return",
    priceCents: 13900,
    priceLabel: "$139 all-in + GST",
    blurb:      "Keep the registry side current so your regulator permit stays renewable.",
    href:       "/order/annual-return",
    perYear:    true,
    requiresExistingCorporation: true,
    includes: [
      "Annual return filed with the corporate registry",
      "Catch-up filings available for multiple missed years",
      "Keeps the corporation in good standing for permit renewal",
      "Filed within 24 hours of payment",
    ],
  },
  "change-of-information": {
    key:        "change-of-information",
    label:      "Professional Corporation Change of Information",
    shortLabel: "Change of information",
    priceCents: 16900,
    priceLabel: "$169 all-in + GST",
    blurb:      "Directors, officers, shareholders, or registered office — filed with the registry and reflected for your regulator.",
    href:       "/order/change-directors",
    requiresExistingCorporation: true,
    includes: [
      "Director, officer or shareholder changes",
      "Registered office or records address changes",
      "Multiple changes on a single filing",
      "Filed within 24 hours of payment",
    ],
  },
  "revival": {
    key:        "revival",
    label:      "Revive a Professional Corporation",
    shortLabel: "Revival",
    priceCents: 48900,
    priceLabel: "$489 all-in + GST",
    blurb:      "Restore a struck or dissolved professional corporation so you can practise through it again.",
    href:       "/order/revival",
    requiresExistingCorporation: true,
    includes: [
      "Revival application prepared and filed",
      "Restores the corporation to active status",
      "Outstanding annual returns quoted separately if applicable",
      "Application filed within 24 hours of payment",
    ],
  },
};

/** Full catalogue order — used by the public services hub. */
export const PRO_CORP_MENU_ORDER: ProCorpServiceKey[] = [
  "setup",
  "annual-return",
  "change-of-information",
  "revival",
];

/** Display order for the public services hub (setup leads — highest value). */
export const PRO_CORP_ALL_SERVICES: ProCorpServiceKey[] = [
  "setup",
  "annual-return",
  "profile-report",
  "change-of-information",
  "revival",
];

/**
 * Services that operate on a corporation that already exists. These are the
 * ones the dedicated PC order page can fulfil after a registry lookup —
 * setup is excluded because there is no corporation to search for yet.
 */
export const PRO_CORP_EXISTING_SERVICES: ProCorpServiceKey[] = PRO_CORP_ALL_SERVICES
  .filter((k) => PRO_CORP_SERVICES[k].requiresExistingCorporation);

/**
 * Server-side price resolution. Returns the PC price in cents when the hit
 * is a professional corporation AND we publish a PC price for that service;
 * otherwise returns null so the caller keeps its standard price.
 *
 * Callers MUST pass the registry hit, not a client-sent boolean.
 */
export function proCorpPriceCents(
  hit:     PcDetectable | null | undefined,
  service: ProCorpServiceKey,
): number | null {
  if (!isProfessionalCorporation(hit)) return null;
  return PRO_CORP_SERVICES[service]?.priceCents ?? null;
}
