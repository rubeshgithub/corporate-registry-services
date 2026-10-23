"use client";

import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, KeyRound } from "lucide-react";
import { trackClick } from "@/lib/track-click";

/**
 * Wraps a pay button. Two jobs (owner, Oct 2026):
 *
 * 1. Say WHY the button is grey. <PayGate blocked={!canPay || !agreed}> — while blocked a transparent layer sits
 *    over the (disabled) button. Clicking it:
 *      - finds what is still REQUIRED in this form — elements marked data-pending="true" (TermsAgreement), each
 *        naming itself in data-pending-label — sends each a "crs:attention" event (red border), scrolls to the first;
 *      - lists what is left under the button ("Before you pay: …"), with a general line when the open item is an
 *        ordinary field (contact details, the company) that marks nothing.
 *
 * 2. The registry-key question does NOT grey the button any more (people missed it and kept clicking a dead
 *    button). RegistryAccessField marks itself data-soft-pending="true" while unanswered. The first click on an
 *    ACTIVE pay button with that open is caught here and a small panel appears instead:
 *      "You haven't given us the <term>. No problem — we'll contact you for it before we file."
 *      [Continue to payment]  ·  Answer it now
 *    Continue re-clicks the real button (once confirmed, later clicks go straight through); the order then
 *    arrives "NOT ANSWERED" and docu10 shows staff to contact the customer. "Answer it now" scrolls to the question.
 */
export const ATTENTION_EVENT = "crs:attention";

type Marked = { el: HTMLElement; label: string; kind: string };

function findMarked(from: HTMLElement | null, selector: string): Marked[] {
  /* The nearest ancestor that holds any marked question — the order form this button belongs to. */
  let scope: HTMLElement | null = from?.parentElement ?? null;
  while (scope && !scope.querySelector("[data-pending], [data-soft-pending]")) scope = scope.parentElement;
  if (!scope) return [];
  return Array.from(scope.querySelectorAll<HTMLElement>(selector))
    .map((el) => ({ el, label: el.dataset.pendingLabel ?? "", kind: el.dataset.pendingKind ?? "" }));
}

export default function PayGate({ blocked, children }: { blocked: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<string[] | null>(null);
  /* The registry-key prompt: the term to name, and the button that was clicked (to click again on Continue). */
  const [soft, setSoft] = useState<{ term: string; track: string; button: HTMLElement; el: HTMLElement } | null>(null);
  const confirmed = useRef(false);
  const firstButton = useRef<HTMLButtonElement>(null);

  /* The dialog: focus its first button, Esc = answer the question. */
  useEffect(() => {
    if (!soft) return;
    firstButton.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); answerNowRef.current(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [soft]);

  /* Once everything is answered, the list goes away by itself. */
  useEffect(() => { if (!blocked) setShown(null); }, [blocked]);

  const nudge = () => {
    const open = findMarked(ref.current, '[data-pending="true"]');
    for (const p of open) p.el.dispatchEvent(new CustomEvent(ATTENTION_EVENT));
    const first = open[0]?.el;
    if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
    const labels = open.map((p) => p.label).filter(Boolean);
    /* For docu10's Order-page visitors report: what stopped them ("terms", or "details"). */
    trackClick("pay-blocked", open.map((p) => p.kind).filter(Boolean).join(",") || "details");
    setShown(labels.length ? labels : ["Fill in the details above (the company and your name, email and phone)."]);
  };

  /* Capture phase: runs before the pay button's own onClick / the form's submit. */
  const onClickCapture = (e: React.MouseEvent) => {
    if (blocked || confirmed.current) return;
    const button = (e.target as HTMLElement).closest<HTMLElement>("button, a, input[type=submit]");
    if (!button || !ref.current?.contains(button)) return;
    const open = findMarked(ref.current, '[data-soft-pending="true"]')[0];
    if (!open) return;
    e.preventDefault();
    e.stopPropagation();
    setSoft({ term: open.el.dataset.softTerm || "registry key", track: open.el.dataset.softTrack ?? "", button, el: open.el });
    trackClick("key-prompt", open.el.dataset.softTrack ?? "");
  };

  const proceed = () => {
    if (!soft) return;
    confirmed.current = true;
    trackClick("registry-access", `skipped|${soft.track}`);
    const b = soft.button;
    setSoft(null);
    b.click();
  };
  const answerNow = () => {
    if (!soft) return;
    const el = soft.el;
    setSoft(null);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    /* After the scroll lands, so the pulse is seen. */
    setTimeout(() => el.dispatchEvent(new CustomEvent(ATTENTION_EVENT)), 350);
  };
  const answerNowRef = useRef(answerNow);
  answerNowRef.current = answerNow;

  return (
    <div ref={ref}>
      <div style={{ position: "relative" }} onClickCapture={onClickCapture}>
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
      {!blocked && soft && typeof document !== "undefined" && createPortal(
        /* A dialog in the middle of the screen (owner, Oct 2026: a note under the pay button went unseen — most
           customers are on a desktop and look at the button, not below it). Esc or the backdrop = "Answer it now". */
        <div
          onClick={answerNow}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(10, 25, 41, 0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="paygate-key-title"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 440, background: "var(--card, #fff)", borderRadius: "var(--radius-card, 14px)", boxShadow: "0 20px 50px rgba(0,0,0,0.25)", padding: "1.5rem 1.5rem 1.25rem", color: "var(--text)" }}
          >
            <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
              <KeyRound size={22} style={{ color: "var(--gold)", flexShrink: 0 }} />
              <h2 id="paygate-key-title" style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
                Do you have the {soft.term}?
              </h2>
            </div>
            <p style={{ margin: "0.75rem 0 0", fontSize: "0.92rem", lineHeight: 1.55, color: "var(--text-muted)" }}>
              {`You haven’t answered the ${soft.term} question. Answering now makes the filing faster — or continue, and we’ll contact you for it before we file.`}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "1.2rem" }}>
              <button
                ref={firstButton}
                type="button"
                onClick={answerNow}
                style={{ background: "var(--primary)", color: "#fff", border: "none", borderRadius: "0.5rem", padding: "0.75rem 1rem", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer" }}
              >
                Answer the question
              </button>
              <button
                type="button"
                onClick={proceed}
                style={{ background: "transparent", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.7rem 1rem", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer" }}
              >
                Skip — contact me before filing, continue to payment
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** For a question the gate can point at: listens for its "crs:attention" event and says whether to show the red border. */
export function useAttention(pending: boolean) {
  /* A callback ref: the field may render nothing at first (no province yet) and appear later, and the listener
     must attach when it does. */
  const [el, ref] = useState<HTMLDivElement | null>(null);
  const [attention, setAttention] = useState(false);
  useEffect(() => {
    if (!el) return;
    const on = () => {
      setAttention(true);
      /* A red pulse around the card, three times, so the eye lands on it. */
      try {
        el.animate(
          [{ boxShadow: "0 0 0 0 rgba(220, 38, 38, 0.55)" }, { boxShadow: "0 0 0 10px rgba(220, 38, 38, 0)" }],
          { duration: 900, iterations: 3, easing: "ease-out" },
        );
      } catch { /* old browser: the red border is enough */ }
    };
    el.addEventListener(ATTENTION_EVENT, on);
    return () => el.removeEventListener(ATTENTION_EVENT, on);
  }, [el]);
  useEffect(() => { if (!pending) setAttention(false); }, [pending]);
  return { ref, attention: attention && pending };
}
