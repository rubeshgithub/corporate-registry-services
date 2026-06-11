export type ServiceBucket = {
  key: string;
  label: string;
  blurb: string;
  icon: string;
  services: ServiceItem[];
};

export type ServiceItem = {
  key: string;
  label: string;
  description: string;
  needsJurisdiction: boolean;
  estimatedFee: string;
  detailFields?: DetailField[];
};

export type DetailField = {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "date";
  placeholder?: string;
  options?: string[];
  required?: boolean;
};

export const JURISDICTIONS = [
  { key: "federal", label: "Federal (Canada)" },
  { key: "ab", label: "Alberta" },
  { key: "bc", label: "British Columbia" },
  { key: "mb", label: "Manitoba" },
  { key: "nb", label: "New Brunswick" },
  { key: "nl", label: "Newfoundland & Labrador" },
  { key: "nt", label: "Northwest Territories" },
  { key: "ns", label: "Nova Scotia" },
  { key: "nu", label: "Nunavut" },
  { key: "on", label: "Ontario" },
  { key: "pe", label: "Prince Edward Island" },
  { key: "qc", label: "Quebec" },
  { key: "sk", label: "Saskatchewan" },
  { key: "yt", label: "Yukon" },
];

export const SERVICE_BUCKETS: ServiceBucket[] = [
  {
    key: "get-document",
    label: "Get a Document",
    blurb: "Profile reports, good standing, searches",
    icon: "FileSearch",
    services: [
      {
        key: "profile-report",
        label: "Corporate Profile Report",
        description: "Official registry record of a company's legal status, directors, and filing history.",
        needsJurisdiction: true,
        estimatedFee: "$49 + GST",
      },
      {
        key: "good-standing",
        label: "Certificate of Good Standing",
        description: "Government-issued certificate confirming the company is active and compliant.",
        needsJurisdiction: true,
        estimatedFee: "$79 + GST",
      },
      {
        key: "corporate-search",
        label: "Corporate Name Search",
        description: "Search for a business name across provincial or federal registries.",
        needsJurisdiction: true,
        estimatedFee: "$49 + GST",
        detailFields: [
          { key: "searchName", label: "Company name to search", type: "text", placeholder: "e.g. Maple Holdings Inc.", required: true },
        ],
      },
      {
        key: "nuans-search",
        label: "NUANS Name Search Report",
        description: "Federal NUANS pre-incorporation name search required for federal filings.",
        needsJurisdiction: false,
        estimatedFee: "$79 + GST",
        detailFields: [
          { key: "proposedName", label: "Proposed company name", type: "text", placeholder: "e.g. Maple Holdings Inc.", required: true },
        ],
      },
    ],
  },
  {
    key: "start-company",
    label: "Start a Company",
    blurb: "Incorporate federally or in any province",
    icon: "Building2",
    services: [
      {
        key: "incorporation-numbered",
        label: "Numbered Company Incorporation",
        description: "Incorporate with a government-assigned number name (e.g. 1234567 Ontario Inc.).",
        needsJurisdiction: true,
        estimatedFee: "$699 + GST",
      },
      {
        key: "incorporation-named",
        label: "Named Company Incorporation",
        description: "Incorporate with a custom business name including NUANS search and filing.",
        needsJurisdiction: true,
        estimatedFee: "$749 + GST",
        detailFields: [
          { key: "proposedName", label: "Proposed company name", type: "text", placeholder: "e.g. Maple Holdings Inc.", required: true },
        ],
      },
      {
        key: "extra-provincial",
        label: "Extra-Provincial Registration",
        description: "Register an existing corporation to operate in an additional province.",
        needsJurisdiction: true,
        estimatedFee: "$299 + GST",
        detailFields: [
          { key: "homeJurisdiction", label: "Home jurisdiction", type: "text", placeholder: "e.g. Ontario", required: true },
          { key: "corpName", label: "Corporation name", type: "text", placeholder: "Legal name", required: true },
        ],
      },
      {
        key: "not-for-profit",
        label: "Not-for-Profit Incorporation",
        description: "Incorporate a non-profit or charitable organization.",
        needsJurisdiction: true,
        estimatedFee: "$699 + GST",
        detailFields: [
          { key: "orgName", label: "Proposed organization name", type: "text", placeholder: "e.g. Maple Foundation", required: true },
        ],
      },
    ],
  },
  {
    key: "corporate-docs",
    label: "Corporate Documents",
    blurb: "Minute books, by-laws, resolutions",
    icon: "BookOpen",
    services: [
      {
        key: "minute-book-new",
        label: "New Minute Book Package",
        description: "Complete digital minute book: articles, by-laws, registers, share certificates, and organizational resolutions.",
        needsJurisdiction: true,
        estimatedFee: "from $299 + GST",
      },
      {
        key: "minute-book-update",
        label: "Minute Book Update",
        description: "Bring an existing minute book up to date with missing resolutions and registers.",
        needsJurisdiction: false,
        estimatedFee: "from $299 + GST",
      },
      {
        key: "share-certificate",
        label: "Share Certificates",
        description: "Professionally formatted share certificates for your shareholders.",
        needsJurisdiction: false,
        estimatedFee: "$49 + GST",
        detailFields: [
          { key: "numCerts", label: "Number of certificates", type: "text", placeholder: "e.g. 3", required: true },
        ],
      },
      {
        key: "director-resolution",
        label: "Director Resolutions",
        description: "Draft and prepare director resolutions for any corporate decision.",
        needsJurisdiction: false,
        estimatedFee: "$79 + GST",
        detailFields: [
          { key: "resolutionSubject", label: "What is the resolution about?", type: "textarea", placeholder: "e.g. Approve bank signing officers, approve financial statements...", required: true },
        ],
      },
      {
        key: "shareholder-resolution",
        label: "Shareholder Resolutions",
        description: "Annual or special shareholder resolutions for corporate governance.",
        needsJurisdiction: false,
        estimatedFee: "$79 + GST",
        detailFields: [
          { key: "resolutionSubject", label: "What is the resolution about?", type: "textarea", placeholder: "e.g. Elect directors, approve auditors...", required: true },
        ],
      },
      {
        key: "bylaws",
        label: "Corporate By-Laws",
        description: "Draft or update general by-laws governing the corporation.",
        needsJurisdiction: false,
        estimatedFee: "$99 + GST",
      },
    ],
  },
  {
    key: "file-change",
    label: "File a Change",
    blurb: "Directors, address, name, share capital",
    icon: "FilePen",
    services: [
      {
        key: "change-directors",
        label: "Director / Officer Change",
        description: "File an appointment or resignation of directors or officers with the registry.",
        needsJurisdiction: true,
        estimatedFee: "$99 + GST",
        detailFields: [
          { key: "changeType", label: "Type of change", type: "select", options: ["Appoint director", "Resign director", "Appoint officer", "Resign officer", "Both appoint and resign"], required: true },
          { key: "directorName", label: "Director / officer name", type: "text", placeholder: "Full legal name", required: true },
        ],
      },
      {
        key: "change-address",
        label: "Registered Office Address Change",
        description: "Update the corporation's registered office address on file with the registry.",
        needsJurisdiction: true,
        estimatedFee: "$99 + GST",
        detailFields: [
          { key: "newAddress", label: "New registered office address", type: "textarea", placeholder: "Full address including city, province, postal code", required: true },
        ],
      },
      {
        key: "change-name",
        label: "Corporate Name Change",
        description: "File a name change including NUANS search (if required) and articles of amendment.",
        needsJurisdiction: true,
        estimatedFee: "$299 + GST",
        detailFields: [
          { key: "currentName", label: "Current company name", type: "text", placeholder: "Current legal name", required: true },
          { key: "proposedName", label: "Proposed new name", type: "text", placeholder: "New legal name", required: true },
        ],
      },
      {
        key: "articles-amendment",
        label: "Articles of Amendment",
        description: "File articles of amendment for any change to the corporation's constating documents.",
        needsJurisdiction: true,
        estimatedFee: "$199 + GST",
        detailFields: [
          { key: "amendmentDetails", label: "What is being amended?", type: "textarea", placeholder: "Describe the amendment(s)", required: true },
        ],
      },
      {
        key: "share-split",
        label: "Share Split or Consolidation",
        description: "File articles to split or consolidate the corporation's share capital.",
        needsJurisdiction: true,
        estimatedFee: "$199 + GST",
        detailFields: [
          { key: "splitType", label: "Type", type: "select", options: ["Share split", "Share consolidation"], required: true },
          { key: "splitRatio", label: "Ratio (e.g. 2:1)", type: "text", placeholder: "e.g. 2:1", required: true },
        ],
      },
    ],
  },
  {
    key: "stay-compliant",
    label: "Stay Compliant",
    blurb: "Annual returns, registered agent",
    icon: "ShieldCheck",
    services: [
      {
        key: "annual-return",
        label: "Annual Return Filing",
        description: "File your corporation's mandatory annual return to maintain good standing.",
        needsJurisdiction: true,
        estimatedFee: "$99 + GST",
      },
      {
        key: "annual-return-multiple",
        label: "Annual Return — Multiple Years",
        description: "Catch up on missed annual returns to restore good standing.",
        needsJurisdiction: true,
        estimatedFee: "$99/year + GST",
        detailFields: [
          { key: "yearsOwing", label: "How many years are outstanding?", type: "text", placeholder: "e.g. 3", required: true },
        ],
      },
      {
        key: "registered-office",
        label: "Registered Office Service",
        description: "Use our address as your registered office for legal and government correspondence.",
        needsJurisdiction: true,
        estimatedFee: "Custom quote",
      },
      {
        key: "compliance-review",
        label: "Corporate Compliance Review",
        description: "Full review of your corporate records to identify and resolve compliance gaps.",
        needsJurisdiction: false,
        estimatedFee: "Custom quote",
      },
    ],
  },
  {
    key: "dissolve-revive",
    label: "Dissolve or Revive",
    blurb: "Wind down, amalgamate, or restore",
    icon: "RefreshCw",
    services: [
      {
        key: "voluntary-dissolution",
        label: "Voluntary Dissolution",
        description: "Formally wind up and dissolve the corporation with the government registry.",
        needsJurisdiction: true,
        estimatedFee: "$299 + GST",
      },
      {
        key: "revival",
        label: "Corporate Revival",
        description: "Restore a dissolved or struck-off corporation back to active status.",
        needsJurisdiction: true,
        estimatedFee: "$299 + GST",
      },
      {
        key: "amalgamation",
        label: "Amalgamation",
        description: "Combine two or more corporations into a single entity.",
        needsJurisdiction: true,
        estimatedFee: "$799 + GST",
        detailFields: [
          { key: "numCorporations", label: "Number of corporations amalgamating", type: "text", placeholder: "e.g. 2", required: true },
          { key: "resultingName", label: "Proposed name of resulting corporation", type: "text", placeholder: "Legal name", required: true },
        ],
      },
      {
        key: "continuance",
        label: "Continuance (Jurisdiction Transfer)",
        description: "Transfer your corporation's jurisdiction to another province or to federal.",
        needsJurisdiction: true,
        estimatedFee: "$499 + GST",
        detailFields: [
          { key: "fromJurisdiction", label: "From jurisdiction", type: "text", placeholder: "e.g. Ontario", required: true },
          { key: "toJurisdiction", label: "To jurisdiction", type: "text", placeholder: "e.g. Federal", required: true },
        ],
      },
    ],
  },
];

export function getBucket(key: string): ServiceBucket | undefined {
  return SERVICE_BUCKETS.find((b) => b.key === key);
}

export function getService(bucketKey: string, serviceKey: string): ServiceItem | undefined {
  return getBucket(bucketKey)?.services.find((s) => s.key === serviceKey);
}
