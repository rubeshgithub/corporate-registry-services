"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, UploadCloud, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";

/**
 * /admin/nonprofits — monthly refresh of the Alberta non-profit directory.
 *
 * Alberta republishes the "Non Profit Name list" export every month (the
 * dataset behind the Alberta Non-profit Listing Dashboard). The operator
 * downloads the xlsx and drops it here; the server parses it, swaps the
 * `crs.nonprofits` collection to the new month, and these rows surface in
 * the public company search for Alberta (societies the gazette corpus and
 * CBR never see).
 */

type Meta = {
  importRun:  string;
  importedAt: string;
  filename:   string;
  rows:       number;
  byType:     Record<string, number>;
  byStatus:   Record<string, number>;
} | null;

type UploadResult =
  | { state: "idle" }
  | { state: "uploading" }
  | { state: "done"; rows: number; removedStale: number }
  | { state: "error"; message: string };

const DASHBOARD_URL = "https://www.alberta.ca/alberta-non-profit-listing-dashboard";

export default function NonprofitsConsole() {
  const [meta, setMeta] = useState<Meta>(null);
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [upload, setUpload] = useState<UploadResult>({ state: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/nonprofits", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setMeta(data.meta ?? null);
      setCount(typeof data.count === "number" ? data.count : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const doUpload = useCallback(async (file: File) => {
    setUpload({ state: "uploading" });
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/nonprofits", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUpload({ state: "error", message: data.error ?? `Upload failed (${res.status}).` });
        return;
      }
      setUpload({ state: "done", rows: data.rows ?? 0, removedStale: data.removedStale ?? 0 });
      void refresh();
    } catch {
      setUpload({ state: "error", message: "Network error — the import may still be running; refresh in a minute." });
    }
  }, [refresh]);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void doUpload(f);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void doUpload(f);
  };

  const busy = upload.state === "uploading";

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-slate-900">Alberta non-profit directory</h1>
      <p className="mt-2 text-sm text-slate-600">
        The monthly list of Alberta societies and non-profit organizations, from the{" "}
        <a href={DASHBOARD_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 underline">
          Alberta Non-profit Listing Dashboard <ExternalLink className="h-3 w-3" />
        </a>
        . Rows loaded here surface in the public corporation search for Alberta — societies that
        the gazette corpus and the federal registry index never carry.
      </p>

      {/* ── current state ── */}
      <section className="mt-6 rounded-[var(--radius-card)] border border-slate-200 bg-white p-5 shadow-[var(--shadow-card)]">
        <h2 className="card-heading text-sm font-semibold uppercase tracking-wide text-slate-500">Current data</h2>
        {loading ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        ) : meta ? (
          <div className="mt-3 text-sm text-slate-700">
            <p>
              <span className="font-semibold">{meta.rows.toLocaleString()}</span> organizations
              {count != null && count !== meta.rows ? ` (${count.toLocaleString()} in collection)` : ""} · imported{" "}
              {new Date(meta.importedAt).toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })}{" "}
              from <span className="font-mono text-xs">{meta.filename}</span>
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">By type</h3>
                <ul className="mt-1 space-y-0.5">
                  {Object.entries(meta.byType).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                    <li key={k} className="flex justify-between gap-3"><span>{k}</span><span className="tabular-nums text-slate-500">{v.toLocaleString()}</span></li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">By status</h3>
                <ul className="mt-1 space-y-0.5">
                  {Object.entries(meta.byStatus).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => (
                    <li key={k} className="flex justify-between gap-3"><span>{k}</span><span className="tabular-nums text-slate-500">{v.toLocaleString()}</span></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">
            Nothing loaded yet — upload the first monthly export below and society searches start
            returning results as soon as it lands.
          </p>
        )}
      </section>

      {/* ── upload ── */}
      <section
        className={`mt-6 rounded-[var(--radius-card)] border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-white"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <UploadCloud className="mx-auto h-8 w-8 text-slate-400" />
        <p className="mt-2 text-sm text-slate-700">
          Drop this month&apos;s <span className="font-mono text-xs">non_profit_name_list…xlsx</span> here
        </p>
        <p className="mt-1 text-xs text-slate-500">
          (.xlsx straight from the portal, or .csv with the same columns — the old month stays live
          until the new file fully loads)
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {busy ? "Importing… (takes up to a minute)" : "Choose file"}
        </button>
        <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={onPick} />

        {upload.state === "done" && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4" /> Imported {upload.rows.toLocaleString()} organizations
            {upload.removedStale > 0 ? ` · retired ${upload.removedStale.toLocaleString()} rows no longer on the list` : ""}.
          </p>
        )}
        {upload.state === "error" && (
          <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertTriangle className="h-4 w-4" /> {upload.message}
          </p>
        )}
      </section>

      <p className="mt-6 text-xs text-slate-500">
        Monthly routine: open the dashboard page above → download the name-list export → drop it
        here. That&apos;s it — search picks the new data up immediately, no deploy needed.
      </p>
    </main>
  );
}
