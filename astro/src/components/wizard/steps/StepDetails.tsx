import { useState } from 'react';
import { Plus, Trash2, ChevronDown } from 'lucide-react';
import type { BucketConfig, FieldSchema } from '../service-config';

type Props = {
  bucket: BucketConfig;
  serviceKeys: string[];
  details: Record<string, any>;
  onChange: (details: Record<string, any>) => void;
};

type FieldProps = {
  field: FieldSchema;
  value: any;
  onChange: (val: any) => void;
  errors: Record<string, string>;
  setErrors: (e: Record<string, string>) => void;
  allValues: Record<string, any>;
};

function FieldRenderer({ field, value, onChange, errors, setErrors, allValues }: FieldProps) {
  if (field.showIf) {
    const condVal = allValues[field.showIf.key];
    const expected = field.showIf.equals;
    if (typeof expected === 'boolean') {
      if (expected !== Boolean(condVal)) return null;
    } else if (condVal !== expected) {
      return null;
    }
  }

  const err = errors[field.key];
  const handleBlur = () => {
    if (field.required && !value && value !== false) {
      setErrors({ ...errors, [field.key]: `${field.label} is required` });
    } else {
      const next = { ...errors };
      delete next[field.key];
      setErrors(next);
    }
  };

  if (field.type === 'checkbox') {
    return (
      <div className="wizard-field">
        <label className="wizard-checkbox-row">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{field.label}</span>
        </label>
        {field.helpText && <div className="wizard-help">{field.helpText}</div>}
      </div>
    );
  }

  if (field.type === 'radio') {
    return (
      <div className="wizard-field">
        <div className="wizard-label">{field.label}{field.required && <span className="req">*</span>}</div>
        <div className="wizard-radio-group inline">
          {field.options?.map((opt) => (
            <label key={opt.value} className="wizard-radio-row">
              <input
                type="radio"
                name={field.key}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
        {field.helpText && <div className="wizard-help">{field.helpText}</div>}
        {err && <div className="wizard-error-msg">{err}</div>}
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div className="wizard-field">
        <label className="wizard-label">{field.label}{field.required && <span className="req">*</span>}</label>
        <select
          className={`wizard-select${err ? ' error' : ''}`}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
        >
          <option value="">— Select —</option>
          {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {field.helpText && <div className="wizard-help">{field.helpText}</div>}
        {err && <div className="wizard-error-msg">{err}</div>}
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div className="wizard-field">
        <label className="wizard-label">{field.label}{field.required && <span className="req">*</span>}</label>
        <textarea
          className={`wizard-textarea${err ? ' error' : ''}`}
          value={value ?? ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
        />
        {field.helpText && <div className="wizard-help">{field.helpText}</div>}
        {err && <div className="wizard-error-msg">{err}</div>}
      </div>
    );
  }

  if (field.type === 'file') {
    return (
      <div className="wizard-field">
        <label className="wizard-label">{field.label}</label>
        <div className="wizard-input wizard-file">
          <input
            type="file"
            accept={field.accept}
            onChange={(e) => onChange(e.target.files?.[0]?.name ?? '')}
          />
        </div>
        {field.helpText && <div className="wizard-help">{field.helpText}</div>}
      </div>
    );
  }

  if (field.type === 'repeater') {
    const rows: Record<string, string>[] = Array.isArray(value) && value.length > 0 ? value : [{}];
    return (
      <div className="wizard-field">
        <div className="wizard-label">{field.label}{field.required && <span className="req">*</span>}</div>
        {field.helpText && <div className="wizard-help">{field.helpText}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
          {rows.map((row, idx) => (
            <div key={idx} className="repeater-item">
              <div className="repeater-item-header">
                <span className="repeater-item-label">#{idx + 1}</span>
                {rows.length > 1 && (
                  <button
                    type="button"
                    className="repeater-remove"
                    onClick={() => {
                      const next = rows.filter((_, i) => i !== idx);
                      onChange(next);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {field.itemFields?.map((subField) => (
                <div key={subField.key} className="wizard-field">
                  <label className="wizard-label">{subField.label}</label>
                  {subField.type === 'textarea' ? (
                    <textarea
                      className="wizard-textarea"
                      value={row[subField.key] ?? ''}
                      onChange={(e) => {
                        const next = [...rows];
                        next[idx] = { ...row, [subField.key]: e.target.value };
                        onChange(next);
                      }}
                    />
                  ) : (
                    <input
                      type={subField.type}
                      className="wizard-input"
                      value={row[subField.key] ?? ''}
                      onChange={(e) => {
                        const next = [...rows];
                        next[idx] = { ...row, [subField.key]: e.target.value };
                        onChange(next);
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
          <button
            type="button"
            className="repeater-add"
            onClick={() => onChange([...rows, {}])}
          >
            <Plus size={14} /> Add another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard-field">
      <label className="wizard-label">{field.label}{field.required && <span className="req">*</span>}</label>
      <input
        type={field.type}
        className={`wizard-input${err ? ' error' : ''}`}
        value={value ?? (field.defaultValue !== undefined ? field.defaultValue : '')}
        placeholder={field.placeholder}
        min={field.min}
        max={field.max}
        onChange={(e) => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
        onBlur={handleBlur}
      />
      {field.helpText && <div className="wizard-help">{field.helpText}</div>}
      {err && <div className="wizard-error-msg">{err}</div>}
    </div>
  );
}

function ServiceFields({
  serviceKey,
  bucket,
  values,
  onChange,
}: {
  serviceKey: string;
  bucket: BucketConfig;
  values: Record<string, any>;
  onChange: (v: Record<string, any>) => void;
}) {
  const svc = bucket.services[serviceKey];
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!svc) return null;

  return (
    <div className="wizard-fields-grid">
      {svc.fields.map((field) => (
        <FieldRenderer
          key={field.key}
          field={field}
          value={values[field.key]}
          onChange={(val) => onChange({ ...values, [field.key]: val })}
          errors={errors}
          setErrors={setErrors}
          allValues={values}
        />
      ))}
    </div>
  );
}

export default function StepDetails({ bucket, serviceKeys, details, onChange }: Props) {
  const [openAccordion, setOpenAccordion] = useState<string>(serviceKeys[0] ?? '');
  const isMulti = serviceKeys.length > 1;

  const handleChange = (serviceKey: string, vals: Record<string, any>) => {
    onChange({ ...details, [serviceKey]: vals });
  };

  if (!isMulti) {
    const key = serviceKeys[0];
    return (
      <div className="wizard-step-enter">
        <div className="wizard-step-title">Service Details</div>
        <div className="wizard-step-sub">Please fill in the details for your request.</div>
        <ServiceFields
          serviceKey={key}
          bucket={bucket}
          values={details[key] ?? {}}
          onChange={(vals) => handleChange(key, vals)}
        />
      </div>
    );
  }

  return (
    <div className="wizard-step-enter">
      <div className="wizard-step-title">Service Details</div>
      <div className="wizard-step-sub">Fill in details for each selected service. Click a section to expand it.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {serviceKeys.map((key) => {
          const svc = bucket.services[key];
          const isOpen = openAccordion === key;
          return (
            <div key={key} className="accordion-item">
              <button
                className={`accordion-header${isOpen ? ' open' : ''}`}
                onClick={() => setOpenAccordion(isOpen ? '' : key)}
                aria-expanded={isOpen}
              >
                <span className="accordion-title">{svc?.label ?? key}</span>
                <ChevronDown
                  size={16}
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--cream-muted)' }}
                />
              </button>
              {isOpen && (
                <div className="accordion-body">
                  <ServiceFields
                    serviceKey={key}
                    bucket={bucket}
                    values={details[key] ?? {}}
                    onChange={(vals) => handleChange(key, vals)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
