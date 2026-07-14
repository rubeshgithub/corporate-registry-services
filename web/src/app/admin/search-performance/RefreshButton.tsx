"use client";

import { useState } from "react";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

/** Manual "pull fresh GSC data" trigger. Auto-reloads the page on success
 *  so the just-persisted snapshot renders immediately. */
export default function RefreshButton() {
  const [window, setWindow] = useState<7 | 28>(7);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [errMsg, setErrMsg] = useState("");

  const refresh = async () => {
    setStatus("loading");
    setErrMsg("");
    try {
      const res = await fetch(`/api/admin/search-performance/refresh?window=${window}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setStatus("err");
        setErrMsg(data.error || `HTTP ${res.status}`);
        return;
      }
      setStatus("ok");
      /* Slight delay so the operator sees the "OK" flash before the reload. */
      setTimeout(() => location.reload(), 700);
    } catch (e) {
      setStatus("err");
      setErrMsg(e instanceof Error ? e.message : "Refresh failed.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.35rem" }}>
      <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
        <select
          value={window}
          onChange={(e) => setWindow(parseInt(e.target.value, 10) as 7 | 28)}
          style={{
            padding: "0.4rem 0.6rem",
            border: "1px solid var(--border)",
            borderRadius: "0.4rem",
            fontSize: "0.78rem",
            fontFamily: "var(--font-mono), monospace",
            background: "var(--card)",
          }}
        >
          <option value={7}>7d window</option>
          <option value={28}>28d window</option>
        </select>
        <button
          onClick={refresh}
          disabled={status === "loading"}
          className="btn-primary"
          style={{ height: "2.3rem", opacity: status === "loading" ? 0.65 : 1 }}
        >
          {status === "loading" && <><Loader2 size={14} className="crs-spin" /> Pulling…</>}
          {status === "ok"      && <><CheckCircle2 size={14} /> Done, reloading…</>}
          {status === "err"     && <><AlertCircle size={14} /> Failed</>}
          {status === "idle"    && <><RefreshCw size={14} /> Refresh from GSC</>}
        </button>
      </div>
      {status === "err" && (
        <div style={{ fontSize: "0.72rem", color: "#B45309", maxWidth: 280, textAlign: "right" }}>
          {errMsg}
        </div>
      )}
    </div>
  );
}
