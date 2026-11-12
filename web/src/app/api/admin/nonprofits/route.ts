import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  nonprofits,
  nonprofitsMeta,
  ensureNonprofitsIndexes,
  normalizeNonprofitName,
  type NonprofitDoc,
} from "@/lib/nonprofits-mongo";

/**
 * /api/admin/nonprofits — the monthly Alberta non-profit list refresh.
 *
 * GET   → last-import stats for the /admin/nonprofits console.
 * POST  → multipart upload of the month's export from Alberta's Open Data
 *         Portal (the file behind the Alberta Non-profit Listing Dashboard).
 *         Accepts the portal's .xlsx as-is, or a .csv of the same columns.
 *
 * Load strategy (shared-tier-safe — no renameCollection):
 *   1. parse + upsert every row tagged with this run's id (chunked bulks);
 *   2. only after the whole file loaded, delete rows from older runs;
 *   3. write the meta doc the console shows.
 * A failed or truncated upload therefore never wipes the live directory —
 * the old rows stay until a complete new load has landed, and a file under
 * MIN_ROWS rows is refused outright (the real export is ~70k).
 *
 * Expected columns (header row is found by name, order doesn't matter):
 *   Legal Entity Type Description | Legal Entity Name | Status |
 *   Registration Date | City | Postal Code
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_ROWS = 1000;
const CHUNK = 1000;

type ParsedRow = {
  entityType: string;
  name: string;
  status: string;
  registrationDate: string;
  city: string;
  postal: string;
};

/* ── GET: stats ─────────────────────────────────────────────────────────── */

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const meta = await (await nonprofitsMeta()).findOne({ _id: "latest-import" });
    const count = await (await nonprofits()).estimatedDocumentCount();
    return NextResponse.json({ meta, count });
  } catch (e) {
    console.error("[admin/nonprofits] GET failed:", e);
    return NextResponse.json({ error: "Could not read import status" }, { status: 500 });
  }
}

/* ── parsing helpers ────────────────────────────────────────────────────── */

function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    /* Registration dates in the export are plain "1979/06/18" strings, but
       a hand-resaved workbook may carry real date cells — format those the
       same way so both normalize identically below. */
    return v.toISOString().slice(0, 10).replace(/-/g, "/");
  }
  if (typeof v === "object") {
    /* exceljs rich text / formula results */
    const o = v as { text?: unknown; result?: unknown; richText?: Array<{ text?: string }> };
    if (typeof o.text === "string") return o.text;
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text ?? "").join("");
    if (o.result != null) return cellText(o.result);
  }
  return String(v);
}

function normDate(s: string): string {
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(s.trim());
  if (!m) return "";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** Map a header row to column indexes; null when this row isn't the header. */
function headerMap(cells: string[]): Record<keyof ParsedRow, number> | null {
  const idx = (want: string) =>
    cells.findIndex((c) => c.trim().toLowerCase() === want);
  const name = idx("legal entity name");
  if (name < 0) return null;
  const map = {
    entityType:       idx("legal entity type description"),
    name,
    status:           idx("status"),
    registrationDate: idx("registration date"),
    city:             idx("city"),
    postal:           idx("postal code"),
  };
  /* Name + type + status are the load-bearing columns; refuse a file where
     any of them is missing rather than loading a directory of blanks. */
  if (map.entityType < 0 || map.status < 0) return null;
  return map;
}

function rowFrom(cells: string[], map: Record<keyof ParsedRow, number>): ParsedRow | null {
  const get = (i: number) => (i >= 0 && i < cells.length ? cells[i].trim() : "");
  const name = get(map.name);
  if (!name) return null;
  return {
    entityType:       get(map.entityType),
    name,
    status:           get(map.status),
    registrationDate: normDate(get(map.registrationDate)),
    city:             get(map.city),
    postal:           get(map.postal).replace(/\s+/g, "").toUpperCase(),
  };
}

async function parseXlsx(buf: Buffer, onRow: (r: ParsedRow) => void): Promise<void> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buf), {
    entries: "emit",
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
  });
  let map: Record<keyof ParsedRow, number> | null = null;
  let scanned = 0;
  for await (const worksheet of reader) {
    for await (const row of worksheet) {
      /* row.values is 1-based; shift to 0-based text cells. */
      const raw = Array.isArray(row.values) ? row.values.slice(1) : [];
      const cells = raw.map(cellText);
      if (!map) {
        map = headerMap(cells);
        scanned++;
        if (!map && scanned > 10) throw new Error("header-not-found");
        continue;
      }
      const parsed = rowFrom(cells, map);
      if (parsed) onRow(parsed);
    }
    if (map) return; // first sheet with a recognizable header is the dataset
  }
  if (!map) throw new Error("header-not-found");
}

