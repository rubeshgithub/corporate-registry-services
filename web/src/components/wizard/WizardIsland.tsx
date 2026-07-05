"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, ArrowRight, Send, ExternalLink } from "lucide-react";

// Corporate documents (minute books, by-laws, resolutions) are handled on
// our sister product MinuteBook rather than the CRS quote flow.
const MINUTEBOOK_URL = "https://minutebook.corporateregistryservices.ca";
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
      setHydrated(true);
      return;
    }

    // Deep-link support: /?service=annual-return&jurisdiction=bc&src=article-...
    // Article CTAs land here — jump the visitor past the bucket + service pickers.
    const params = new URLSearchParams(window.location.search);
    const serviceParam      = params.get("service");
    const jurisdictionParam = params.get("jurisdiction");
    if (serviceParam) {
      const bucket  = SERVICE_BUCKETS.find((b) => b.services.some((s) => s.key === serviceParam));
      const service = bucket?.services.find((s) => s.key === serviceParam);
      if (bucket && service) {
        const hasJur   = !!jurisdictionParam;
        const hasField = !!(service.detailFields && service.detailFields.length > 0);
        const initialStep: WizardState["step"] =
          service.needsJurisdiction && !hasJur ? 3 : hasField ? 4 : 5;
        setState({
          ...INITIAL_STATE,
          bucketKey:       bucket.key,
          serviceKeys:     [service.key],
          jurisdictionKey: jurisdictionParam,
          step:            initialStep,
        });
        setHydrated(true);
        return;
      }
    }

    setState(load());
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

  // Fast-path: if the visitor picked exactly one service that has a dedicated
  // order flow (annual return, incorporation) and a jurisdiction, jump straight
  // to the checkout instead of routing them through the generic quote flow.
  const soleService = state.serviceKeys.length === 1 ? state.serviceKeys[0] : null;

  const annualReturnServices     = ["annual-return", "annual-return-multiple"];
  const incorporationServices    = ["incorporation-numbered", "incorporation-named", "extra-provincial", "not-for-profit"];
  const reportServices           = ["profile-report", "good-standing"];
  const nameSearchServices       = ["corporate-search", "nuans-search"];
  const changeServices           = ["change-directors", "change-address", "voluntary-dissolution", "revival"];

  const canFastCheckout = !!soleService && (
    // These flows need a jurisdiction picked in the wizard
    ((annualReturnServices.includes(soleService) || incorporationServices.includes(soleService) || reportServices.includes(soleService) || soleService === "corporate-search" || changeServices.includes(soleService)) && !!state.jurisdictionKey) ||
    // NUANS is federal-only, no jurisdiction needed
    (soleService === "nuans-search")
  );

  // Corporate documents bucket routes off-site to MinuteBook. The Next button
  // adapts label + destination; a short info panel explains the redirect so
  // the visitor isn't surprised when the tab changes.
  const isCorporateDocsBucket = state.step === 1 && state.bucketKey === "corporate-docs";
  const goMinuteBook = () => { window.location.href = MINUTEBOOK_URL; };

  const goFastCheckout = () => {
    if (!soleService) return;
    const params = new URLSearchParams();
    if (state.jurisdictionKey) params.set("jurisdiction", state.jurisdictionKey);
    params.set("src", "wizard");

    if (annualReturnServices.includes(soleService)) {
      if (soleService === "annual-return-multiple") {
        const yearsFromDetails = parseInt(state.details.yearsOwing ?? "", 10);
        params.set("years", String(Number.isFinite(yearsFromDetails) && yearsFromDetails >= 2 ? yearsFromDetails : 2));
      }
      window.location.href = `/order/annual-return?${params.toString()}`;
      return;
    }

    if (reportServices.includes(soleService)) {
      window.location.href = `/order/${soleService}?${params.toString()}`;
      return;
    }

    if (nameSearchServices.includes(soleService)) {
      // Bring across proposed name if the visitor typed one in the wizard.
      const proposedName = state.details.proposedName ?? state.details.searchName;
      if (proposedName) params.set("q", proposedName);
      window.location.href = `/order/${soleService}?${params.toString()}`;
      return;
    }

    if (changeServices.includes(soleService)) {
      window.location.href = `/order/${soleService}?${params.toString()}`;
      return;
    }

    if (incorporationServices.includes(soleService)) {
      const type =
        soleService === "incorporation-numbered" ? "numbered"
      : soleService === "incorporation-named"    ? "named"
      : soleService === "extra-provincial"       ? "extra-provincial"
      : soleService === "not-for-profit"         ? "not-for-profit"
      : "numbered";
      params.set("type", type);
      // Bring across any details the wizard already collected.
      if (state.details.proposedName) params.set("proposedName", state.details.proposedName);
      window.location.href = `/order/incorporation?${params.toString()}`;
      return;
    }
  };

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
    // Corporate documents don't live on CRS — send the visitor to MinuteBook.
    if (isCorporateDocsBucket) {
      goMinuteBook();
      return;
    }
    // Fast-path override: the moment the visitor's selection resolves to a single
    // service with a dedicated checkout (annual return / incorporation) and a
    // jurisdiction is set, "Next" becomes "go pay" — no point walking them through
    // contact + review just to email a quote for something they can buy directly.
    if (canFastCheckout) {
      goFastCheckout();
      return;
    }
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

        {/* Corporate Documents lives on MinuteBook — surface a small notice
            immediately after bucket selection so the redirect on Next isn't
            surprising. */}
        {isCorporateDocsBucket && (
          <div
            style={{
              marginTop: "1rem",
              padding: "0.85rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid var(--gold)",
              background: "var(--gold-dim)",
              display: "flex",
              gap: "0.6rem",
              alignItems: "flex-start",
              fontSize: "0.82rem",
              lineHeight: 1.5,
            }}
          >
            <ExternalLink size={15} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.1rem" }} />
            <div>
              <span style={{ fontWeight: 700, color: "var(--text)" }}>Corporate documents live on MinuteBook.</span>{" "}
              <span style={{ color: "var(--text-muted)" }}>
                Minute books, by-laws, share certificates, and resolutions are handled by our sister product.
                Continue to open MinuteBook.
              </span>
            </div>
          </div>
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
          {isCorporateDocsBucket ? (
            <>
              Open MinuteBook <ExternalLink size={14} />
            </>
          ) : canFastCheckout ? (
            <>
              Continue to secure checkout <ArrowRight size={15} />
            </>
          ) : isLast ? (
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
