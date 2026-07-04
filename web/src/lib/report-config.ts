/**
 * Configuration for the shared "lookup + confirm + pay" order flow used by
 * corporate profile reports and certificates of good standing. Both services
 * share the same UX shape (registry lookup, single record confirmation,
 * contact + Stripe checkout) so we drive them from this config instead of
 * duplicating the flow component.
 */

export type ReportServiceKey = "profile-report" | "good-standing";

export type ReportServiceConfig = {
  key:              ReportServiceKey;
  label:            string;   // "Corporate Profile Report"
  headline:         string;   // "Order a Corporate Profile Report"
  description:      string;   // Line under the H1 on screen 1
  priceLabel:       string;   // "$49 all-in + GST" — for UI
  priceCents:       number;   // 4900 — the actual Stripe amount before tax
  buttonLabel:      string;   // "Pay $49 + GST and order"
  productName:      string;   // Stripe product line name
  productBlurb:     string;   // Stripe product line description
  deliveryPromise:  string;   // "PDF within one business hour."
  thanksSubject:    string;   // Subject line the customer sees post-pay
  ownerSubjectStub: string;   // Fulfillment-email subject prefix
};

export const REPORT_CONFIGS: Record<ReportServiceKey, ReportServiceConfig> = {
  "profile-report": {
    key:              "profile-report",
    label:            "Corporate Profile Report",
    headline:         "Order a Corporate Profile Report",
    description:      "The official registry record of a company's legal status, directors, and filing history — direct from the government.",
    priceLabel:       "$49 all-in + GST",
    priceCents:       4900,
    buttonLabel:      "Pay $49 + GST and order",
    productName:      "Corporate Profile Report",
    productBlurb:     "Government-direct corporate profile report. Delivered as PDF within one business hour.",
    deliveryPromise:  "Delivered as a PDF within one business hour of payment.",
    thanksSubject:    "Order received — your profile report is on the way",
    ownerSubjectStub: "Profile Report",
  },
  "good-standing": {
    key:              "good-standing",
    label:            "Certificate of Good Standing",
    headline:         "Order a Certificate of Good Standing",
    description:      "Government-issued certificate confirming the corporation is active and compliant. Required for financing, closings, and cross-border transactions.",
    priceLabel:       "$79 all-in + GST",
    priceCents:       7900,
    buttonLabel:      "Pay $79 + GST and order",
    productName:      "Certificate of Good Standing",
    productBlurb:     "Government-issued Certificate of Good Standing. Delivered as PDF within hours, not weeks.",
    deliveryPromise:  "Delivered as a PDF within hours of payment.",
    thanksSubject:    "Order received — your Certificate of Good Standing is on the way",
    ownerSubjectStub: "Good Standing",
  },
};
