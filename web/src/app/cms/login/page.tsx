"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Loader2, AlertCircle } from "lucide-react";

export default function CmsLoginPage() {
  return (
    <Suspense fallback={<Shell><Loader2 size={16} className="crs-spin" /></Shell>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/cms";

  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/cms/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setErr(json.error || `Login failed (${res.status}).`);
        return;
      }
      router.push(nextPath);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <div style={{
        display: "flex",
        gap: "0.75rem",
        alignItems: "center",
        marginBottom: "1.5rem",
      }}>
        <div style={{
          width: 44, height: 44,
          borderRadius: "0.5rem",
          background: "var(--gold-dim)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>
          <Lock size={20} style={{ color: "var(--gold)" }} />
        </div>
        <div>
          <h1 style={{
            fontFamily: "var(--font-display), Georgia, serif",
            fontSize: "1.4rem", fontWeight: 700,
            color: "var(--text)", margin: 0, lineHeight: 1.25,
          }}>
            CMS Login
          </h1>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0.15rem 0 0" }}>
            Content authoring for CRS
          </p>
        </div>
      </div>

      <form onSubmit={submit}>
        <label style={{ display: "block", marginBottom: "1rem" }}>
          <span style={{
            display: "block", fontSize: "0.8rem", fontWeight: 700,
            color: "var(--text)", marginBottom: "0.3rem",
          }}>
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            style={inputStyle}
          />
        </label>

        {err && (
          <div style={{
            padding: "0.55rem 0.75rem",
            background: "rgba(220,38,38,0.08)",
            color: "#B91C1C",
            fontSize: "0.82rem", borderRadius: "0.35rem",
            marginBottom: "0.9rem",
            display: "flex", gap: "0.4rem", alignItems: "flex-start",
          }}>
            <AlertCircle size={13} style={{ marginTop: "0.15rem", flexShrink: 0 }} />
            <span>{err}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !password}
          style={{
            width: "100%",
            padding: "0.75rem 1.25rem",
            background: submitting || !password ? "var(--border)" : "var(--primary)",
            color: "#FFFFFF",
            border: "none",
            borderRadius: "0.4rem",
            fontSize: "0.95rem", fontWeight: 700,
            cursor: submitting || !password ? "not-allowed" : "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
          }}
        >
          {submitting ? <><Loader2 size={14} className="crs-spin" /> Signing in…</> : "Sign in"}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)",
      padding: "2rem 1rem",
    }}>
      <div style={{
        width: "100%", maxWidth: 400,
        padding: "2rem",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "0.6rem",
      }}>
        {children}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.65rem 0.85rem",
  border: "1px solid var(--border)",
  borderRadius: "0.4rem",
  fontSize: "0.95rem",
  background: "var(--bg)",
  color: "var(--text)",
  fontFamily: "inherit",
};
