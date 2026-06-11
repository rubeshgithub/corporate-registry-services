"use client";

import type { ServiceBucket } from "@/lib/service-config";
import { JURISDICTIONS } from "@/lib/service-config";

type Props = {
  bucket: ServiceBucket;
  serviceKeys: string[];
  selected: string | null;
  onSelect: (key: string) => void;
};

export default function StepJurisdiction({ bucket, serviceKeys, selected, onSelect }: Props) {
  const selectedServices = bucket.services.filter((s) => serviceKeys.includes(s.key));
  const requiresJurisdiction = selectedServices.some((s) => s.needsJurisdiction);

  if (!requiresJurisdiction) return null;

  return (
    <div className="step-enter">
      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Step 3 of 5
      </p>
      <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.25rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.25rem" }}>
        Which jurisdiction?
      </h2>
      <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
        Select the province, territory, or federal registry.
      </p>

      <div className="juri-grid">
        {JURISDICTIONS.map((j) => (
          <button
            key={j.key}
            className={`juri-tile${selected === j.key ? " selected" : ""}`}
            onClick={() => onSelect(j.key)}
          >
            {j.label}
          </button>
        ))}
      </div>
    </div>
  );
}
