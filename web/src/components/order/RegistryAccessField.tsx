"use client";

import { useState } from "react";
import { KeyRound, Check, Info } from "lucide-react";
import YesNo from "@/components/order/YesNo";
import {
  registryAccessFor,
  needsRegistryAccess,
  type RegistryAccessState,
} from "@/lib/registry-access";

/**
 * Registry credential capture for filing services.
 *
 * The whole design turns on one judgement: the credential requirement is a
 * selling point, not friction. Someone who has lost their Company Key cannot
 * file it themselves — that is exactly the customer who should be paying us.
 * So the copy leads with "we handle it" rather than "you need this first".
 *
 * Consequences of that framing, all deliberate:
 *  - Never blocks payment. The order goes through whichever option is picked,
 *    including "I don't have it".
 *  - Until they answer, the order is treated as "we'll get it for you". The
 *    default assumption is that we do the work, so a customer without the
 *    code feels served rather than turned away.
 *  - The province's own vocabulary throughout. Ontario says Company Key, BC
 *    says access code or company password, Manitoba says barcode. Using a
 *    generic "password" reads as not knowing their registry.
 *  - A third option for "I can't reach the registered address either",
 *    because every registry mails the replacement to the corporation's own
 *    address. Surfacing it here beats discovering it three emails later.
 *  - One plain question (owner, Oct 2026): "Do you have the company
 *    password?" Yes → the field to enter it. No → "we'll retrieve it from the
 *    BC Registry", with a quiet note that having it makes the filing faster.
 *    Unanswered counts as No ("retrieve"), so it never blocks checkout. The
 *    "can't reach the registered email or address" case is a small checkbox
 *    under No.
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
  /* Null until they answer; a code already typed (back navigation) means Yes. */
  const [answer, setAnswer] = useState<boolean | null>(
    value.status === "have" || !!value.code ? true : value.status === "no-access" ? false : null,
  );
  if (!needsRegistryAccess(service, provinceKey)) return null;
  const access = registryAccessFor(provinceKey);
  if (!access) return null;

  const set = (patch: Partial<RegistryAccessState>) => onChange({ ...value, ...patch });
  const choose = (yes: boolean) => {
    setAnswer(yes);
    set(yes ? { status: "have" } : { status: "retrieve", code: "" });
  };
  const muted: React.CSSProperties = { fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.55 };

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        padding: "1.1rem 1.35rem",
        marginBottom: "1.25rem",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.55rem", alignItems: "center" }}>
          <KeyRound size={17} style={{ color: "var(--gold)", flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)" }}>{access.question}</span>
        </div>
        <YesNo value={answer} onChange={choose} name={access.question} />
      </div>

      {answer === true && (
        <div style={{ marginTop: "0.85rem" }}>
          <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 500, color: "var(--text-muted)", marginBottom: "0.2rem" }}>
            {access.fieldLabel}
          </label>
          <input
            value={value.code}
            onChange={(e) => set({ status: "have", code: e.target.value })}
            placeholder={access.placeholder}
            autoComplete="off"
            style={{
              width: "100%", maxWidth: 320, padding: "0.5rem 0.7rem",
              border: "1px solid var(--border)", borderRadius: "0.4rem", fontSize: "0.9rem",
              background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-mono), monospace",
            }}
          />
          <p style={{ ...muted, margin: "0.35rem 0 0" }}>
            Sent to us encrypted. Not handy right now? Leave it blank and reply to your order email with it.
          </p>
        </div>
      )}

      {answer === false && (
        <div style={{ marginTop: "0.85rem" }}>
          <p style={{ fontSize: "0.85rem", color: "var(--text)", margin: 0, lineHeight: 1.55, display: "flex", gap: "0.45rem" }}>
            <Check size={15} style={{ color: "var(--secondary)", flexShrink: 0, marginTop: "0.2rem" }} />
            <span>No problem — we&rsquo;ll retrieve it from {access.registryName} for you as part of your order.</span>
          </p>
          <p style={{ ...muted, margin: "0.35rem 0 0 1.4rem" }}>
            Having the {access.term} on hand does make the filing faster{access.turnaround ? ` (retrieval is ${access.turnaround})` : ""} — if you find it later, just reply to your order email with it.
          </p>
          <label style={{ ...muted, display: "flex", gap: "0.45rem", alignItems: "flex-start", margin: "0.6rem 0 0 1.4rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={value.status === "no-access"}
              onChange={(e) => set({ status: e.target.checked ? "no-access" : "retrieve", code: "" })}
              style={{ marginTop: "0.2rem" }}
            />
            <span>I can&rsquo;t access the company&rsquo;s registered email or mailing address either</span>
          </label>
          {value.status === "no-access" && (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", margin: "0.6rem 0 0 1.4rem", padding: "0.6rem 0.8rem", borderRadius: "0.5rem", background: "var(--bg-deep)" }}>
              <Info size={14} style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: "0.1rem" }} />
              <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                Registries only send a replacement to the corporation&rsquo;s own registered email or mailing
                address. If neither reaches you, updating the registered address comes first — we&rsquo;ll walk
                you through it. Your order still goes through now.
              </span>
            </div>
          )}
        </div>
      )}

      {answer === null && (
        <p style={{ ...muted, margin: "0.5rem 0 0" }}>
          Either way you can order now — if you don&rsquo;t have it, we&rsquo;ll get it from {access.registryName}.
        </p>
      )}
    </div>
  );
}

