"use client";

import { useState } from "react";
import CoresLookupIsland from "./CoresLookupIsland";
import ProCorpNameCheckIsland from "./ProCorpNameCheckIsland";

/**
 * Hero for the Alberta medical professional corporation page (owner request,
 * 2026-09-24): one widget, two intents.
 *
 *  - "I have a Professional Corporation" → the Alberta registry lookup
 *    (CoresLookupIsland), which hands off to the existing-corporation
 *    service menu (annual return, changes, profile report…).
 *  - "Set up a new one" → the physician name-builder + availability check
 *    (ProCorpNameCheckIsland), Alberta scope, which previews
 *    "Dr. <name> Professional Corporation" against the registries.
 *
 * The page renders exactly one island (CUSTOM_ISLANDS rule); the tabs live
 * inside it so the two flows never compete as separate search boxes.
 */
export default function MedProCorpHeroIsland({ src }: { src: string }) {
  const [mode, setMode] = useState<"existing" | "new">("new");

  const tab = (key: "existing" | "new", label: string): React.ReactNode => {
    const active = mode === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setMode(key)}
        aria-pressed={active}
        style={{
          flex: "1 1 auto",
          padding: "0.55rem 0.9rem",
          borderRadius: "0.4rem",
          border: active ? "1px solid var(--gold)" : "1px solid var(--border)",
          background: active ? "rgba(212,175,55,0.14)" : "var(--bg)",
          color: "var(--text)",
          fontWeight: active ? 700 : 500,
          fontSize: "0.86rem",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div style={{ margin: "0 0 2rem" }}>
      <div
        role="tablist"
        aria-label="Medical professional corporation search"
        style={{ display: "flex", gap: "0.5rem", marginBottom: "0.85rem" }}
      >
        {tab("new", "Set up a new Professional Corporation")}
        {tab("existing", "I already have a Professional Corporation")}
      </div>
      {mode === "existing" ? (
        <CoresLookupIsland src={`${src}-existing`} />
      ) : (
        <ProCorpNameCheckIsland src={`${src}-new`} defaultScope="ab" profession="physician" />
      )}
    </div>
  );
}
