"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, ArrowRight, Send } from "lucide-react";
import { SERVICE_BUCKETS, getBucket } from "@/lib/service-config";
import { INITIAL_STATE, type WizardState } from "@/lib/wizard-types";
import StepBucket from "./steps/StepBucket";
import StepServices from "./steps/StepServices";
import StepJurisdiction from "./steps/StepJurisdiction";
import StepDetails from "./steps/StepDetails";
import StepContact from "./steps/StepContact";
import StepReview from "./steps/StepReview";

const STORAGE_KEY = "docu10:wizard:v1";

type PreloadData = { companyName?: string; jurisdictionKey?: string };

function load(): WizardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...INITIAL_STATE, ...JSON.parse(raw) };
  } catch {}
  return INITIAL_STATE;
}

function save(s: WizardState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

export default function WizardIsland({ preload }: { preload?: PreloadData }) {
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (preload) {
      setState({ ...INITIAL_STATE, jurisdictionKey: preload.jurisdictionKey ?? null });
    } else {
      setState(load());
    }
    setHydrated(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((patch: Partial<WizardState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      if (!preload) save(next);
      return next;
    });
  }, [preload]);

  const bucket = state.bucketKey ? getBucket(state.bucketKey) : null;

  // Determine which steps are active based on selections
  const selectedServices = bucket
    ? bucket.services.filter((s) => state.serviceKeys.includes(s.key))
    : [];
  const needsJurisdiction = selectedServices.some((s) => s.needsJurisdiction);
  const hasDetailFields = selectedServices.some(
    (s) => s.detailFields && s.detailFields.length > 0
  );

  // Step map: 1=bucket, 2=services, 3=jurisdiction(optional), 4=details(optional), 5=contact, 6=review
  // When opened from a search result (preload), jurisdiction is already known — skip step 3.
  const steps = [
    1, // bucket
    2, // services
    ...(needsJurisdiction && !preload ? [3] : []),
    ...(hasDetailFields ? [4] : []),
    5, // contact
    6, // review
  ];

  const currentStepIndex = steps.indexOf(state.step);
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === steps.length - 1;

  const canAdvance = (() => {
    switch (state.step) {
      case 1: return !!state.bucketKey;
      case 2: return state.serviceKeys.length > 0;
      case 3: return !!state.jurisdictionKey;
      case 4: {
        // Check all required detail fields are filled
        if (!bucket) return false;
        const required = selectedServices
          .flatMap((s) => s.detailFields ?? [])
          .filter((f) => f.required);
        return required.every((f) => !!state.details[f.key]?.trim());
      }
      case 5: return !!(state.customer.fullName && state.customer.email && state.customer.phone);
      case 6: return state.consents.terms;
      default: return false;
    }
  })();

  const goNext = () => {
    if (!canAdvance) return;
    if (isLast) {
      handleSubmit();
      return;
    }
    const nextStep = steps[currentStepIndex + 1];
    update({ step: nextStep as WizardState["step"] });
  };

  const goBack = () => {
    if (isFirst) return;
    const prevStep = steps[currentStepIndex - 1];
    update({ step: prevStep as WizardState["step"] });
  };

  const handleBucketSelect = (key: string) => {
    const changed = key !== state.bucketKey;
    update({
      bucketKey: key,
      serviceKeys: changed ? [] : state.serviceKeys,
      jurisdictionKey: changed ? null : state.jurisdictionKey,
      details: changed ? {} : state.details,
      // step stays at 1 — user must click Next
    });
  };

  const handleServiceToggle = (key: string) => {
    const next = state.serviceKeys.includes(key)
      ? state.serviceKeys.filter((k) => k !== key)
      : [...state.serviceKeys, key];
    update({ serviceKeys: next });
  };

  const handleDetailChange = (key: string, value: string) => {
    update({ details: { ...state.details, [key]: value } });
  };

  const handleCustomerChange = (
    field: keyof WizardState["customer"],
    value: string
  ) => {
    update({ customer: { ...state.customer, [field]: value } });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/wizard-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (res.ok) {
        const { ref } = await res.json();
        localStorage.removeItem(STORAGE_KEY);
        window.location.href = `/order/thanks?ref=${ref}`;
      } else {
        alert("Something went wrong. Please try again or email us directly.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="wizard-card" style={{ padding: "2rem", minHeight: "20rem", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="wizard-card" style={{ display: "flex", flexDirection: "column" }}>
      {/* Step content */}
      <div style={{ padding: "1.25rem 1.25rem 0.75rem", flex: 1, overflow: "auto" }}>
        {state.step === 1 && (
          <StepBucket
            buckets={preload ? SERVICE_BUCKETS.filter((b) => b.key !== "start-company") : SERVICE_BUCKETS}
            selected={state.bucketKey}
            onSelect={handleBucketSelect}
            companyName={preload?.companyName}
          />
        )}
        {state.step === 2 && bucket && (
          <StepServices
            bucket={bucket}
            selected={state.serviceKeys}
            onToggle={handleServiceToggle}
          />
        )}
        {state.step === 3 && bucket && (
          <StepJurisdiction
            bucket={bucket}
            serviceKeys={state.serviceKeys}
            selected={state.jurisdictionKey}
            onSelect={(key) => update({ jurisdictionKey: key })}
          />
        )}
        {state.step === 4 && bucket && (
          <StepDetails
            bucket={bucket}
            serviceKeys={state.serviceKeys}
            details={state.details}
            onChange={handleDetailChange}
          />
        )}
        {state.step === 5 && (
          <StepContact
            customer={state.customer}
            onChange={handleCustomerChange}
          />
        )}
        {state.step === 6 && bucket && (
          <StepReview
            state={state}
            bucket={bucket}
            onTermsChange={(v) => update({ consents: { terms: v } })}
            submitting={submitting}
          />
        )}
      </div>

      {/* Nav bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.75rem 1.25rem",
          borderTop: "1px solid var(--border)",
          background: "var(--card)",
        }}
      >
        <button
          className="btn-ghost"
          onClick={goBack}
          disabled={isFirst}
          style={{ opacity: isFirst ? 0 : 1, pointerEvents: isFirst ? "none" : undefined }}
        >
          <ArrowLeft size={15} /> Back
        </button>

        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>
          {currentStepIndex + 1} / {steps.length}
        </span>

        <button
          className="btn-primary"
          onClick={goNext}
          disabled={!canAdvance || submitting}
        >
          {isLast ? (
            <>
              <Send size={14} /> Submit
            </>
          ) : (
            <>
              Next <ArrowRight size={15} />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
