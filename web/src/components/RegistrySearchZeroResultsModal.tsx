"use client";

import { useEffect } from "react";
import { X, SearchX } from "lucide-react";
import RegistrySearchZeroResultsHelp from "./RegistrySearchZeroResultsHelp";

/**
 * Gentle popup shown the first time a registry search returns zero results
 * for a given (query, province). Overlay pattern copied from WizardModal —
 * dismissible via the X, Escape, or clicking the backdrop; never blocks the
 * rest of the page. CompanySearch tracks which (query, province) it has
 * already been dismissed for, so it doesn't reopen on every debounced
 * re-search of the same failed query.
 */

export default function RegistrySearchZeroResultsModal({
  query,
  province,
  onClose,
}: {
  query:    string;
  province: string;
  onClose:  () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,30,45,0.55)",
        backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        style={{
          position: "relative", width: "100%", maxWidth: "440px",
          background: "var(--card)", borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-card)", border: "1px solid var(--border)",
          padding: "1.5rem",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: "0.75rem", right: "0.75rem",
            background: "transparent", border: "none",
            width: "1.75rem", height: "1.75rem", borderRadius: "50%",
            cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", color: "var(--text-muted)",
          }}
        >
          <X size={16} />
        </button>

        <div style={{ display: "flex", gap: "0.65rem", alignItems: "flex-start", marginBottom: "0.75rem" }}>
          <span
            style={{
              width: "2.25rem", height: "2.25rem", borderRadius: "0.55rem",
              background: "var(--gold-dim)", display: "inline-flex",
              alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            <SearchX size={16} style={{ color: "var(--gold)" }} />
          </span>
          <div>
            <div style={{ fontSize: "0.68rem", fontFamily: "var(--font-mono), monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--gold)", marginBottom: "0.2rem" }}>
              No results
            </div>
            <div className="card-heading" style={{ fontSize: "1.05rem" }}>
              Can&rsquo;t find &ldquo;{query}&rdquo;?
            </div>
          </div>
        </div>

        <RegistrySearchZeroResultsHelp query={query} province={province} />
      </div>
    </div>
  );
}
