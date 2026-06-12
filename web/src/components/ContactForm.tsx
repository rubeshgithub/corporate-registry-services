"use client";

import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";

const SUBJECTS = [
  "General Enquiry",
  "Quote Request",
  "Order Status",
  "Annual Return Filing",
  "Incorporation",
  "Minute Books",
  "Other",
];

export default function ContactForm({ compact = false }: { compact?: boolean }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    try {
      const res  = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      setStatus("sent");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: "0.75rem", padding: compact ? "1.5rem" : "2.5rem",
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: "0.875rem", textAlign: "center",
        }}
      >
        <CheckCircle2 size={32} style={{ color: "var(--secondary)" }} />
        <div>
          <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: "0.25rem" }}>
            Message sent!
          </div>
          <p style={{ fontSize: "0.83rem", color: "var(--text-muted)", margin: 0 }}>
            We&apos;ll get back to you within 1 hour.
          </p>
        </div>
        <button
          onClick={() => { setForm({ name: "", email: "", phone: "", subject: "", message: "" }); setStatus("idle"); }}
          style={{ fontSize: "0.78rem", color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: "0.875rem", padding: compact ? "1.25rem" : "1.75rem",
        display: "flex", flexDirection: "column", gap: "0.875rem",
      }}
    >
      {/* Name + Email row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <label className="field-label">Full Name *</label>
          <input
            required
            type="text"
            className="field-input"
            placeholder="Jane Smith"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Email *</label>
          <input
            required
            type="email"
            className="field-input"
            placeholder="jane@company.com"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
      </div>

      {/* Phone + Subject row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
        <div>
          <label className="field-label">Phone (optional)</label>
          <input
            type="tel"
            className="field-input"
            placeholder="+1 (416) 000-0000"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Subject</label>
          <select
            className="field-input"
            value={form.subject}
            onChange={(e) => set("subject", e.target.value)}
          >
            <option value="">Select a topic…</option>
            {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Message */}
      <div>
        <label className="field-label">Message *</label>
        <textarea
          required
          className="field-input"
          placeholder="Tell us what you need…"
          rows={compact ? 3 : 5}
          value={form.message}
          onChange={(e) => set("message", e.target.value)}
          style={{ resize: "vertical" }}
        />
      </div>

      {status === "error" && (
        <p style={{ fontSize: "0.8rem", color: "#c0392b", margin: 0 }}>{errorMsg}</p>
      )}

      <button
        type="submit"
        className="btn-primary"
        disabled={status === "sending"}
        style={{ alignSelf: "flex-start" }}
      >
        <Send size={14} />
        {status === "sending" ? "Sending…" : "Send Message"}
      </button>
    </form>
  );
}
