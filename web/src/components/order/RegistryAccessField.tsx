"use client";

import { useEffect, useRef } from "react";
import { trackClick } from "@/lib/track-click";
import { KeyRound, Check, Lock } from "lucide-react";
import { registryAccessFor, needsRegistryAccess, type RegistryAccessState } from "@/lib/registry-access";

/**
 * Registry credential for filing services — OPTIONAL (owner, Nov 6 2026).
 *
 * Think of the person eager to pay: a question they can't answer right now, sitting between them and the Pay
 * button, is how a sale is lost (a BC visitor answered the key question, never filled in the contact details
 * below it, clicked the grey button twice and left). So:
 *  - One optional field in the province's own words ("Access code or company password", "Company Key"…), with
 *    "Optional" said out loud. Typed → status "have" (sent encrypted). Left blank → status "", which the order
 *    carries as "NOT ANSWERED — left blank" so staff contact them (docu10 matches that prefix).
 *  - The reassurance does the work the old Yes/No did: having it makes filing quicker; without it, pay now and
 *    we contact them by email or phone to get it, or retrieve a new one from the registry for them.
 *  - It never blocks paying and never prompts at the Pay button (no data-soft-pending any more, so PayGate's
 *    registry-key dialog stays dormant).
 *  - docu10's Order-page visitors report still sees "have-entered" when a code is typed (never the code).
 */

export default function RegistryAccessField({
  service,
  provinceKey,
  value,
  onChange,
}: {
  service:            string;
  provinceKey:        string | undefined | null;
  jurisdictionLabel?: string;
  value:              RegistryAccessState;
  onChange:           (next: RegistryAccessState) => void;
}) {
  const needed = needsRegistryAccess(service, provinceKey);
  const hasCode = (value.code ?? "").trim().length > 0;

  /* One event when a code is first typed, for the visitors report. */
  const sent = useRef(false);
  useEffect(() => {
    if (!needed || !hasCode || sent.current) return;
    sent.current = true;
    trackClick("registry-access", `have-entered|${provinceKey ?? ""}|${service}`);
  }, [hasCode, needed, provinceKey, service]);

  if (!needed) return null;
  const access = registryAccessFor(provinceKey);
  if (!access) return null;

  const muted: React.CSSProperties = { fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.55 };

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        padding: "1rem 1.25rem",
        marginBottom: "1.25rem",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <label htmlFor={`registry-code-${service}`} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <KeyRound size={16} style={{ color: "var(--gold)", flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: "0.92rem", color: "var(--text)" }}>{access.fieldLabel}</span>
        <span style={{ fontSize: "0.68rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)", background: "var(--bg-deep)", borderRadius: "999px", padding: "0.12rem 0.5rem" }}>
          Optional
        </span>
      </label>

      <input
        id={`registry-code-${service}`}
        value={value.code ?? ""}
        onChange={(e) => onChange({ status: e.target.value.trim() ? "have" : "", code: e.target.value })}
        placeholder={access.placeholder}
        autoComplete="off"
        data-optional="true"
        style={{
          width: "100%", maxWidth: 340, padding: "0.55rem 0.75rem",
          border: "1px solid var(--border)", borderRadius: "0.4rem", fontSize: "0.9rem",
          background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-mono), monospace",
        }}
      />
      {hasCode ? (
        <p style={{ ...muted, margin: "0.35rem 0 0", display: "flex", gap: "0.35rem", alignItems: "center" }}>
          <Lock size={12} /> Sent to us encrypted — only our filing team can see it.
        </p>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginTop: "0.7rem", padding: "0.6rem 0.8rem", borderRadius: "0.5rem", background: "rgba(42,125,79,0.07)" }}>
        <Check size={15} style={{ color: "#2A7D4F", flexShrink: 0, marginTop: "0.15rem" }} />
        <span style={{ fontSize: "0.82rem", color: "var(--text)", lineHeight: 1.55 }}>
          {hasCode ? (
            <>Thanks — having it makes the filing quicker.</>
          ) : (
            <>
              <b>Have it handy?</b> Enter it and we can file faster. <b>Don&rsquo;t have it?</b>{" "}No problem — go ahead and
              pay. After your order we&rsquo;ll contact you by email or phone to get it, or retrieve a new one
              from {access.registryName} for you.
            </>
          )}
        </span>
      </div>

      <details style={{ marginTop: "0.5rem" }}>
        <summary style={{ ...muted, cursor: "pointer" }}>What is the {access.term}?</summary>
        <p style={{ ...muted, margin: "0.35rem 0 0" }}>{access.whatItIs}</p>
      </details>
    </div>
  );
}
