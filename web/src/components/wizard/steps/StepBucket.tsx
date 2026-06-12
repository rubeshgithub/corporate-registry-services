"use client";

import { useState } from "react";
import { Search, FileSearch, Building2, BookOpen, FilePen, ShieldCheck, RefreshCw, FileText } from "lucide-react";
import type { ServiceBucket } from "@/lib/service-config";

const ICONS: Record<string, React.ElementType> = {
  FileSearch,
  Building2,
  BookOpen,
  FilePen,
  ShieldCheck,
  RefreshCw,
};

type Props = {
  buckets: ServiceBucket[];
  selected: string | null;
  onSelect: (key: string) => void;
  companyName?: string;
};

export default function StepBucket({ buckets, selected, onSelect, companyName }: Props) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? buckets.filter(
        (b) =>
          b.label.toLowerCase().includes(query.toLowerCase()) ||
          b.blurb.toLowerCase().includes(query.toLowerCase())
      )
    : buckets;

  return (
    <div className="step-enter">
      <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.75rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        Step 1 of 5
      </p>
      <h2 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.25rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.25rem" }}>
        {companyName ? `What do you need from ${companyName}?` : "What do you need?"}
      </h2>
      <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", marginBottom: "0.875rem" }}>
        Search or pick a category below.
      </p>

      {/* Search bar */}
      <div style={{ position: "relative", marginBottom: "0.875rem" }}>
        <Search size={14} style={{ position: "absolute", left: "0.625rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
        <input
          type="text"
          placeholder="Search services…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="field-input"
          style={{ paddingLeft: "2rem", paddingRight: query ? "2rem" : undefined }}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            style={{ position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "0.75rem", padding: "0.125rem" }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Bucket grid */}
      {filtered.length === 0 ? (
        <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
          No categories match &ldquo;{query}&rdquo;
        </div>
      ) : (
        <div className="bucket-grid">
          {filtered.map((b) => {
            const Icon = ICONS[b.icon] ?? FileText;
            return (
              <button
                key={b.key}
                className={`bucket-tile${selected === b.key ? " selected" : ""}`}
                onClick={() => onSelect(b.key)}
              >
                <Icon size={20} style={{ color: "var(--gold)", marginBottom: "0.125rem", flexShrink: 0 }} />
                <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text)", lineHeight: 1.3 }}>
                  {b.label}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                  {b.blurb}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
