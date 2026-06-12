"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import WizardIsland from "./wizard/WizardIsland";

type PreloadData = { companyName?: string; jurisdictionKey?: string };

export default function WizardModal({ onClose, preload }: { onClose: () => void; preload?: PreloadData }) {
  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,30,45,0.6)",
        backdropFilter: "blur(3px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div style={{ position: "relative", width: "100%", maxWidth: "480px" }}>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute", top: "-0.875rem", right: "-0.875rem", zIndex: 1,
            background: "var(--primary)", border: "2px solid rgba(255,255,255,0.2)",
            borderRadius: "50%", width: "2rem", height: "2rem",
            cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", color: "#fff",
          }}
        >
          <X size={13} />
        </button>
        <WizardIsland preload={preload} />
      </div>
    </div>
  );
}
