"use client";

import { useEffect, useState } from "react";
import { SearchX, ArrowRight } from "lucide-react";
import RegistrySearchZeroResultsModal from "./RegistrySearchZeroResultsModal";

/**
 * Zero results → ask for an email and what they know, in a POPUP (owner, Oct
 * 2026: the inline email box was easy to scroll past, so searches like a
 * charity's "822347258RR0001" ended with nothing). Renders a one-line inline
 * prompt with a button that opens RegistrySearchZeroResultsModal, and opens
 * the popup by itself:
 *   - `autoOpenAfterMs` 0 → straight away (widgets that only show this after
 *     an explicit Find), or after that many ms with the query unchanged
 *     (islands that search on every keystroke — never mid-typing);
 *   - once per query, and not at all once the visitor has closed one this
 *     session (sessionStorage), so it never nags.
 */

const DISMISSED_KEY = "crs_zero_popup_dismissed";

function dismissedThisSession(): boolean {
  try { return sessionStorage.getItem(DISMISSED_KEY) === "1"; } catch { return false; }
}

export default function ZeroResultsPrompt({
  query, province, autoOpenAfterMs = 0, lead,
}: {
  query:            string;
  province:         string;
  autoOpenAfterMs?: number;
  /** Optional sentence above the button (e.g. "That registry isn't searchable online."). */
  lead?:            React.ReactNode;
}) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [autoDoneFor, setAutoDoneFor] = useState<string | null>(null);

  useEffect(() => {
    if (autoDoneFor === query || dismissedThisSession()) return;
    const t = setTimeout(() => { setOpenFor(query); setAutoDoneFor(query); }, Math.max(0, autoOpenAfterMs));
    return () => clearTimeout(t);
  }, [query, autoOpenAfterMs, autoDoneFor]);

  const close = () => {
    setOpenFor(null);
    try { sessionStorage.setItem(DISMISSED_KEY, "1"); } catch { /* private mode */ }
  };

  return (
    <>
      <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
        <SearchX size={16} style={{ color: "var(--gold)", flexShrink: 0 }} />
        <span style={{ flex: "1 1 220px", fontSize: "0.86rem", color: "var(--text)", lineHeight: 1.5 }}>
          {lead ?? <>Can&rsquo;t find it? We&rsquo;ll look it up by hand and email you what we find.</>}
        </span>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setOpenFor(query)}
          style={{ height: "2.4rem", fontSize: "0.84rem", padding: "0 0.95rem", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
        >
          Ask us to find it <ArrowRight size={13} />
        </button>
      </div>
      {openFor === query && <RegistrySearchZeroResultsModal query={query} province={province} onClose={close} />}
    </>
  );
}
