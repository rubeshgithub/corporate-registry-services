/**
 * Configuration for the four form-based "corporate document" services CRS
 * prepares from a search + form + Stripe (no live registry filing — these
 * are document preparation, not gov filings):
 *
 *   share-certificate       $49
 *   director-resolution     $79
 *   shareholder-resolution  $79
 *   bylaws                  $99
 *
 * Structure mirrors change-config.ts: config drives the shared
 * CorpDocOrderFlow component, which renders the appropriate sub-form
 * based on config.key. All 4 flows share the lookup + contact + Stripe
 * shell; only the middle "details" section differs.
 */

export type CorpDocServiceKey =
  | "share-certificate"
  | "director-resolution"
  | "shareholder-resolution"
  | "bylaws";

export type CorpDocServiceConfig = {
  key:              CorpDocServiceKey;
  label:            string;
  headline:         string;
  description:      string;
  priceLabel:       string;
  priceCents:       number;
  buttonLabel:      string;
  productName:      string;
  productBlurb:     string;
  deliveryPromise:  string;
};

export const CORP_DOC_CONFIGS: Record<CorpDocServiceKey, CorpDocServiceConfig> = {
  "share-certificate": {
    key:              "share-certificate",
    label:            "Share Certificate",
    headline:         "Order a share certificate",
    description:      "Professionally formatted, sequentially numbered share certificate — plus the matching share-register and securities-register entries. Delivered as ready-to-sign PDFs within 1 business day.",
    priceLabel:       "$49 all-in + GST",
    priceCents:       4900,
    buttonLabel:      "Pay $49 + GST and order",
    productName:      "Share Certificate",
    productBlurb:     "Professionally formatted share certificate + register updates.",
    deliveryPromise:  "Delivered as PDFs within one business day.",
  },
  "director-resolution": {
    key:              "director-resolution",
    label:            "Director Resolution",
    headline:         "Order a director resolution",
    description:      "Any corporate decision by the board — annual package, share issuance, officer appointment, banking, dividend, or ad-hoc. Delivered as ready-to-sign PDFs within 1 business day.",
    priceLabel:       "$79 all-in + GST",
    priceCents:       7900,
    buttonLabel:      "Pay $79 + GST and order",
    productName:      "Director Resolution",
    productBlurb:     "Professionally drafted director resolution.",
    deliveryPromise:  "Delivered as PDFs within one business day.",
  },
  "shareholder-resolution": {
    key:              "shareholder-resolution",
    label:            "Shareholder Resolution",
    headline:         "Order a shareholder resolution",
    description:      "Annual package, article amendment, by-law confirmation, or ad-hoc. Ordinary or special resolution — we handle the drafting either way. Delivered as ready-to-sign PDFs within 1 business day.",
    priceLabel:       "$79 all-in + GST",
    priceCents:       7900,
    buttonLabel:      "Pay $79 + GST and order",
    productName:      "Shareholder Resolution",
    productBlurb:     "Professionally drafted shareholder resolution.",
    deliveryPromise:  "Delivered as PDFs within one business day.",
  },
  "bylaws": {
    key:              "bylaws",
    label:            "Corporate By-Laws",
    headline:         "Order corporate by-laws",
    description:      "Standard By-Law No. 1 drafted from your registry record — meetings, officers, shares, signing authorities, and governance. Or an amendment to an existing by-law. Delivered as ready-to-sign PDFs within 1 business day.",
    priceLabel:       "$99 all-in + GST",
    priceCents:       9900,
    buttonLabel:      "Pay $99 + GST and order",
    productName:      "Corporate By-Laws",
    productBlurb:     "Professionally drafted By-Law No. 1 or amendment.",
    deliveryPromise:  "Delivered as PDFs within one business day.",
  },
};

/* ─── Detail shapes — one per service ─────────────────────────────
 *
 * Each service's detail form captures exactly what the fulfillment team
 * needs to prepare the document, with progressive disclosure by type
 * where relevant. All optional/nice-to-have fields are marked optional in
 * the TypeScript type so the frontend doesn't over-require. */

