import type { BucketConfig } from '../service-config';
import { JURISDICTIONS } from '../service-config';

type Props = {
  bucket: BucketConfig;
  selectedKeys: string[];
  jurisdictionKey: string | null;
  onSelect: (key: string) => void;
};

export default function StepJurisdiction({ bucket, selectedKeys, jurisdictionKey, onSelect }: Props) {
  const serviceLabels = selectedKeys
    .map((k) => bucket.services[k]?.label)
    .filter(Boolean)
    .join(', ');

  return (
    <div className="wizard-step-enter">
      <div className="wizard-step-title">Which jurisdiction?</div>
      <div className="wizard-step-sub">
        Select the province or territory where the corporation is registered.
        {serviceLabels && <> For: <strong style={{ color: 'var(--cream)' }}>{serviceLabels}</strong></>}
      </div>
      <select
        className="jurisdiction-select"
        value={jurisdictionKey ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        aria-label="Select jurisdiction"
      >
        <option value="" disabled>— Select a jurisdiction —</option>
        {JURISDICTIONS.filter((j) => j.pinned).map((j) => (
          <option key={j.key} value={j.key}>{j.label}</option>
        ))}
        <option disabled>──────────────────</option>
        {JURISDICTIONS.filter((j) => !j.pinned).map((j) => (
          <option key={j.key} value={j.key}>{j.label}</option>
        ))}
      </select>
    </div>
  );
}
