export type WizardStep = 1 | 1.5 | 2 | 3 | 4 | 5;

export type WizardState = {
  step: WizardStep;
  bucketKey: string | null;
  serviceKeys: string[];
  jurisdictionKey: string | null;
  details: Record<string, any>;
  customer: {
    fullName: string;
    email: string;
    phone: string;
    company?: string;
    preferredContact: 'Email' | 'Phone' | 'Either';
  };
  consents: { terms: boolean };
};

export const INITIAL_STATE: WizardState = {
  step: 1,
  bucketKey: null,
  serviceKeys: [],
  jurisdictionKey: null,
  details: {},
  customer: { fullName: '', email: '', phone: '', company: '', preferredContact: 'Email' },
  consents: { terms: false },
};
