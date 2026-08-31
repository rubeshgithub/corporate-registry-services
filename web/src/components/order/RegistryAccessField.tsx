"use client";

import { KeyRound, Check, Info } from "lucide-react";
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
 *  - "We'll get it for you" is pre-selected. The default assumption is that
 *    we do the work, so a customer without the code feels served rather than
 *    turned away.
 *  - The province's own vocabulary throughout. Ontario says Company Key, BC
 *    says access code or company password, Manitoba says barcode. Using a
 *    generic "password" reads as not knowing their registry.
 *  - A third option for "I can't reach the registered address either",
 *    because every registry mails the replacement to the corporation's own
 *    address. Surfacing it here beats discovering it three emails later.
 */

export default function RegistryAccessField({
  service,
  provinceKey,
  jurisdictionLabel,
  value,
  onChange,
}: {
  service:            string;
  provinceKey:        string | undefined | null;
  jurisdictionLabel?: string;
  value:              RegistryAccessState;
  onChange:           (next: RegistryAccessState) => void;
}) {
  if (!needsRegistryAccess(service, provinceKey)) return null;
  const access = registryAccessFor(provinceKey);
  if (!access) return null;

  const where = jurisdictionLabel || "your province";
  const set = (patch: Partial<RegistryAccessState>) => onChange({ ...value, ...patch });

  const optionStyle = (active: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: "0.55rem",
    padding: "0.65rem 0.8rem",
    border: `1px solid ${active ? "var(--gold)" : "var(--border)"}`,
    background: active ? "var(--gold-dim)" : "var(--bg)",
    borderRadius: "0.5rem",
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
  });

  return (
    <div
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        padding: "1.25rem 1.5rem",
        marginBottom: "1.25rem",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", marginBottom: "0.5rem" }}>
        <KeyRound size={17} style={{ color: "var(--gold)", flexShrink: 0, marginTop: "0.15rem" }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)" }}>
            {where} needs your {access.term}
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", margin: "0.25rem 0 0", lineHeight: 1.55 }}>
            {access.whatItIs}
          </p>
        </div>
      </div>

      <p style={{ fontSize: "0.82rem", color: "var(--text)", margin: "0.6rem 0 0.75rem", lineHeight: 1.55 }}>
        <strong>Don&rsquo;t have it? That&rsquo;s fine — order anyway.</strong> Retrieving it is part of
        the service, at no extra charge.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
        <button type="button" onClick={() => set({ status: "retrieve" })} style={optionStyle(value.status === "retrieve")}>
          <Radio on={value.status === "retrieve"} />
          <span>
            <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
              Get it for me
            </span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.45 }}>
              {access.ifMissing}{access.turnaround ? ` Typically ${access.turnaround}.` : ""}
            </span>
          </span>
        </button>

        <button type="button" onClick={() => set({ status: "have" })} style={optionStyle(value.status === "have")}>
          <Radio on={value.status === "have"} />
          <span>
            <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
              I have it — file faster
            </span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.45 }}>
              Enter it below and we can file without waiting on the registry.
            </span>
          </span>
        </button>

        {value.status === "have" && (
          <div style={{ paddingLeft: "1.9rem" }}>
            <label style={{ display: "block", fontSize: "0.72rem", fontWeight: 500, color: "var(--text-muted)", marginBottom: "0.2rem" }}>
              {access.fieldLabel} <span style={{ color: "var(--text-muted)" }}>(optional — you can send it later)</span>
            </label>
            <input
              value={value.code}
              onChange={(e) => set({ code: e.target.value })}
              placeholder={access.placeholder}
              style={{
                width: "100%",
                maxWidth: 320,
                padding: "0.5rem 0.7rem",
                border: "1px solid var(--border)",
                borderRadius: "0.4rem",
                fontSize: "0.9rem",
                background: "var(--bg)",
                color: "var(--text)",
                fontFamily: "var(--font-mono), monospace",
              }}
            />
          </div>
        )}

        <button type="button" onClick={() => set({ status: "no-access" })} style={optionStyle(value.status === "no-access")}>
          <Radio on={value.status === "no-access"} />
          <span>
            <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
              I can&rsquo;t access the registered email or address either
            </span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.45 }}>
              We&rsquo;ll sort the address out first, then the {access.term}. Still order — we&rsquo;ll
              walk you through it.
            </span>
          </span>
        </button>
      </div>

      {value.status === "no-access" && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginTop: "0.7rem", padding: "0.6rem 0.8rem", borderRadius: "0.5rem", background: "var(--bg-deep)" }}>
          <Info size={14} style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: "0.1rem" }} />
          <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
            Registries only ever send a replacement to the corporation&rsquo;s own registered email or
            mailing address — never to an agent. If neither reaches you, updating the registered
            address is the first step, and we&rsquo;ll quote that with your order.
          </span>
        </div>
      )}

      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.7rem" }}>
        Whichever you pick, your order goes through now — this never holds up checkout.
      </div>
    </div>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <span
      style={{
        width: 16, height: 16, borderRadius: "50%",
        border: `1.5px solid ${on ? "var(--gold)" : "var(--border)"}`,
        background: on ? "var(--gold)" : "transparent",
        flexShrink: 0, marginTop: "0.12rem",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {on && <Check size={10} style={{ color: "#fff" }} />}
    </span>
  );
}
