import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { INITIAL_STATE, type WizardState, type WizardStep } from './wizard-types';
import { BUCKETS } from './service-config';
import StepBucket from './steps/StepBucket';
import StepService from './steps/StepService';
import StepJurisdiction from './steps/StepJurisdiction';
import StepDetails from './steps/StepDetails';
import StepContact from './steps/StepContact';
import StepReview from './steps/StepReview';

const STORAGE_KEY = 'crs:wizard:v1';

const STEP_LABELS: Record<number, string> = {
  1: 'Category',
  1.5: 'Service',
  2: 'Jurisdiction',
  3: 'Details',
  4: 'Contact',
  5: 'Review',
};

const STEP_ORDER: WizardStep[] = [1, 1.5, 2, 3, 4, 5];

function getProgressIndex(step: WizardStep): number {
  return STEP_ORDER.indexOf(step);
}

function canAdvance(state: WizardState): boolean {
  switch (state.step) {
    case 1: return !!state.bucketKey;
    case 1.5: return state.serviceKeys.length > 0;
    case 2: return !!state.jurisdictionKey;
    case 3: return true;
    case 4: {
      const c = state.customer;
      return !!(c.fullName && c.email && c.phone && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email));
    }
    case 5: return state.consents.terms;
    default: return false;
  }
}

function nextStep(state: WizardState): WizardStep {
  const idx = STEP_ORDER.indexOf(state.step);
  return STEP_ORDER[Math.min(idx + 1, STEP_ORDER.length - 1)];
}

function prevStep(state: WizardState): WizardStep {
  const idx = STEP_ORDER.indexOf(state.step);
  return STEP_ORDER[Math.max(idx - 1, 0)];
}

export default function WizardIsland() {
  const [state, setStateRaw] = useState<WizardState>(INITIAL_STATE);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as WizardState;
        setStateRaw({ ...INITIAL_STATE, ...parsed, step: parsed.step ?? 1 });
      }
    } catch {
      // ignore corrupt state
    }
    setHydrated(true);
  }, []);

  const setState = useCallback((updater: WizardState | ((prev: WizardState) => WizardState)) => {
    setStateRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);

  const handleBucketSelect = (key: string) => {
    setState((prev) => {
      const changed = key !== prev.bucketKey;
      return {
        ...prev,
        bucketKey: key,
        serviceKeys: changed ? [] : prev.serviceKeys,
        details: changed ? {} : prev.details,
        step: 1.5,
      };
    });
  };

  const handleServiceToggle = (key: string) => {
    setState((prev) => {
      const bucket = BUCKETS.find((b) => b.key === prev.bucketKey);
      if (!bucket) return prev;
      if (bucket.multiSelect) {
        const already = prev.serviceKeys.includes(key);
        const next = already ? prev.serviceKeys.filter((k) => k !== key) : [...prev.serviceKeys, key];
        const details = { ...prev.details };
        if (already) delete details[key];
        return { ...prev, serviceKeys: next, details };
      }
      return { ...prev, serviceKeys: [key], details: {} };
    });
  };

  const handleNext = () => {
    if (!canAdvance(state)) return;
    setState((prev) => ({ ...prev, step: nextStep(prev) }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setState((prev) => ({ ...prev, step: prevStep(prev) }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleEdit = (step: WizardStep) => {
    setState((prev) => ({ ...prev, step }));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    setSubmitError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/wizard-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Submission failed');
      localStorage.removeItem(STORAGE_KEY);
      window.location.href = `/order/${data.ref}/thanks`;
    } catch (err: any) {
      setSubmitError(err.message || 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  const bucket = BUCKETS.find((b) => b.key === state.bucketKey);
  const progressIdx = getProgressIndex(state.step);
  const isFirst = state.step === 1;
  const isLast = state.step === 5;
  const advance = canAdvance(state);

  if (!hydrated) {
    return <div className="wizard-card" style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="spinner" /></div>;
  }

  return (
    <div className="wizard-card">
      {/* Progress strip */}
      <div className="wizard-progress" role="progressbar" aria-valuenow={progressIdx + 1} aria-valuemax={STEP_ORDER.length}>
        {STEP_ORDER.map((s, i) => (
          <div
            key={s}
            className={`wizard-progress-seg${i <= progressIdx ? ' done' : ''}`}
            title={STEP_LABELS[s as number]}
          />
        ))}
      </div>
      <div className="wizard-progress-label">{STEP_LABELS[state.step as number]}</div>

      {/* Step content */}
      <div className="wizard-step-wrap">
        {state.step === 1 && (
          <StepBucket buckets={BUCKETS} selected={state.bucketKey} onSelect={handleBucketSelect} />
        )}
        {state.step === 1.5 && bucket && (
          <StepService bucket={bucket} selectedKeys={state.serviceKeys} onToggle={handleServiceToggle} />
        )}
        {state.step === 2 && bucket && (
          <StepJurisdiction
            bucket={bucket}
            selectedKeys={state.serviceKeys}
            jurisdictionKey={state.jurisdictionKey}
            onSelect={(key) => setState((prev) => ({ ...prev, jurisdictionKey: key }))}
          />
        )}
        {state.step === 3 && bucket && (
          <StepDetails
            bucket={bucket}
            serviceKeys={state.serviceKeys}
            details={state.details}
            onChange={(details) => setState((prev) => ({ ...prev, details }))}
          />
        )}
        {state.step === 4 && (
          <StepContact
            customer={state.customer}
            onChange={(customer) => setState((prev) => ({ ...prev, customer }))}
          />
        )}
        {state.step === 5 && (
          <StepReview
            state={state}
            onEdit={handleEdit}
            onConsent={(v) => setState((prev) => ({ ...prev, consents: { ...prev.consents, terms: v } }))}
            onSubmit={handleSubmit}
            submitting={submitting}
            submitError={submitError}
          />
        )}
      </div>

      {/* Nav buttons (hidden on review step — StepReview has its own submit button) */}
      {!isLast && (
        <div className="wizard-nav">
          {!isFirst && (
            <button className="wizard-btn-back" onClick={handleBack}>
              <ChevronLeft size={16} /> Back
            </button>
          )}
          <button
            className="wizard-btn-next"
            disabled={!advance}
            onClick={handleNext}
            style={{ marginLeft: isFirst ? 'auto' : undefined }}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
      {!isLast && !advance && (
        <div className="wizard-btn-hint">
          {state.step === 1 && 'Select a category to continue.'}
          {state.step === 1.5 && 'Select at least one service.'}
          {state.step === 2 && 'Select a jurisdiction to continue.'}
          {state.step === 4 && 'Fill in all required fields to continue.'}
        </div>
      )}
    </div>
  );
}
