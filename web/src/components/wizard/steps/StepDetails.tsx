"use client";

import type { ServiceBucket, ServiceItem, DetailField } from "@/lib/service-config";

type Props = {
  bucket: ServiceBucket;
  serviceKeys: string[];
  details: Record<string, string>;
  onChange: (key: string, value: string) => void;
};

export default function StepDetails({ bucket, serviceKeys, details, onChange }: Props) {
  const selectedServices = bucket.services.filter((s) => serviceKeys.includes(s.key));
  const servicesWithFields = selectedServices.filter(
    (s) => s.detailFields && s.detailFields.length > 0
  );

  if (servicesWithFields.length === 0) return null;

  return (
    <div className="step-enter">
      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Step 4 of 5 — Details
      </p>
      <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.25rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.25rem" }}>
        A few more details
      </h2>
      <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
        Help us prepare your order accurately.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {servicesWithFields.map((svc) => (
          <ServiceFieldGroup
            key={svc.key}
            service={svc}
            details={details}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}

function ServiceFieldGroup({
  service,
  details,
  onChange,
}: {
  service: ServiceItem;
  details: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--gold)", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>
        {service.label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        {service.detailFields!.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            value={details[field.key] ?? ""}
            onChange={(v) => onChange(field.key, v)}
          />
        ))}
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: DetailField;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="field-label">
        {field.label}
        {field.required && <span style={{ color: "var(--gold)", marginLeft: "0.2rem" }}>*</span>}
      </label>
      {field.type === "textarea" ? (
        <textarea
          className="field-input"
          rows={3}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ resize: "vertical", minHeight: "4.5rem" }}
        />
      ) : field.type === "select" ? (
        <select
          className="field-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select…</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === "date" ? "date" : "text"}
          className="field-input"
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
