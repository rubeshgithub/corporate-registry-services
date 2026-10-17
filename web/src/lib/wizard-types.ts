import { needsRegistryAccess, type RegistryAccessState } from "@/lib/registry-access";

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

export type WizardState = {
  step: WizardStep;
  bucketKey: string | null;
  serviceKeys: string[];
  jurisdictionKey: string | null;
  details: Record<string, string>;
  customer: {
    fullName: string;
    email: string;
    phone: string;
    company?: string;
    preferredContact: "Email" | "Phone" | "Either";
  };
  consents: {
    terms: boolean;
  };
  /** The registry credential question, when a filing in the basket needs one (lib/registry-access). */
  registryAccess?: RegistryAccessState;
};

/** The first service in the basket that files with a registry needing a credential, or null. */
export function wizardAccessService(s: Pick<WizardState, "serviceKeys" | "jurisdictionKey">): string | null {
  return s.serviceKeys.find((k) => needsRegistryAccess(k, s.jurisdictionKey)) ?? null;
}

export const INITIAL_STATE: WizardState = {
  step: 1,
  bucketKey: null,
  serviceKeys: [],
  jurisdictionKey: null,
  details: {},
  customer: {
    fullName: "",
    email: "",
    phone: "",
    company: "",
    preferredContact: "Email",
  },
  consents: { terms: false },
  registryAccess: { status: "", code: "" },
};
