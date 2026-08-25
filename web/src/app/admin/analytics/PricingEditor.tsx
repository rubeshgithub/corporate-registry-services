"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Check, RotateCcw, AlertCircle } from "lucide-react";

/**
 * Live price editor for the admin dashboard.
 *
 * Every price CRS charges is edited here. Values are stored as overrides on
 * top of the code defaults, so "Reset" always restores the shipped price and
 * a deploy never silently clobbers an operator's change.
 *
 * Prices are entered in dollars and stored in cents — the conversion happens
 * here rather than asking the operator to think in cents.
 */

type Item = {
  key:          string;
  label:        string;
  group:        string;
  unit:         "once" | "per-year";
  note:         string | null;
  defaultCents: number;
  currentCents: number;
  isOverridden: boolean;
  updatedAt:    string | null;
};

const centsToInput = (c: number) => (c / 100).toFixed(2).replace(/\.00$/, "");
const inputToCents = (v: string): number | null => {
  const n = Number(v.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
};

export default function PricingEditor() {
  const [items, setItems]     = useState<Item[]>([]);
  const [draft, setDraft]     = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");
  const [savedAt, setSavedAt] = useState<string>("");
  const [open, setOpen]       = useState(false);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res  = await fetch("/api/admin/pricing");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not load prices.");
      setItems(data.items ?? []);
      setDraft(Object.fromEntries((data.items ?? []).map((i: Item) => [i.key, centsToInput(i.currentCents)])));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load prices.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open && items.length === 0) void load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Only send what actually changed — a no-op save should not rewrite every
     row's updatedAt and make the audit trail useless. */
  const changes = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const it of items) {
      const raw = draft[it.key];
      if (raw == null) continue;
      const cents = inputToCents(raw);
      if (cents == null) continue;
      if (cents !== it.currentCents) out[it.key] = cents;
    }
    return out;
  }, [items, draft]);

  const invalidKeys = useMemo(
    () => items.filter((it) => inputToCents(draft[it.key] ?? "") === null).map((it) => it.key),
    [items, draft],
  );

  const dirtyCount = Object.keys(changes).length;

  const save = async () => {
    if (dirtyCount === 0 || invalidKeys.length > 0) return;
    setSaving(true);
    setErr("");
    try {
      const res  = await fetch("/api/admin/pricing", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ changes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Save failed.");
      setSavedAt(new Date().toLocaleTimeString());
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const resetOne = (it: Item) =>
    setDraft((d) => ({ ...d, [it.key]: centsToInput(it.defaultCents) }));

  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) {
      if (!m.has(it.group)) m.set(it.group, []);
      m.get(it.group)!.push(it);
    }
    return [...m.entries()];
  }, [items]);

  return (
    <section style={card}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: 0, textAlign: "left",
        }}
      >
        <div>
          <h2 style={h2}>Pricing</h2>
          <p style={sub}>
            Every price the site charges. Changes take effect on the next checkout.
          </p>
        </div>
        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
          {open ? "Hide" : "Edit prices"}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: "1rem" }}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
              <Loader2 size={14} className="crs-spin" /> Loading prices…
            </div>
          )}

          {err && (
            <div style={errBox}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
              <span>{err}</span>
            </div>
          )}

          {!loading && groups.map(([group, rows]) => (
            <div key={group} style={{ marginBottom: "1.25rem" }}>
              <div style={groupLabel}>{group}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: "0.5rem" }}>
                {rows.map((it) => {
                  const raw     = draft[it.key] ?? "";
                  const cents   = inputToCents(raw);
                  const bad     = cents === null;
                  const dirty   = cents !== null && cents !== it.currentCents;
                  return (
                    <div key={it.key} style={{ ...row, borderColor: bad ? "#B45309" : dirty ? "var(--gold)" : "var(--border)" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--text)", lineHeight: 1.3 }}>
                          {it.label}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "0.15rem", lineHeight: 1.4 }}>
                          {it.note ? `${it.note} · ` : ""}
                          default {centsToInput(it.defaultCents)}
                          {it.unit === "per-year" ? " per year" : ""}
                          {it.isOverridden ? " · overridden" : ""}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>$</span>
                        <input
                          value={raw}
                          onChange={(e) => setDraft((d) => ({ ...d, [it.key]: e.target.value }))}
                          inputMode="decimal"
                          style={{
                            width: 78, padding: "0.35rem 0.5rem",
                            border: `1px solid ${bad ? "#B45309" : "var(--border)"}`,
                            borderRadius: "0.4rem", fontSize: "0.85rem",
                            background: "var(--bg)", color: "var(--text)",
                            fontFamily: "var(--font-mono), monospace", textAlign: "right",
                          }}
                        />
                        <button
                          onClick={() => resetOne(it)}
                          title="Reset to default"
                          disabled={cents === it.defaultCents}
                          style={{
                            background: "none", border: "none",
                            cursor: cents === it.defaultCents ? "default" : "pointer",
                            color: cents === it.defaultCents ? "var(--border)" : "var(--text-muted)",
                            padding: "0.2rem", display: "inline-flex",
                          }}
                        >
                          <RotateCcw size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {!loading && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: "0.85rem" }}>
              <button
                onClick={save}
                disabled={dirtyCount === 0 || invalidKeys.length > 0 || saving}
                style={{
                  padding: "0.5rem 1.1rem", borderRadius: "0.5rem", border: "none",
                  background: dirtyCount > 0 && invalidKeys.length === 0 ? "var(--primary)" : "var(--border)",
                  color: "#fff", fontWeight: 600, fontSize: "0.85rem",
                  cursor: dirtyCount > 0 && invalidKeys.length === 0 && !saving ? "pointer" : "not-allowed",
                  display: "inline-flex", alignItems: "center", gap: "0.4rem",
                }}
              >
                {saving
                  ? <><Loader2 size={14} className="crs-spin" /> Saving…</>
                  : <>Save {dirtyCount > 0 ? `${dirtyCount} change${dirtyCount === 1 ? "" : "s"}` : "changes"}</>}
              </button>

              {invalidKeys.length > 0 && (
                <span style={{ fontSize: "0.78rem", color: "#B45309" }}>
                  {invalidKeys.length} price{invalidKeys.length === 1 ? "" : "s"} not a valid amount
                </span>
              )}
              {savedAt && dirtyCount === 0 && invalidKeys.length === 0 && (
                <span style={{ fontSize: "0.78rem", color: "var(--secondary)", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <Check size={13} /> Saved at {savedAt}
                </span>
              )}
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                Setting a price back to its default removes the override.
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ── styles, matching the surrounding dashboard cards ── */

const card: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-card)",
  padding: "1.25rem 1.5rem",
  marginBottom: "1rem",
  boxShadow: "var(--shadow-card)",
};

const h2: React.CSSProperties = {
  fontFamily: "var(--font-display), Georgia, serif",
  fontSize: "1.05rem",
  fontWeight: 700,
  color: "var(--text)",
  margin: 0,
};

const sub: React.CSSProperties = {
  fontSize: "0.78rem",
  color: "var(--text-muted)",
  margin: "0.2rem 0 0",
};

const groupLabel: React.CSSProperties = {
  fontFamily: "var(--font-mono), monospace",
  fontSize: "0.68rem",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--text-muted)",
  marginBottom: "0.45rem",
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  padding: "0.6rem 0.75rem",
  border: "1px solid var(--border)",
  borderRadius: "0.5rem",
  background: "var(--bg)",
};

const errBox: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  alignItems: "flex-start",
  padding: "0.65rem 0.85rem",
  borderRadius: "0.5rem",
  background: "rgba(180,83,9,0.08)",
  color: "#B45309",
  fontSize: "0.82rem",
  marginBottom: "0.85rem",
};
