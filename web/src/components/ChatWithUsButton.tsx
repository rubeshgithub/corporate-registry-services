"use client";

import { MessageCircle } from "lucide-react";
import { openCrispChat } from "@/lib/crisp";

/**
 * "Chat with us" button.
 *
 * Opens the Crisp widget via lib/crisp's openCrispChat(). If Crisp is
 * genuinely unreachable (script blocked, offline, no website id), falls back
 * to a mailto: link so the button is never dead.
 *
 * This used to gate on Array.isArray(window.$crisp), which meant it opened
 * the chat only if clicked before Crisp finished loading and fell through to
 * mailto: forever after — see lib/crisp.ts.
 */

const SUPPORT_EMAIL = "support@corporateregistryservices.ca";

export default function ChatWithUsButton({
  label   = "Chat with us",
  variant = "primary",
}: {
  label?:   string;
  variant?: "primary" | "ghost";
}) {
  const onClick = () => {
    if (openCrispChat()) return;
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
