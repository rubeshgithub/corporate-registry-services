import { Check } from 'lucide-react';
import type { BucketConfig } from '../service-config';
import { MODEL_LABELS } from '../service-config';

type Props = {
  bucket: BucketConfig;
  selectedKeys: string[];
  onToggle: (key: string) => void;
};

export default function StepService({ bucket, selectedKeys, onToggle }: Props) {
  const services = Object.entries(bucket.services);

  return (
    <div className="wizard-step-enter">
      <div className="wizard-step-title">Which service?</div>
      <div className="wizard-step-sub">
        {bucket.multiSelect
          ? 'You can select multiple — we\'ll handle them together.'
          : 'Select the specific service you need.'}
      </div>
      <div className="service-list">
        {services.map(([key, svc]) => {
          const isSelected = selectedKeys.includes(key);
          return (
            <button
              key={key}
              className={`service-row${isSelected ? ' selected' : ''}`}
              onClick={() => onToggle(key)}
              aria-pressed={isSelected}
            >
              {bucket.multiSelect ? (
                <div className="service-row-check">
                  {isSelected && <Check size={12} />}
                </div>
              ) : (
                <div className="service-row-radio" />
              )}
              <div className="service-row-info">
                <div className="service-row-label">{svc.label}</div>
                <div className="service-row-meta">
                  <span className={`model-badge ${svc.model}`}>{MODEL_LABELS[svc.model]}</span>
                  <span className="service-row-eta">⚡ {svc.eta}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
