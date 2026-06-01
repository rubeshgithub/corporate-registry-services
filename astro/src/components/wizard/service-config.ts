export type FieldSchema = {
  key: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select' | 'checkbox' | 'date' | 'number' | 'radio' | 'repeater' | 'file';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  helpText?: string;
  itemFields?: FieldSchema[];
  showIf?: { key: string; equals: any };
  defaultValue?: any;
  min?: number;
  max?: number;
  accept?: string;
};

export type ServiceConfig = {
  label: string;
  model: 'registry' | 'document' | 'subscription' | 'custom';
  eta: string;
  fields: FieldSchema[];
};

export type BucketConfig = {
  key: string;
  label: string;
  icon: string;
  blurb: string;
  multiSelect?: boolean;
  services: Record<string, ServiceConfig>;
};

export const BUCKETS: BucketConfig[] = [
  {
    key: 'get-a-document',
    label: 'Get a Document',
    icon: 'FileSearch',
    blurb: 'Profile Report, Good Standing, Incumbency, Certified Articles…',
    services: {
      'profile-report': {
        label: 'Corporate Profile Report',
        model: 'registry',
        eta: '3 hours',
        fields: [
          { key: 'corporationNumberOrName', label: 'Corporation Number or Name', type: 'text', required: true, placeholder: 'e.g. 1234567 or Acme Corp Inc.' },
          { key: 'purpose', label: 'Purpose', type: 'select', required: true, options: [
            { value: 'bank-financing', label: 'Bank / Financing' },
            { value: 'due-diligence', label: 'Due Diligence' },
            { value: 'accounting', label: 'QuickBooks / Accounting' },
            { value: 'extra-provincial', label: 'Extra-Provincial Registration' },
            { value: 'ma', label: 'M&A' },
            { value: 'government-tender', label: 'Government Tender' },
            { value: 'personal-record', label: 'Personal Record' },
            { value: 'other', label: 'Other' },
          ]},
          { key: 'rush', label: 'Rush (3-hour delivery)', type: 'checkbox' },
        ],
      },
      'good-standing': {
        label: 'Certificate of Good Standing',
        model: 'registry',
        eta: '3 hours',
        fields: [
          { key: 'corporationNumberOrName', label: 'Corporation Number or Name', type: 'text', required: true, placeholder: 'e.g. 1234567 or Acme Corp Inc.' },
          { key: 'purpose', label: 'Purpose', type: 'select', required: true, options: [
            { value: 'bank-account', label: 'Bank Account' },
            { value: 'extra-provincial', label: 'Extra-Provincial Registration' },
            { value: 'loan-financing', label: 'Loan / Financing' },
            { value: 'government-bid', label: 'Government Bid' },
            { value: 'ma', label: 'M&A' },
            { value: 'other', label: 'Other' },
          ]},
          { key: 'certifiedHardcopy', label: 'Need a certified hardcopy (where available)', type: 'checkbox' },
        ],
      },
      'certificate-of-incumbency': {
        label: 'Certificate of Incumbency',
        model: 'registry',
        eta: '24 hours',
        fields: [
          { key: 'corporationNumber', label: 'Corporation Number', type: 'text', required: true, placeholder: 'e.g. 1234567' },
          { key: 'asOfDate', label: 'As-of Date', type: 'date', defaultValue: 'today' },
          { key: 'purpose', label: 'Purpose', type: 'select', required: true, options: [
            { value: 'banking', label: 'Banking' },
            { value: 'loan-financing', label: 'Loan / Financing' },
            { value: 'real-estate', label: 'Real Estate Transaction' },
            { value: 'litigation', label: 'Litigation' },
            { value: 'other', label: 'Other' },
          ]},
        ],
      },
      'certified-articles': {
        label: 'Certified Copy — Articles of Incorporation',
        model: 'registry',
        eta: '48 hours',
        fields: [
          { key: 'corporationNumber', label: 'Corporation Number', type: 'text', required: true, placeholder: 'e.g. 1234567' },
          { key: 'numberOfCopies', label: 'Number of Copies', type: 'number', defaultValue: 1, min: 1, max: 10 },
        ],
      },
      'certificate-of-existence': {
        label: 'Certificate of Existence',
        model: 'registry',
        eta: '3 hours',
        fields: [
          { key: 'corporationNumberOrName', label: 'Corporation Number or Name', type: 'text', required: true, placeholder: 'e.g. 1234567 or Acme Corp Inc.' },
          { key: 'purpose', label: 'Purpose (optional)', type: 'text', placeholder: 'Describe the purpose' },
        ],
      },
    },
  },

  {
    key: 'file-a-change',
    label: 'File a Change',
    icon: 'Edit3',
    blurb: 'Update directors, shareholders, address, name, share structure…',
    multiSelect: true,
    services: {
      'change-of-director': {
        label: 'Change of Directors',
        model: 'registry',
        eta: '24 hours',
        fields: [
          { key: 'action', label: 'Action', type: 'radio', required: true, options: [
            { value: 'Add', label: 'Add' },
            { value: 'Remove', label: 'Remove' },
            { value: 'Update', label: 'Update' },
          ]},
          { key: 'directorName', label: 'Director Full Name', type: 'text', required: true },
          { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
          { key: 'directorAddress', label: 'Director Address', type: 'textarea', required: true, showIf: { key: 'action', equals: 'Add' }, placeholder: 'Full residential address' },
          { key: 'reason', label: 'Reason (optional)', type: 'text', placeholder: 'e.g. Resignation, appointment' },
        ],
      },
      'change-of-officer': {
        label: 'Change of Officers',
        model: 'registry',
        eta: '24 hours',
        fields: [
          { key: 'action', label: 'Action', type: 'radio', required: true, options: [
            { value: 'Add', label: 'Add' },
            { value: 'Remove', label: 'Remove' },
            { value: 'Update', label: 'Update' },
          ]},
          { key: 'officerName', label: 'Officer Full Name', type: 'text', required: true },
          { key: 'position', label: 'Position', type: 'text', required: true, placeholder: 'CEO, CFO, Secretary…' },
          { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
        ],
      },
      'change-of-shareholder': {
        label: 'Change of Shareholder',
        model: 'document',
        eta: '48 hours',
        fields: [
          { key: 'transferorName', label: 'Transferor (Seller) Name', type: 'text', required: true },
          { key: 'transfereeName', label: 'Transferee (Buyer) Name', type: 'text', required: true },
          { key: 'shareClass', label: 'Share Class', type: 'text', required: true, placeholder: 'Common, Preferred Class A…' },
          { key: 'numberOfShares', label: 'Number of Shares', type: 'number', required: true, min: 1 },
          { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
          { key: 'transferPrice', label: 'Transfer Price per Share (CAD, optional)', type: 'number', min: 0 },
        ],
      },
      'change-of-address': {
        label: 'Change of Registered Office',
        model: 'registry',
        eta: '24 hours',
        fields: [
          { key: 'newRegisteredOffice', label: 'New Registered Office Address', type: 'textarea', required: true },
          { key: 'newMailingAddress', label: 'New Mailing Address (optional)', type: 'textarea', helpText: 'Leave blank if same as registered office' },
          { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
        ],
      },
      'change-of-name': {
        label: 'Change of Corporate Name',
        model: 'registry',
        eta: '5 business days',
        fields: [
          { key: 'proposedNewName', label: 'Proposed New Name', type: 'text', required: true },
          { key: 'nuansReport', label: 'NUANS Report (optional)', type: 'file', accept: '.pdf,.html,.txt' },
          { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
          { key: 'reason', label: 'Reason for Name Change (optional)', type: 'textarea' },
        ],
      },
      'change-of-shares': {
        label: 'Change of Share Structure',
        model: 'registry',
        eta: '5 business days',
        fields: [
          { key: 'description', label: 'Describe the Change', type: 'textarea', required: true, helpText: 'Describe the change to share classes, rights, or authorised numbers' },
          { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
        ],
      },
      'change-other': {
        label: 'Other Change — describe it',
        model: 'custom',
        eta: 'Quote within 1 business hour',
        fields: [
          { key: 'description', label: 'Describe the Change', type: 'textarea', required: true, helpText: 'Describe what needs to change. We\'ll respond with a quote within 1 business hour.' },
          { key: 'attachment', label: 'Supporting Document (optional)', type: 'file' },
          { key: 'urgency', label: 'Urgency', type: 'radio', options: [
            { value: 'Standard', label: 'Standard' },
            { value: 'Rush', label: 'Rush' },
          ]},
        ],
      },
    },
  },

  {
    key: 'start-a-company',
    label: 'Start a Company',
    icon: 'Building2',
    blurb: 'Incorporate + name search + organizational documents',
    services: {
      'incorporation': {
        label: 'Incorporation',
        model: 'registry',
        eta: '3–5 business days',
        fields: [
          { key: 'proposedName', label: 'Proposed Corporation Name', type: 'text', required: true },
          { key: 'numberedCompany', label: 'Use a numbered company instead', type: 'checkbox' },
          { key: 'nuansSearch', label: 'Include NUANS pre-search', type: 'checkbox', showIf: { key: 'numberedCompany', equals: false } },
          { key: 'numDirectors', label: 'Number of Directors', type: 'radio', options: [
            { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4+', label: '4+' },
          ]},
          { key: 'directors', label: 'Directors', type: 'repeater', required: true, itemFields: [
            { key: 'name', label: 'Full Name', type: 'text' },
            { key: 'address', label: 'Residential Address', type: 'textarea' },
            { key: 'email', label: 'Email', type: 'email' },
          ]},
          { key: 'shareStructure', label: 'Share Structure', type: 'radio', required: true, options: [
            { value: 'Simple', label: 'Simple — one common class' },
            { value: 'Custom', label: 'Custom' },
          ]},
          { key: 'customShareNotes', label: 'Custom Share Structure Notes', type: 'textarea', showIf: { key: 'shareStructure', equals: 'Custom' } },
          { key: 'registeredOffice', label: 'Registered Office Address', type: 'textarea', required: true },
          { key: 'notes', label: 'Additional Notes (optional)', type: 'textarea' },
        ],
      },
      'nuans-search': {
        label: 'NUANS Name Search',
        model: 'registry',
        eta: '1 business day',
        fields: [
          { key: 'proposedNames', label: 'Proposed Names', type: 'repeater', required: true, itemFields: [
            { key: 'name', label: 'Proposed Name', type: 'text' },
          ]},
          { key: 'firstChoiceIfTaken', label: 'Backup Name if First Choice Taken (optional)', type: 'text' },
        ],
      },
      'name-reservation': {
        label: 'Name Reservation',
        model: 'registry',
        eta: '1 business day',
        fields: [
          { key: 'proposedName', label: 'Proposed Name', type: 'text', required: true },
          { key: 'nuansReport', label: 'NUANS Report (optional)', type: 'file', accept: '.pdf,.html,.txt' },
        ],
      },
      'numbered-to-named': {
        label: 'Numbered → Named Conversion',
        model: 'registry',
        eta: '3 business days',
        fields: [
          { key: 'corporationNumber', label: 'Corporation Number', type: 'text', required: true },
          { key: 'proposedNewName', label: 'Proposed New Name', type: 'text', required: true },
          { key: 'nuansReport', label: 'NUANS Report (optional)', type: 'file', accept: '.pdf,.html,.txt' },
        ],
      },
      'organizational-bylaws': {
        label: 'Organizational Bylaws',
        model: 'document',
        eta: '24 hours',
        fields: [
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'corporationNumber', label: 'Corporation Number (optional)', type: 'text' },
          { key: 'boardSize', label: 'Board Size', type: 'number', defaultValue: 1, min: 1 },
          { key: 'quorum', label: 'Quorum', type: 'text', defaultValue: 'Majority' },
          { key: 'fiscalYearEnd', label: 'Fiscal Year End', type: 'date', required: true },
          { key: 'bankingResolutionIncluded', label: 'Include Banking Resolution', type: 'checkbox', defaultValue: true },
        ],
      },
      'initial-resolutions': {
        label: 'Initial Organizational Resolutions',
        model: 'document',
        eta: '24 hours',
        fields: [
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'appointOfficers', label: 'Appoint officers', type: 'checkbox', defaultValue: true },
          { key: 'issueShares', label: 'Issue shares', type: 'checkbox', defaultValue: true },
          { key: 'adoptBylaws', label: 'Adopt bylaws', type: 'checkbox', defaultValue: true },
          { key: 'appointAuditor', label: 'Appoint auditor', type: 'checkbox', defaultValue: false },
          { key: 'additionalResolutions', label: 'Additional Resolutions (optional)', type: 'textarea' },
        ],
      },
    },
  },

  {
    key: 'corporate-documents',
    label: 'Corporate Documents',
    icon: 'FileText',
    blurb: 'Bylaws, resolutions, shareholder agreements, share certificates',
    services: {
      'corporate-bylaws': {
        label: 'Corporate Bylaws',
        model: 'document',
        eta: '24 hours',
        fields: [
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'corporationNumber', label: 'Corporation Number (optional)', type: 'text' },
          { key: 'boardSize', label: 'Board Size', type: 'number', defaultValue: 1, min: 1 },
          { key: 'quorum', label: 'Quorum', type: 'text', defaultValue: 'Majority' },
          { key: 'fiscalYearEnd', label: 'Fiscal Year End', type: 'date', required: true },
        ],
      },
      'director-resolution': {
        label: "Directors' Resolution",
        model: 'document',
        eta: '24 hours',
        fields: [
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'subject', label: 'Subject', type: 'text', required: true, placeholder: 'Open bank account, approve contract…' },
          { key: 'resolutionText', label: 'Resolution Text', type: 'textarea', required: true },
          { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
          { key: 'signatories', label: 'Signatories (Directors)', type: 'repeater', required: true, itemFields: [
            { key: 'name', label: 'Director Name', type: 'text' },
          ]},
        ],
      },
      'shareholder-resolution': {
        label: "Shareholders' Resolution",
        model: 'document',
        eta: '24 hours',
        fields: [
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'subject', label: 'Subject', type: 'text', required: true, placeholder: 'Approve transaction, ratify decision…' },
          { key: 'resolutionText', label: 'Resolution Text', type: 'textarea', required: true },
          { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
          { key: 'signatories', label: 'Signatories (Shareholders)', type: 'repeater', required: true, itemFields: [
            { key: 'name', label: 'Shareholder Name', type: 'text' },
          ]},
        ],
      },
      'shareholder-agreement': {
        label: "Shareholders' Agreement",
        model: 'document',
        eta: '48 hours',
        fields: [
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'numberOfShareholders', label: 'Number of Shareholders', type: 'number', required: true, min: 2 },
          { key: 'exitMechanism', label: 'Exit Mechanism', type: 'select', options: [
            { value: 'Shotgun', label: 'Shotgun' },
            { value: 'Right of First Refusal', label: 'Right of First Refusal' },
            { value: 'Tag-Along/Drag-Along', label: 'Tag-Along / Drag-Along' },
            { value: 'Custom', label: 'Custom' },
          ]},
          { key: 'customExitNotes', label: 'Custom Exit Terms', type: 'textarea', showIf: { key: 'exitMechanism', equals: 'Custom' } },
          { key: 'keyTerms', label: 'Key Terms / Notes (optional)', type: 'textarea' },
        ],
      },
      'unanimous-sh-agreement': {
        label: "Unanimous Shareholders' Agreement",
        model: 'document',
        eta: '48 hours',
        fields: [
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'numberOfShareholders', label: 'Number of Shareholders', type: 'number', required: true, min: 2 },
          { key: 'exitMechanism', label: 'Exit Mechanism', type: 'select', options: [
            { value: 'Shotgun', label: 'Shotgun' },
            { value: 'Right of First Refusal', label: 'Right of First Refusal' },
            { value: 'Tag-Along/Drag-Along', label: 'Tag-Along / Drag-Along' },
            { value: 'Custom', label: 'Custom' },
          ]},
          { key: 'customExitNotes', label: 'Custom Exit Terms', type: 'textarea', showIf: { key: 'exitMechanism', equals: 'Custom' } },
          { key: 'dirInfo', label: 'Shareholders to manage corp directly (no separate board)', type: 'checkbox' },
          { key: 'keyTerms', label: 'Key Terms / Notes (optional)', type: 'textarea' },
        ],
      },
      'share-certificate': {
        label: 'Share Certificate',
        model: 'document',
        eta: '24 hours',
        fields: [
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'shareholderName', label: 'Shareholder Name', type: 'text', required: true },
          { key: 'shareClass', label: 'Share Class', type: 'text', required: true, placeholder: 'Common, Preferred Class A…' },
          { key: 'numberOfShares', label: 'Number of Shares', type: 'number', required: true, min: 1 },
          { key: 'certificateNumber', label: 'Certificate Number', type: 'text', required: true },
          { key: 'issueDate', label: 'Issue Date', type: 'date', required: true },
        ],
      },
      'share-transfer': {
        label: 'Share Transfer Documents',
        model: 'document',
        eta: '24 hours',
        fields: [
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'transferorName', label: 'Transferor (Seller) Name', type: 'text', required: true },
          { key: 'transfereeName', label: 'Transferee (Buyer) Name', type: 'text', required: true },
          { key: 'shareClass', label: 'Share Class', type: 'text', required: true },
          { key: 'numberOfShares', label: 'Number of Shares', type: 'number', required: true, min: 1 },
          { key: 'transferPrice', label: 'Transfer Price per Share (CAD)', type: 'number', required: true, min: 0 },
          { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
        ],
      },
      'officer-appointment': {
        label: 'Officer Appointment',
        model: 'document',
        eta: '24 hours',
        fields: [
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'officerName', label: 'Officer Name', type: 'text', required: true },
          { key: 'position', label: 'Position', type: 'text', required: true, placeholder: 'CEO, CFO, Secretary…' },
          { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
        ],
      },
      'consent-to-act': {
        label: 'Director/Officer Consent',
        model: 'document',
        eta: '24 hours',
        fields: [
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'consentingName', label: 'Consenting Person Name', type: 'text', required: true },
          { key: 'role', label: 'Role', type: 'radio', options: [
            { value: 'Director', label: 'Director' },
            { value: 'Officer', label: 'Officer' },
            { value: 'Both', label: 'Both' },
          ]},
          { key: 'consentDate', label: 'Consent Date', type: 'date', required: true },
        ],
      },
      'resignation': {
        label: 'Director/Officer Resignation',
        model: 'document',
        eta: '24 hours',
        fields: [
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'resigningName', label: 'Resigning Person Name', type: 'text', required: true },
          { key: 'role', label: 'Role', type: 'radio', options: [
            { value: 'Director', label: 'Director' },
            { value: 'Officer', label: 'Officer' },
            { value: 'Both', label: 'Both' },
          ]},
          { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
          { key: 'reason', label: 'Reason (optional)', type: 'text' },
        ],
      },
      'dividend-resolution': {
        label: 'Dividend Declaration Resolution',
        model: 'document',
        eta: '24 hours',
        fields: [
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'shareClass', label: 'Share Class', type: 'text', required: true },
          { key: 'dividendAmount', label: 'Dividend Amount per Share (CAD)', type: 'number', required: true, min: 0, helpText: 'Per share, in CAD' },
          { key: 'recordDate', label: 'Record Date', type: 'date', required: true },
          { key: 'paymentDate', label: 'Payment Date', type: 'date', required: true },
        ],
      },
      'shareholder-loan': {
        label: 'Shareholder Loan Agreement',
        model: 'document',
        eta: '24 hours',
        fields: [
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'shareholderName', label: 'Shareholder Name', type: 'text', required: true },
          { key: 'direction', label: 'Loan Direction', type: 'radio', options: [
            { value: 'shareholder-to-corp', label: 'Shareholder lending TO corporation' },
            { value: 'corp-to-shareholder', label: 'Corporation lending TO shareholder' },
          ]},
          { key: 'principalAmount', label: 'Principal Amount (CAD)', type: 'number', required: true, min: 0 },
          { key: 'interestRate', label: 'Interest Rate (% per annum, optional)', type: 'number', min: 0, helpText: '% per annum' },
          { key: 'repaymentTerms', label: 'Repayment Terms', type: 'textarea', required: true },
        ],
      },
    },
  },

  {
    key: 'stay-compliant',
    label: 'Stay Compliant',
    icon: 'CalendarCheck',
    blurb: 'Annual returns, minute books, ongoing compliance plans',
    services: {
      'annual-return': {
        label: 'Annual Return',
        model: 'registry',
        eta: '24 hours',
        fields: [
          { key: 'corporationNumber', label: 'Corporation Number', type: 'text', required: true },
          { key: 'corporationName', label: 'Corporation Name (optional)', type: 'text' },
          { key: 'filingYear', label: 'Filing Year', type: 'number', defaultValue: new Date().getFullYear(), min: 2000 },
          { key: 'hasChanges', label: 'There are director or address changes since last filing', type: 'checkbox' },
          { key: 'changesDescription', label: 'Describe Changes', type: 'textarea', showIf: { key: 'hasChanges', equals: true } },
        ],
      },
      'minute-book': {
        label: 'Corporate Minute Book — Initial',
        model: 'document',
        eta: '48 hours',
        fields: [
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'corporationNumber', label: 'Corporation Number (optional)', type: 'text' },
          { key: 'format', label: 'Format', type: 'radio', options: [
            { value: 'Digital only', label: 'Digital only' },
            { value: 'Digital + bound binder mailed', label: 'Digital + bound binder mailed' },
          ]},
          { key: 'mailingAddress', label: 'Mailing Address', type: 'textarea', showIf: { key: 'format', equals: 'Digital + bound binder mailed' } },
        ],
      },
      'minute-book-update': {
        label: 'Minute Book — Bring Up to Date',
        model: 'document',
        eta: '5 business days',
        fields: [
          { key: 'corporationNumber', label: 'Corporation Number', type: 'text', required: true },
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'yearsBehind', label: 'Years Out of Date', type: 'number', required: true, min: 1, helpText: 'Approximately how many years out of date is the minute book?' },
          { key: 'currentBookAvailable', label: 'Current Minute Book Available?', type: 'radio', options: [
            { value: 'Yes', label: 'Yes — we can send it' },
            { value: 'No', label: 'No — start from scratch' },
          ]},
        ],
      },
      'compliance-subscription': {
        label: 'Annual Compliance Plan',
        model: 'subscription',
        eta: 'Setup within 24 hours',
        fields: [
          { key: 'numberOfCorporations', label: 'Number of Corporations', type: 'number', defaultValue: 1, min: 1 },
          { key: 'corporationNames', label: 'Corporation Names', type: 'textarea', required: true, helpText: 'List one per line' },
          { key: 'annualReturn', label: 'Annual Return filing', type: 'checkbox' },
          { key: 'directorChanges', label: 'Director-change filings', type: 'checkbox' },
          { key: 'addressChanges', label: 'Address-change filings', type: 'checkbox' },
          { key: 'minuteBookMaintenance', label: 'Minute book maintenance', type: 'checkbox' },
          { key: 'reminderEmails', label: 'Reminder emails 60 days before each deadline', type: 'checkbox' },
        ],
      },
    },
  },

  {
    key: 'dissolve-or-revive',
    label: 'Dissolve or Revive',
    icon: 'Archive',
    blurb: 'Wind up, restore, amalgamate, continue to another jurisdiction',
    services: {
      'voluntary-dissolution': {
        label: 'Voluntary Dissolution',
        model: 'registry',
        eta: '5 business days',
        fields: [
          { key: 'corporationNumber', label: 'Corporation Number', type: 'text', required: true },
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'noDebtsOrLitigation', label: 'I confirm no debts, liabilities, or pending litigation', type: 'checkbox', required: true },
          { key: 'finalFiscalYearEnd', label: 'Final Fiscal Year End', type: 'date', required: true },
          { key: 'distributionOfAssetsStatement', label: 'Distribution of Assets Statement', type: 'textarea', required: true },
        ],
      },
      'revival': {
        label: 'Revive a Dissolved Corporation',
        model: 'registry',
        eta: '5–10 business days',
        fields: [
          { key: 'corporationNumber', label: 'Corporation Number', type: 'text', required: true },
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'reasonForRevival', label: 'Reason for Revival', type: 'textarea', required: true },
          { key: 'willPayBackFees', label: 'I understand outstanding fees and penalties must be paid', type: 'checkbox', required: true },
        ],
      },
      'continuance': {
        label: 'Continuance to Another Jurisdiction',
        model: 'registry',
        eta: '10 business days',
        fields: [
          { key: 'corporationNumber', label: 'Corporation Number', type: 'text', required: true },
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'currentJurisdiction', label: 'Current Jurisdiction', type: 'text', required: true, helpText: 'Confirm the jurisdiction selected in Step 2' },
          { key: 'targetJurisdiction', label: 'Target Jurisdiction', type: 'select', required: true, options: [
            { value: 'canada-federal', label: 'Canada — Federal (CBCA)' },
            { value: 'alberta', label: 'Alberta' },
            { value: 'british-columbia', label: 'British Columbia' },
            { value: 'manitoba', label: 'Manitoba' },
            { value: 'new-brunswick', label: 'New Brunswick' },
            { value: 'newfoundland', label: 'Newfoundland & Labrador' },
            { value: 'northwest-territories', label: 'Northwest Territories' },
            { value: 'nova-scotia', label: 'Nova Scotia' },
            { value: 'nunavut', label: 'Nunavut' },
            { value: 'ontario', label: 'Ontario' },
            { value: 'prince-edward-island', label: 'Prince Edward Island' },
            { value: 'quebec', label: 'Québec' },
            { value: 'saskatchewan', label: 'Saskatchewan' },
            { value: 'yukon', label: 'Yukon' },
          ]},
        ],
      },
      'extra-provincial-reg': {
        label: 'Extra-Provincial Registration',
        model: 'registry',
        eta: '5 business days',
        fields: [
          { key: 'corporationNumber', label: 'Corporation Number', type: 'text', required: true },
          { key: 'corporationName', label: 'Corporation Name', type: 'text', required: true },
          { key: 'homeJurisdiction', label: 'Home Jurisdiction', type: 'text', required: true },
          { key: 'albertaReg', label: 'Alberta', type: 'checkbox' },
          { key: 'bcReg', label: 'British Columbia', type: 'checkbox' },
          { key: 'manitobaReg', label: 'Manitoba', type: 'checkbox' },
          { key: 'nbReg', label: 'New Brunswick', type: 'checkbox' },
          { key: 'nlReg', label: 'Newfoundland & Labrador', type: 'checkbox' },
          { key: 'nsReg', label: 'Nova Scotia', type: 'checkbox' },
          { key: 'ontarioReg', label: 'Ontario', type: 'checkbox' },
          { key: 'peiReg', label: 'Prince Edward Island', type: 'checkbox' },
          { key: 'quebecReg', label: 'Québec', type: 'checkbox' },
          { key: 'saskReg', label: 'Saskatchewan', type: 'checkbox' },
        ],
      },
      'amalgamation': {
        label: 'Amalgamation',
        model: 'custom',
        eta: 'Custom quote',
        fields: [
          { key: 'corporations', label: 'Corporations to Amalgamate', type: 'repeater', required: true, itemFields: [
            { key: 'name', label: 'Corporation Name', type: 'text' },
            { key: 'number', label: 'Corporation Number', type: 'text' },
          ]},
          { key: 'proposedAmalgamatedName', label: 'Proposed Amalgamated Name', type: 'text', required: true },
          { key: 'notes', label: 'Notes (optional)', type: 'textarea' },
        ],
      },
    },
  },
];

export const JURISDICTIONS = [
  { key: 'canada-federal',        label: 'Canada — Federal (CBCA)', pinned: true },
  { key: 'alberta',               label: 'Alberta' },
  { key: 'british-columbia',      label: 'British Columbia' },
  { key: 'manitoba',              label: 'Manitoba' },
  { key: 'new-brunswick',         label: 'New Brunswick' },
  { key: 'newfoundland',          label: 'Newfoundland & Labrador' },
  { key: 'northwest-territories', label: 'Northwest Territories' },
  { key: 'nova-scotia',           label: 'Nova Scotia' },
  { key: 'nunavut',               label: 'Nunavut' },
  { key: 'ontario',               label: 'Ontario' },
  { key: 'prince-edward-island',  label: 'Prince Edward Island' },
  { key: 'quebec',                label: 'Québec' },
  { key: 'saskatchewan',          label: 'Saskatchewan' },
  { key: 'yukon',                 label: 'Yukon' },
];

export const MODEL_LABELS: Record<string, string> = {
  registry:     'Registry filing',
  document:     'Document prep',
  subscription: 'Subscription',
  custom:       'Custom quote',
};
