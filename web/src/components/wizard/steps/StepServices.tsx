"use client";

import { Check } from "lucide-react";
import type { ServiceBucket } from "@/lib/service-config";

type Props = {
  bucket: ServiceBucket;
  selected: string[];
  onToggle: (key: string) => void;
};

export default function StepServices({ bucket, selected, onToggle }: Props) {
  return (
    <div className="step-enter">
      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Step 2 of 5
      </p>
      <div style={{ marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.25rem", fontWeight: 700, color: "var(--text)" }}>
          {bucket.label}
        </h2>
        <span className="category-chip">{bucket.label}</span>
      </div>
      <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
        Select the services you need. You can pick multiple.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
        {bucket.services.map((svc) => {
          const isSelected = selected.includes(svc.key);
          return (
            <button
              key={svc.key}
              className={`service-item${isSelected ? " selected" : ""}`}
              onClick={() => onToggle(svc.key)}
            >
              <div
                style={{
                  width: "1.125rem",
                  height: "1.125rem",
                  borderRadius: "0.25rem",
                  border: `1.5px solid ${isSelected ? "var(--gold)" : "var(--border)"}`,
                  background: isSelected ? "var(--gold)" : "transparent",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: "0.1rem",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                {isSelected && <Check size={10} color="#fff" strokeWidth={3} />}
              </div>
              <div>
                <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
                  {svc.label}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.1rem" }}>
                  {svc.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
