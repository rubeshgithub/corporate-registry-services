import { FileSearch, Edit3, Building2, FileText, CalendarCheck, Archive } from 'lucide-react';
import type { BucketConfig } from '../service-config';

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  FileSearch, Edit3, Building2, FileText, CalendarCheck, Archive,
};

type Props = {
  buckets: BucketConfig[];
  selected: string | null;
  onSelect: (key: string) => void;
};

export default function StepBucket({ buckets, selected, onSelect }: Props) {
  return (
    <div className="wizard-step-enter">
      <div className="wizard-step-title">What do you need?</div>
      <div className="wizard-step-sub">Select the category that best describes your request.</div>
      <div className="bucket-grid">
        {buckets.map((b) => {
          const Icon = ICONS[b.icon] ?? FileText;
          return (
            <button
              key={b.key}
              className={`bucket-tile${selected === b.key ? ' selected' : ''}`}
              onClick={() => onSelect(b.key)}
              tabIndex={0}
              aria-pressed={selected === b.key}
            >
              <Icon size={32} className="bucket-tile-icon" />
              <div className="bucket-tile-label">{b.label}</div>
              <div className="bucket-tile-blurb">{b.blurb}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
