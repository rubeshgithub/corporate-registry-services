import { useState } from 'react';
import { Pencil, Loader2 } from 'lucide-react';
import type { WizardState } from '../wizard-types';
import type { BucketConfig } from '../service-config';
import { BUCKETS, JURISDICTIONS, MODEL_LABELS } from '../service-config';

type Props = {
  state: WizardState;
  onEdit: (step: WizardState['step']) => void;
  onConsent: (v: boolean) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string;
};

function formatDetails(details: Record<string, any>): string {
  return Object.entries(details)
    .filter(([, v]) => v !== undefined && v !== '' && v !== false && v !== null)
    .map(([k, v]) => {
      const key = k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
      if (typeof v === 'boolean') return `${key}: Yes`;
      if (Array.isArray(v)) return `${key}: ${v.length} item(s)`;
      return `${key}: ${v}`;
    })
    .join('\n');
}

export default function StepReview({ state, onEdit, onConsent, onSubmit, submitting, submitError }: Props) {
  const bucket = BUCKETS.find((b) => b.key === state.bucketKey);
  const jurisdiction = JURISDICTIONS.find((j) => j.key === state.jurisdictionKey);
  const serviceLabels = state.serviceKeys.map((k) => bucket?.services[k]?.label ?? k);
  const isCustom = state.serviceKeys.some((k) => {
    const svc = bucket?.services[k];
    return svc?.model === 'custom' || svc?.model === 'subscription';
  });
  const etaList = state.serviceKeys
    .map((k) => `${bucket?.services[k]?.label ?? k}: ${bucket?.services[k]?.eta ?? '—'}`)
    .join('\n');

  return (
    <div className="wizard-step-enter">
      <div className="wizard-step-title">Review Your Request</div>
      <div className="wizard-step-sub">Check everything looks right before submitting.</div>

      {submitError && <div className="wizard-submit-error">{submitError}</div>}

      <div className="review-cards">
        <div className="review-card">
          <div className="review-card-left">
            <div className="review-card-label">Category</div>
            <div className="review-card-value">{bucket?.label ?? '—'}</div>
          </div>
          <button className="review-edit" onClick={() => onEdit(1)}><Pencil size={12} /> Edit</button>
        </div>

        <div className="review-card">
          <div className="review-card-left">
            <div className="review-card-label">Service(s)</div>
            <div className="review-card-value">
              {serviceLabels.length === 1
                ? serviceLabels[0]
                : <ul>{serviceLabels.map((l, i) => <li key={i}>{l}</li>)}</ul>}
            </div>
          </div>
          <button className="review-edit" onClick={() => onEdit(1.5)}><Pencil size={12} /> Edit</button>
        </div>

        <div className="review-card">
          <div className="review-card-left">
            <div className="review-card-label">Jurisdiction</div>
            <div className="review-card-value">{jurisdiction?.label ?? '—'}</div>
          </div>
          <button className="review-edit" onClick={() => onEdit(2)}><Pencil size={12} /> Edit</button>
        </div>

        <div className="review-card">
          <div className="review-card-left">
            <div className="review-card-label">Details</div>
            <div className="review-card-value" style={{ fontSize: 13, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>
              {state.serviceKeys.map((k) => {
                const vals = state.details[k] ?? {};
                return Object.keys(vals).length > 0
                  ? formatDetails(vals)
                  : '(no details entered)';
              }).join('\n\n')}
            </div>
          </div>
          <button className="review-edit" onClick={() => onEdit(3)}><Pencil size={12} /> Edit</button>
        </div>

        <div className="review-card">
          <div className="review-card-left">
            <div className="review-card-label">Contact</div>
            <div className="review-card-value" style={{ whiteSpace: 'pre-line' }}>
              {state.customer.fullName}{'\n'}
              {state.customer.email}{'\n'}
              {state.customer.phone}
              {state.customer.company ? `\n${state.customer.company}` : ''}
            </div>
          </div>
          <button className="review-edit" onClick={() => onEdit(4)}><Pencil size={12} /> Edit</button>
        </div>
      </div>

      <div className="review-terms">
        <input
          type="checkbox"
          id="wizard-terms"
          checked={state.consents.terms}
          onChange={(e) => onConsent(e.target.checked)}
        />
        <label htmlFor="wizard-terms" className="review-terms-text">
          I agree to the <a href="/terms" target="_blank">Terms of Service</a> and{' '}
          <a href="/privacy" target="_blank">Privacy Policy</a>. I understand that docu10
          will contact me within 1 business hour to confirm this request.
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button
          className="wizard-btn-next"
          style={{ width: '100%', justifyContent: 'center', padding: '16px 32px', fontSize: '13px' }}
          disabled={!state.consents.terms || submitting}
          onClick={onSubmit}
        >
          {submitting ? (
            <><span className="spinner" /> Processing…</>
          ) : isCustom ? 'Request a Quote →' : 'Submit Request →'}
        </button>
        {!state.consents.terms && (
          <div className="wizard-btn-hint">Please accept the terms above to continue.</div>
        )}
      </div>

      {etaList && (
        <div className="review-eta" style={{ whiteSpace: 'pre-line', marginTop: 20 }}>
          ⚡ Estimated turnaround:{'\n'}{etaList}
        </div>
      )}
    </div>
  );
}
