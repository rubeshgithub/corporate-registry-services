"use client";

import { useRef, useState, useEffect } from "react";
import { AlertCircle } from "lucide-react";

/**
 * Tells a customer WHY the pay button is grey (owner, Oct 2026: people ticked the terms box and kept clicking the
 * grey button, not seeing the unanswered registry-key question above it).
 *
 * Wrap the pay button: <PayGate blocked={!canPay || !agreed}> <button disabled=…/> </PayGate>.
 * A disabled button swallows clicks, so while blocked a transparent layer sits over it. Clicking it:
 *   - finds the questions still open in this form — any element marked data-pending="true" (RegistryAccessField,
 *     TermsAgreement), each naming itself in data-pending-label;
 *   - sends each one a "crs:attention" event, so it shows a red border;
 *   - scrolls the first one into view; and
 *   - lists what is left under the button ("Before you pay: …"), with a general line when the open item is
 *     an ordinary field (contact details, the company) that marks nothing.
 */
export const ATTENTION_EVENT = "crs:attention";

type Pending = { el: HTMLElement; label: string };

function findPending(from: HTMLElement | null): Pending[] {
  /* The nearest ancestor that holds any marked question — the order form this button belongs to. */
  let scope: HTMLElement | null = from?.parentElement ?? null;
  while (scope && !scope.querySelector('[data-pending]')) scope = scope.parentElement;
  if (!scope) return [];
  return Array.from(scope.querySelectorAll<HTMLElement>('[data-pending="true"]'))
    .map((el) => ({ el, label: el.dataset.pendingLabel ?? "" }));
}

export default function PayGate({ blocked, children }: { blocked: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<string[] | null>(null);

  /* Once everything is answered, the list goes away by itself. */
  useEffect(() => { if (!blocked) setShown(null); }, [blocked]);

  const nudge = () => {
    const open = findPending(ref.current);
    for (const p of open) p.el.dispatchEvent(new CustomEvent(ATTENTION_EVENT));
    const first = open[0]?.el;
    if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
    const labels = open.map((p) => p.label).filter(Boolean);
    setShown(labels.length ? labels : ["Fill in the details above (the company and your name, email and phone)."]);
  };

  return (
    <div ref={ref}>
      <div style={{ position: "relative" }}>
        {children}
        {blocked && (
          <button
            type="button"
            aria-label="Show what is still needed before paying"
            onClick={nudge}
            style={{ position: "absolute", inset: 0, background: "transparent", border: "none", cursor: "not-allowed", padding: 0 }}
          />
        )}
      </div>
      {blocked && shown && shown.length > 0 && (
        <div role="alert" style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", padding: "0.6rem 0.8rem", borderRadius: "0.5rem", background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: "0.82rem", lineHeight: 1.5 }}>
          <AlertCircle size={16} style={{ flexShrink: 0, marginTop: "0.15rem" }} />
          <div>
            <b>Before you pay:</b>
            <ul style={{ margin: "0.2rem 0 0", paddingLeft: "1.1rem" }}>
              {shown.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

/** For a question that must be answered: listens for the gate's nudge and says whether to show the red border. */
export function useAttention(pending: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [attention, setAttention] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => setAttention(true);
    el.addEventListener(ATTENTION_EVENT, on);
    return () => el.removeEventListener(ATTENTION_EVENT, on);
  }, []);
  useEffect(() => { if (!pending) setAttention(false); }, [pending]);
  return { ref, attention: attention && pending };
}
