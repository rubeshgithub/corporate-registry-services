"use client";

import { MessageCircle } from "lucide-react";

/**
 * "Chat with us" button.
 *
 * Uses Crisp's client-side action queue to open the widget:
 *   window.$crisp.push(["do", "chat:open"])
 *
 * If Crisp hasn't loaded yet (script blocked, offline, no website id),
 * falls back to a mailto: link so the button is never dead.
 */

const SUPPORT_EMAIL = "support@corporateregistryservices.ca";

declare global {
  interface Window {
    $crisp?: Array<unknown[]>;
  }
}

export default function ChatWithUsButton({
  label   = "Chat with us",
  variant = "primary",
}: {
  label?:   string;
  variant?: "primary" | "ghost";
}) {
  const onClick = () => {
    if (typeof window !== "undefined" && Array.isArray(window.$crisp)) {
      window.$crisp.push(["do", "chat:open"]);
      return;
    }
    // Fallback: chat script hasn't loaded — email instead.
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