/* Share certificate — one flavour, 7 required fields. */
export type ShareCertificateDetails = {
  shareholderName:    string;    // required — legal name on the certificate
  shareholderAddress: string;    // required — for the register update
  shareClass:         string;    // required — "Common", "Class A", "Preferred", etc.
  numShares:          number;    // required
  issueDate:          string;    // required — ISO YYYY-MM-DD
  numCertificates:    number;    // required — how many certificates to prepare
  signingOfficerName: string;    // required
  signingOfficerRole: string;    // required — "Director", "President", etc.
  consideration?:     number;    // optional — $ paid; asked by fulfillment if not provided
  transferRestrictions?: "standard" | "custom" | "";   // optional — default: standard
  customRestrictionText?: string;
  notes?:             string;
};

/* Director resolution — type-driven progressive disclosure. */
export type DirectorResolutionType =
  | "annual-package"
  | "organizational"
  | "share-issuance"
  | "officer-appointment"
  | "banking"
  | "dividend"
  | "other";

export type DirectorResolutionDetails = {
  resolutionType: DirectorResolutionType;
  effectiveDate:  string;             // required
  directorsNames: string;             // required — comma-separated

  /* Annual */
  fiscalYearEnd?:          string;
  hasOfficerChanges?:      boolean;
  hasDividendsThisYear?:   boolean;
  annualNotes?:            string;

  /* Share issuance */
  newShareholderName?:     string;
  shareIssueClass?:        string;
  shareIssueCount?:        number;
  shareIssueConsideration?: number;

  /* Officer appointment/change */
  officerName?:            string;
  officerPosition?:        string;
  officerAction?:          "appoint" | "remove";

  /* Banking */
  bankName?:               string;
  bankPurpose?:            "open-account" | "close-account" | "change-signers";
  bankSigningOfficers?:    string;
  bankSignatureRule?:      string;   // e.g. "any one" / "any two"

  /* Dividend */
  dividendShareClass?:     string;
  dividendPerShare?:       number;
  dividendRecordDate?:     string;
  dividendPaymentDate?:    string;

  /* Other */
  otherDescription?:       string;

  notes?:                  string;
};

/* Shareholder resolution — type-driven progressive disclosure. */
export type ShareholderResolutionType =
  | "annual-package"
  | "article-amendment"
  | "bylaw-confirmation"
  | "fundamental-change"
  | "other";

export type ShareholderResolutionDetails = {
  resolutionType:   ShareholderResolutionType;
  isSpecial:        boolean;         // auto-derived by type but confirmed
  effectiveDate:    string;
  shareholdersNames: string;         // required — comma-separated

  /* Annual */
  fiscalYearEnd?:            string;
  directorsBeingElected?:    string;
  waiveAuditor?:             boolean;
  approveFinancials?:        boolean;

  /* Article amendment */
  amendmentNature?: "name-change" | "share-structure" | "transfer-restrictions" | "directors-number" | "other";
  amendmentDetail?: string;

  /* By-law confirmation */
  bylawNumber?:               string;
  bylawEnactedDate?:          string;

  /* Fundamental change */
  fundamentalChangeType?:     "amalgamation" | "continuation" | "dissolution" | "other";
  fundamentalChangeDetail?:   string;

  /* Other */
  otherDescription?:          string;

  notes?:                     string;
};

/* By-laws — split by New vs Amendment. Custom by-laws are accepted at
   checkout; fulfillment follows up by email to gather the custom
   provisions before drafting. */
export type BylawsFlavour = "new-standard" | "new-custom" | "amendment";

export type BylawsDetails = {
  flavour:         BylawsFlavour;

  /* New (both standard and custom) */
  officerPositions?:      string;      // comma-separated
  fiscalYearEnd?:         string;
  minDirectors?:          number;
  maxDirectors?:          number;
  signingAuthority?:      string;
  usesCorporateSeal?:     boolean;
  transferRestrictions?:  "standard" | "custom";
  customRestrictionText?: string;
  customProvisionsNote?:  string;      // for new-custom: freeform for fulfillment to reach out about

  /* Amendment */
  bylawNumber?:           string;
  amendmentDetail?:       string;
  effectiveDate?:         string;

  notes?:                 string;
};

/* Union across all four services — used by the API endpoint to type the
 * incoming details payload without a runtime cast. */
export type CorpDocDetails =
  | { key: "share-certificate";      details: ShareCertificateDetails }
  | { key: "director-resolution";    details: DirectorResolutionDetails }
  | { key: "shareholder-resolution"; details: ShareholderResolutionDetails }
  | { key: "bylaws";                 details: BylawsDetails };
