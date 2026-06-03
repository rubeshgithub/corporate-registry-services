import { useState } from 'react';
import { FileSearch, Edit3, Building2, FileText, CalendarCheck, Archive, Search } from 'lucide-react';
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
  const [query, setQuery] = useState('');

  const filtered = query.trim()
    ? buckets.filter((b) => {
        const q = query.toLowerCase();
        return b.label.toLowerCase().includes(q) || b.blurb.toLowerCase().includes(q);
      })
    : buckets;

  return (
    <div className="wizard-step-enter">
      <div className="wizard-step-title">What do you need?</div>
      <div className="wizard-step-sub">Search or pick a category below.</div>

      <div className="bucket-search-wrap">
        <Search size={15} className="bucket-search-icon" />
        <input
          className="bucket-search-input"
          type="text"
          placeholder="Search services — e.g. incorporation, annual return…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {query && (
          <button className="bucket-search-clear" onClick={() => setQuery('')} aria-label="Clear search">✕</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bucket-no-results">No categories match "<strong>{query}</strong>" — try a different keyword.</div>
      ) : (
        <div className="bucket-grid">
          {filtered.map((b) => {
            const Icon = ICONS[b.icon] ?? FileText;
            return (
              <button
                key={b.key}
                className={`bucket-tile${selected === b.key ? ' selected' : ''}`}
                onClick={() => onSelect(b.key)}
                tabIndex={0}
                aria-pressed={selected === b.key}
              >
                <Icon size={22} className="bucket-tile-icon" />
                <div className="bucket-tile-label">{b.label}</div>
                <div className="bucket-tile-blurb">{b.blurb}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