/** Minimal quoted-field CSV parser — names in the export contain commas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string, onRow: (r: ParsedRow) => void): void {
  const lines = text.split(/\r?\n/);
  let map: Record<keyof ParsedRow, number> | null = null;
  let scanned = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    if (!map) {
      map = headerMap(cells);
      scanned++;
      if (!map && scanned > 10) throw new Error("header-not-found");
      continue;
    }
    const parsed = rowFrom(cells, map);
    if (parsed) onRow(parsed);
  }
  if (!map) throw new Error("header-not-found");
}

/* ── POST: upload + swap ────────────────────────────────────────────────── */

export async function POST(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    /* fall through to the 400 below */
  }
  if (!file) {
    return NextResponse.json({ error: "Attach the export as form field \"file\"." }, { status: 400 });
  }

  const filename = file.name || "upload";
  const isCsv = /\.csv$/i.test(filename) || (file.type || "").includes("csv");
  const buf = Buffer.from(await file.arrayBuffer());

  const run = new Date().toISOString();
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const seen = new Set<string>();
  let pending: NonprofitDoc[] = [];
  let rows = 0;

  try {
    await ensureNonprofitsIndexes();
    const col = await nonprofits();

    const flush = async () => {
      if (!pending.length) return;
      const batch = pending;
      pending = [];
      await col.bulkWrite(
        batch.map((doc) => ({
          replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
        })),
        { ordered: false },
      );
    };

    /* Collect rows into bulk chunks. Parsing is synchronous per row; flushes
       happen between chunks so memory stays at one chunk of docs. */
    const chunks: NonprofitDoc[][] = [];
    const onRow = (r: ParsedRow) => {
      const nameNorm = normalizeNonprofitName(r.name);
      if (!nameNorm) return;
      const _id = `${nameNorm}|${r.entityType}`;
      if (seen.has(_id)) return;           // export occasionally repeats a row
      seen.add(_id);
      rows++;
      byType[r.entityType || "(blank)"] = (byType[r.entityType || "(blank)"] ?? 0) + 1;
      byStatus[r.status || "(blank)"] = (byStatus[r.status || "(blank)"] ?? 0) + 1;
      pending.push({
        _id,
        name: r.name,
        nameNorm,
        entityType: r.entityType,
        status: r.status,
        registrationDate: r.registrationDate,
        city: r.city,
        postal: r.postal,
        importRun: run,
      });
      if (pending.length >= CHUNK) chunks.push(pending.splice(0, pending.length));
    };

    if (isCsv) parseCsv(buf.toString("utf8"), onRow);
    else await parseXlsx(buf, onRow);

    if (rows < MIN_ROWS) {
      return NextResponse.json(
        { error: `Parsed only ${rows} rows — the monthly export is ~70,000. Nothing was changed; check the file.` },
        { status: 422 },
      );
    }

    const tail = pending;       // rows after the last full chunk
    for (const c of chunks) {
      pending = c;
      await flush();
    }
    pending = tail;
    await flush();

    /* The full file is in — now retire rows from previous runs (societies
       that left the register, renames keyed under their old name). */
    const removed = await col.deleteMany({ importRun: { $ne: run } });

    const meta = {
      _id: "latest-import" as const,
      importRun: run,
      importedAt: new Date(),
      filename,
      rows,
      byType,
      byStatus,
    };
    await (await nonprofitsMeta()).replaceOne({ _id: "latest-import" }, meta, { upsert: true });

    return NextResponse.json({ ok: true, rows, removedStale: removed.deletedCount, byType, byStatus });
  } catch (e) {
    if (e instanceof Error && e.message === "header-not-found") {
      return NextResponse.json(
        { error: "Couldn't find the header row (\"Legal Entity Name\" etc.) in the first 10 rows. Is this the Alberta non-profit list export?" },
        { status: 422 },
      );
    }
    console.error("[admin/nonprofits] import failed:", e);
    return NextResponse.json(
      { error: "Import failed partway — the previous month's data is still live. Try the upload again." },
      { status: 500 },
    );
  }
}
