/**
 * Configuration for the four form-based "change" services that CRS can file
 * within 24 hours of payment (no quote required). All follow the same shape:
 *
 *   1. Registry lookup — identify the company being modified
 *   2. Service-specific details — what's changing
 *   3. Contact info + Stripe checkout
 *
 * The middle "details" section differs per service; ChangeOrderFlow renders
 * the appropriate sub-form based on config.key.
 */

export type ChangeServiceKey =
  | "change-directors"
  | "change-address"
  | "voluntary-dissolution"
  | "revival";

export type ChangeServiceConfig = {
  key:              ChangeServiceKey;
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

export const CHANGE_CONFIGS: Record<ChangeServiceKey, ChangeServiceConfig> = {
  "change-directors": {
    key:              "change-directors",
    label:            "Director / Officer Change",
    headline:         "File a director or officer change",
    description:      "Add or remove directors and officers on the corporate registry. Add multiple changes on one filing.",
    priceLabel:       "$99 all-in + GST",
    priceCents:       9900,
    buttonLabel:      "Pay $99 + GST and file",
    productName:      "Director / Officer Change",
    productBlurb:     "File director / officer change with the government registry within 24 hours.",
    deliveryPromise:  "Filed within 24 hours of payment.",
  },
  "change-address": {
    key:              "change-address",
    label:            "Registered Office Address Change",
    headline:         "Change your registered office address",
    description:      "Update the corporation's registered office address on the government registry.",
    priceLabel:       "$99 all-in + GST",
    priceCents:       9900,
    buttonLabel:      "Pay $99 + GST and file",
    productName:      "Registered Office Address Change",
    productBlurb:     "File a registered office address change with the government registry within 24 hours.",
    deliveryPromise:  "Filed within 24 hours of payment.",
  },
  "voluntary-dissolution": {
    key:              "voluntary-dissolution",
    label:            "Voluntary Dissolution",
    headline:         "File a voluntary dissolution",
    description:      "Formally wind up and dissolve the corporation with the government registry. Ensure debts are settled and final tax return is filed before dissolving.",
    priceLabel:       "$399 all-in + GST",
    priceCents:       39900,
    buttonLabel:      "Pay $399 + GST and file",
    productName:      "Voluntary Dissolution",
    productBlurb:     "File voluntary dissolution paperwork with the government registry.",
    deliveryPromise:  "Dissolution paperwork filed within 24 hours of payment.",
  },
  "revival": {
    key:              "revival",
    label:            "Corporate Revival",
    headline:         "Revive a dissolved or struck-off corporation",
    description:      "Restore a dissolved or struck-off corporation back to active status. Outstanding annual returns will be quoted separately if applicable.",
    priceLabel:       "$399 all-in + GST",
    priceCents:       39900,
    buttonLabel:      "Pay $399 + GST and start revival",
    productName:      "Corporate Revival",
    productBlurb:     "File corporate revival application with the government registry.",
    deliveryPromise:  "Revival application filed within 24 hours of payment.",
  },
};
