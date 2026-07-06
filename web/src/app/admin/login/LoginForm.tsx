"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [busy, setBusy]         = useState(false);
  const router                  = useRouter();
  const params                  = useSearchParams();
  const next                    = params.get("next") ?? "/admin/analytics";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Login failed.");
        setBusy(false);
        return;
      }
      router.replace(next);
    } catch {
      setError("Network error.");
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-deep)" }}>
      <form
        onSubmit={submit}
        style={{
          background:    "var(--card)",
          border:        "1px solid var(--border)",
          borderRadius:  "0.75rem",
          padding:       "2rem 1.75rem",
          width:         360,
          boxShadow:     "0 4px 20px rgba(0,0,0,0.06)",
        }}
      >
        <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.35rem", fontWeight: 700, color: "var(--text)", margin: "0 0 0.35rem" }}>
          Admin
        </h1>
        <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0 0 1.25rem" }}>
          Password-gated internal analytics. Not for customer use.
        </p>

        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.35rem" }}>
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          style={{
            width:        "100%",
            padding:      "0.6rem 0.85rem",
            border:       "1px solid var(--border)",
            borderRadius: "0.5rem",
            fontSize:     "0.95rem",
            background:   "var(--bg)",
            color:        "var(--text)",
          }}
        />

        {error && (
          <p style={{ color: "#B45309", fontSize: "0.82rem", margin: "0.75rem 0 0" }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || !password}
          style={{
            width:        "100%",
            marginTop:    "1.25rem",
            padding:      "0.7rem 1rem",
            background:   busy || !password ? "var(--border)" : "var(--primary)",
            color:        "#FFFFFF",
            fontWeight:   700,
            fontSize:     "0.9rem",
            border:       "none",
            borderRadius: "0.5rem",
            cursor:       busy || !password ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
