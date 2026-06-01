import { useState } from 'react';
import type { WizardState } from '../wizard-types';

type Props = {
  customer: WizardState['customer'];
  onChange: (c: WizardState['customer']) => void;
};

export default function StepContact({ customer, onChange }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (key: keyof WizardState['customer'], val: string) => {
    onChange({ ...customer, [key]: val });
    if (errors[key]) {
      const next = { ...errors };
      delete next[key];
      setErrors(next);
    }
  };

  const validate = (key: string, val: string) => {
    const next = { ...errors };
    if (!val) {
      next[key] = 'This field is required';
    } else if (key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      next[key] = 'Enter a valid email address';
    } else {
      delete next[key];
    }
    setErrors(next);
  };

  return (
    <div className="wizard-step-enter">
      <div className="wizard-step-title">Your Contact Info</div>
      <div className="wizard-step-sub">We'll confirm your request and follow up within 1 business hour.</div>

      <div className="wizard-fields-grid">
        <div className="wizard-field">
          <label className="wizard-label">Full Name<span className="req">*</span></label>
          <input
            type="text"
            className={`wizard-input${errors.fullName ? ' error' : ''}`}
            value={customer.fullName}
            placeholder="Jane Smith"
            onChange={(e) => set('fullName', e.target.value)}
            onBlur={(e) => validate('fullName', e.target.value)}
          />
          {errors.fullName && <div className="wizard-error-msg">{errors.fullName}</div>}
        </div>

        <div className="wizard-field">
          <label className="wizard-label">Email<span className="req">*</span></label>
          <input
            type="email"
            className={`wizard-input${errors.email ? ' error' : ''}`}
            value={customer.email}
            placeholder="jane@example.com"
            onChange={(e) => set('email', e.target.value)}
            onBlur={(e) => validate('email', e.target.value)}
          />
          {errors.email && <div className="wizard-error-msg">{errors.email}</div>}
        </div>

        <div className="wizard-field">
          <label className="wizard-label">Phone<span className="req">*</span></label>
          <input
            type="tel"
            className={`wizard-input${errors.phone ? ' error' : ''}`}
            value={customer.phone}
            placeholder="+1 (416) 555-0100"
            onChange={(e) => set('phone', e.target.value)}
            onBlur={(e) => validate('phone', e.target.value)}
          />
          {errors.phone && <div className="wizard-error-msg">{errors.phone}</div>}
        </div>

        <div className="wizard-field">
          <label className="wizard-label">Company (optional)</label>
          <input
            type="text"
            className="wizard-input"
            value={customer.company ?? ''}
            placeholder="Acme Corp Inc."
            onChange={(e) => set('company', e.target.value)}
          />
        </div>

        <div className="wizard-field">
          <div className="wizard-label">Preferred Contact Method</div>
          <div className="wizard-radio-group inline">
            {(['Email', 'Phone', 'Either'] as const).map((opt) => (
              <label key={opt} className="wizard-radio-row">
                <input
                  type="radio"
                  name="preferredContact"
                  value={opt}
                  checked={customer.preferredContact === opt}
                  onChange={() => set('preferredContact', opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
