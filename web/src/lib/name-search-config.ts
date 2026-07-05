/**
 * Configuration for the "propose a name → pay" order flows shared by
 * corporate-search and nuans-search. Both services accept a proposed
 * company name (and optionally a jurisdiction) and return a search
 * report by email. No registry lookup involved.
 */

export type NameSearchServiceKey = "corporate-search" | "nuans-search";

export type NameSearchServiceConfig = {
  key:                 NameSearchServiceKey;
  label:               string;
  headline:            string;
  description:         string;
  needsJurisdiction:   boolean;
  priceLabel:          string;
  priceCents:          number;
  buttonLabel:         string;
  productName:         string;
  productBlurb:        string;
  deliveryPromise:     string;
  namePlaceholder:     string;
  nameHelp:            string;
};

export const NAME_SEARCH_CONFIGS: Record<NameSearchServiceKey, NameSearchServiceConfig> = {
  "corporate-search": {
    key:               "corporate-search",
    label:             "Corporate Name Search",
    headline:          "Search a business name across Canadian registries",
    description:       "Confirm a proposed name is available in a specific province, or find an existing corporation. Returns matches from the government registry.",
    needsJurisdiction: true,
    priceLabel:        "$49 all-in + GST",
    priceCents:        4900,
    buttonLabel:       "Pay $49 + GST and search",
    productName:       "Corporate Name Search",
    productBlurb:      "Government-direct corporate name search. Delivered by email within one business hour.",
    deliveryPromise:   "Results delivered by email within one business hour.",
    namePlaceholder:   "e.g. Maple Holdings Inc.",
    nameHelp:          "The exact name you want searched. Include the legal element (Inc., Ltd., Corp., ULC, LP).",
  },
  "nuans-search": {
    key:               "nuans-search",
    label:             "NUANS Name Search",
    headline:          "Order a federal NUANS name search report",
    description:       "Required for federal incorporation, name change, and cross-provincial registrations. Government NUANS report searches similar names across every Canadian registry.",
    needsJurisdiction: false,
    priceLabel:        "$79 all-in + GST",
    priceCents:        7900,
    buttonLabel:       "Pay $79 + GST and order NUANS",
    productName:       "NUANS Name Search Report",
    productBlurb:      "Federal NUANS name search report. Delivered by email within one business hour.",
    deliveryPromise:   "NUANS report delivered by email within one business hour.",
    namePlaceholder:   "e.g. Maple Holdings Inc.",
    nameHelp:          "Your preferred name including a legal element (Inc., Ltd., Corp., ULC, LP). If the first choice is unavailable, we run the same NUANS with your fallback name at no extra charge.",
  },
};
