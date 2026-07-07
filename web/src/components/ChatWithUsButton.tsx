"use client";

import { MessageCircle } from "lucide-react";

/**
 * "Chat with us" button.
 *
 * Behaviour:
 *   1. If NEXT_PUBLIC_TAWK_TO_PROPERTY_ID is set (the Tawk.to loader in
 *      RootLayout activates), calling window.Tawk_API.maximize() opens
 *      the widget.
 *   2. If the loader hasn't run yet (env var missing), we fall back to
 *      a mailto: link so the button is never dead.
 *
 * That lets you build the FAQ page today, decide on a chat vendor
 * next week, and flip the env var without touching this component.
 */

const SUPPORT_EMAIL = "support@corporateregistryservices.ca";

type TawkAPI = { maximize?: () => void };
declare global {
  interface Window { Tawk_API?: TawkAPI }
}

export default function ChatWithUsButton({
  label = "Chat with us",
  variant = "primary",
}: {
  label?:   string;
  variant?: "primary" | "ghost";
}) {
  const onClick = () => {
    if (typeof window !== "undefined" && window.Tawk_API?.maximize) {
      window.Tawk_API.maximize();
      return;
    }
    // Fallback: no chat provider configured yet — email us.
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=Question%20from%20CRS%20FAQ`;
  };

  const style: React.CSSProperties = variant === "primary"
    ? {
        display:      "inline-flex",
        alignItems:   "center",
        gap:          "0.4rem",
        padding:      "0.65rem 1.15rem",
        background:   "var(--primary)",
        color:        "#FFFFFF",
        fontWeight:   700,
        fontSize:     "0.88rem",
        border:       "none",
        borderRadius: "0.5rem",
        cursor:       "pointer",
      }
    : {
        display:      "inline-flex",
        alignItems:   "center",
        gap:          "0.4rem",
        padding:      "0.5rem 1rem",
        background:   "transparent",
        color:        "var(--text)",
        fontWeight:   600,
        fontSize:     "0.85rem",
        border:       "1px solid var(--border)",
        borderRadius: "0.5rem",
        cursor:       "pointer",
      };

  return (
    <button type="button" onClick={onClick} style={style}>
      <MessageCircle size={15} />
      {label}
    </button>
  );
}
