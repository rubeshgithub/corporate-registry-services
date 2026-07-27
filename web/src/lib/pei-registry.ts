import { lookups, ensureLookupsIndex } from "./registrar-mongo";

/**
 * PEI Corporate Registry client — TypeScript port of
 * `crs-content/pei-registry/peiRegistry.js` with tightened parsers, User-Agent
 * identification, and 15-minute cache via the shared `lookups` collection.
 *
 * Upstream: `POST https://wdf.princeedwardisland.ca/api/workflow`
 * — the "workflow gateway" that fronts PEI's two registries. No auth.
 *
 * Preflight verified (2026-07-27):
 *   GET /api/preflight/BusinessAPI → {"name":"BusinessAPI","scope":null,"defaultActivity":"BusinessSearch"}
 *   No `secured: true` — public search is designed to be reachable without auth.
 *
 * Response schema verified with real probes against BABA / BABA'S LOUNGE:
 *   Search rows are TableV2Row with 4 TableV2Cell children:
 *     cell[0] → LinkV2 { data: { text: "BABA'S LOUNGE", queryParams: { id: "24436" } } }
 *     cell[1..3] → TableV2Cell.data.text (BN, company type, status)
 *   Entity records are 16 TableV2Row, each with 1 TableV2Header (label) + 1
 *   TableV2Cell (value). Address values encode newlines as `&#10;`.
 *
 * Behaviour that will break the integration if changed (from the brief):
 * 1. Server-side only — the upstream sends no CORS headers for our origin.
 * 2. Every form key must appear, `null` for blanks. Omitting one yields
 *    "The service is not available at this time." — a validation failure
 *    masquerading as an outage.
 * 3. That error string is a catch-all (bad params, no such record, real
 *    backend fault — all one message). Never surface as "registry down".
 * 4. No ID enumeration. The brief calls out PEI's WAF blocks aggressive
 *    clients; we cache 15 min + rate-throttle via cache to be well-behaved.
 * 5. Legacy registry (LegacyBusiness) is behind Radware BotDefend — do NOT
 *    query it programmatically. Current registry (BusinessAPI) is the only
 *    supported target.
 */

const API_URL      = "https://wdf.princeedwardisland.ca/api/workflow";
const UA           = "CRS-PEI/1.0 (+https://www.corporateregistryservices.ca; support@corporateregistryservices.ca)";
const TIMEOUT_MS   = 15_000;
const MAX_RETRIES  = 2;
const CACHE_TTL_MS = 15 * 60 * 1000;

/** Upstream's single catch-all error string. Do not report to users as outage. */
const UPSTREAM_ERR = "The service is not available at this time.";

/* ─── Types ────────────────────────────────────────────────── */

export type PeiSearchResult = {
  name:           string | null;
  businessNumber: string | null;
  companyType:    string | null;
  status:         string | null;
  entityId:       string | null;
};

export type PeiEntityRecord = {
  entityId:            string;
  "Business Type"?:            string | null;
  "Business Number"?:          string | null;
  "Entity Name"?:              string | null;
  "Entity Secondary Name"?:    string | null;
  "Registration Date"?:        string | null;
  "Registration Number"?:      string | null;
  "Status"?:                   string | null;
  "Address"?:                  string | null;
  "End Date"?:                 string | null;
  "Former Name(s)"?:           string | null;
  "Nature of Business"?:       string | null;
  "Gazette Date"?:             string | null;
  "Renewal Date"?:             string | null;
  "Expiry Date"?:              string | null;
  "Owner"?:                    string | null;
  "Former Owner"?:             string | null;
};

export class PeiRegistryError extends Error {
  status?: number;
  cause?:  unknown;
  raw?:    unknown;
  constructor(message: string, opts: { status?: number; cause?: unknown; raw?: unknown } = {}) {
    super(message);
    this.name   = "PeiRegistryError";
    this.status = opts.status;
    this.cause  = opts.cause;
    this.raw    = opts.raw;
  }
}

/* ─── Public entrypoints ──────────────────────────────────── */

export type SearchOpts = {
  status?:      string | null;
  companyType?: string | null;
  page?:        number;
  pageSize?:    number;
  forceRefresh?: boolean;
};

/**
 * Search the PEI corporate registry by name. Cached 15 min in `lookups` per
 * (name, status, companyType, page) tuple.
 */
export async function searchPei(name: string, opts: SearchOpts = {}): Promise<{
  results: PeiSearchResult[];
  totalHint: number | null;
  cached: boolean;
  source: "pei";
}> {
  const key = `pei-search:${normKey(name)}|${opts.status ?? ""}|${opts.companyType ?? ""}|${opts.page ?? 1}`;

  if (!opts.forceRefresh) {
    const cached = await readCache<{ results: PeiSearchResult[]; totalHint: number | null }>(key);
    if (cached) return { ...cached, cached: true, source: "pei" };
  }

  const body = buildBody({
    activity: "BusinessSearch",
    vars: {
      name,
      business_number: null,
      company_type: opts.companyType ?? null,
      status: opts.status ?? null,
      ...(opts.page     != null ? { page_number: String(opts.page) } : {}),
      ...(opts.pageSize != null ? { page_size:   String(opts.pageSize) } : {}),
    },
  });

  const raw   = await postWorkflow(body);
  const data  = extractData(raw);
  assertNotUpstreamError(data);

  const results   = parseSearch(data);
  const totalHint = parseTotalHint(data);

  await writeCache(key, { results, totalHint });
  return { results, totalHint, cached: false, source: "pei" };
}

/**
 * Fetch one entity by its PEI internal ID (from search results
 * `entityId`). Cached 15 min.
 */
export async function getPeiEntity(id: string, opts: { forceRefresh?: boolean } = {}): Promise<{
  record: PeiEntityRecord | null;
  cached: boolean;
  source: "pei";
}> {
  const trimmed = String(id).trim();
  if (!/^\d{1,10}$/.test(trimmed)) {
    throw new PeiRegistryError(`Invalid PEI entity id: ${trimmed}`);
  }
  const key = `pei-entity:${trimmed}`;

  if (!opts.forceRefresh) {
    const cached = await readCache<{ record: PeiEntityRecord | null }>(key);
    if (cached) return { ...cached, cached: true, source: "pei" };
  }

  const body  = buildBody({ activity: "BusinessView", vars: { id: trimmed } });
  const raw   = await postWorkflow(body);
  const data  = extractData(raw);
  assertNotUpstreamError(data);

  const record = parseRecord(data, trimmed);
  await writeCache(key, { record });
  return { record, cached: false, source: "pei" };
}

/* ─── HTTP + body ─────────────────────────────────────────── */

type FormVars = Record<string, string | null>;
const FORM_KEYS = ["name", "business_number", "company_type", "status"] as const;

function buildBody({ activity, vars }: { activity: string; vars: FormVars }): Record<string, unknown> {
  /* Start with every form key present and null — this is what the real form
   *  sends when its inputs are blank. Omitting one yields the catch-all
   *  error and passing null is what enables "any type" searches. */
  const queryVars: Record<string, string | null> = {};
  for (const k of FORM_KEYS) queryVars[k] = null;

  for (const [k, v] of Object.entries(vars)) {
    queryVars[k] = v === undefined || v === "" ? null : v;
  }

  queryVars.wdf_url_query = "true";
  queryVars.service       = "BusinessAPI";
  queryVars.activity      = activity;

  return {
    appName:     "BusinessAPI",
    featureName: "BusinessAPI",
    queryName:   activity,
    metaVars:    { service_id: null, save_location: null },
    queryVars,
  };
}

async function postWorkflow(body: unknown): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(300 * 2 ** (attempt - 1));
    const ac    = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(API_URL, {
        method:  "POST",
        headers: {
          "Content-Type":       "application/json",
          "Accept":             "application/json",
          "Client-Show-Status": "true",
          "User-Agent":         UA,
        },
        body:   JSON.stringify(body),
        signal: ac.signal,
        cache:  "no-store",
      });
      if (res.status >= 500) {
        lastErr = new PeiRegistryError(`upstream ${res.status}`, { status: res.status });
        continue;
      }
      if (!res.ok) {
        throw new PeiRegistryError(`upstream ${res.status}`, { status: res.status });
      }
      return await res.json();
    } catch (e) {
      if (e instanceof PeiRegistryError && e.status && e.status < 500) throw e;
      lastErr = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new PeiRegistryError("upstream unreachable", { cause: lastErr });
}

/* ─── Parsers (verified against real probes) ──────────────── */

type Node = { type?: string; children?: Node[]; data?: Record<string, unknown> } & Record<string, unknown>;

function extractData(raw: unknown): Node[] {
  if (raw && typeof raw === "object") {
    const d = (raw as Record<string, unknown>).data;
    if (Array.isArray(d)) return d as Node[];
  }
  return [];
}

/** Depth-first walk yielding every node. */
function* walk(node: Node | Node[] | undefined): Generator<Node> {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n);
    return;
  }
  if (typeof node !== "object") return;
  yield node;
  const children = node.children;
  if (Array.isArray(children)) for (const c of children) yield* walk(c);
}

function firstOfType(node: Node | Node[] | undefined, type: string): Node | null {
  for (const n of walk(node)) if (n.type === type) return n;
  return null;
}

function parseSearch(data: Node[]): PeiSearchResult[] {
  const rows: PeiSearchResult[] = [];
  for (const n of walk(data)) {
    if (n.type !== "TableV2Row") continue;
    const cells = (n.children ?? []).filter((c) => c.type === "TableV2Cell");
    if (cells.length < 3) continue;

    /* Cell 0: name + entity ID inside a LinkV2 */
    const link         = firstOfType(cells[0], "LinkV2");
    const linkData     = (link?.data ?? {}) as { text?: unknown; queryParams?: unknown };
    const name         = typeof linkData.text === "string" ? linkData.text.trim() : null;
    const queryParams  = (linkData.queryParams as Record<string, unknown> | undefined) ?? {};
    const idRaw        = queryParams.id;
    const entityId     = typeof idRaw === "string" && /^\d+$/.test(idRaw) ? idRaw : null;

    /* Cells 1..3: plain text */
    const businessNumber = textOfCell(cells[1]);
    const companyType    = textOfCell(cells[2]);
    const status         = textOfCell(cells[3]);

    rows.push({ name, businessNumber, companyType, status, entityId });
  }
  return rows;
}

function textOfCell(cell: Node | undefined): string | null {
  const t = (cell?.data as { text?: unknown } | undefined)?.text;
  return typeof t === "string" ? t.trim() : null;
}

function parseTotalHint(data: Node[]): number | null {
  /* First Paragraph carries "Showing results 1-20 of 209". */
  const p = firstOfType(data, "Paragraph");
  const t = (p?.data as { text?: unknown } | undefined)?.text;
  if (typeof t !== "string") return null;
  const m = /of\s+(\d+)/i.exec(t);
  return m ? parseInt(m[1], 10) : null;
}

function parseRecord(data: Node[], entityId: string): PeiEntityRecord | null {
  const rows = [...walk(data)].filter((n) => n.type === "TableV2Row");
  if (rows.length === 0) return null;

  const record: PeiEntityRecord = { entityId };
  for (const row of rows) {
    const children = row.children ?? [];
    const header   = children.find((c) => c.type === "TableV2Header");
    const cell     = children.find((c) => c.type === "TableV2Cell");
    const label    = (header?.data as { text?: unknown } | undefined)?.text;
    if (typeof label !== "string" || !label.trim()) continue;
    let value = (cell?.data as { text?: unknown } | undefined)?.text;
    if (typeof value !== "string" || !value.trim()) {
      (record as Record<string, unknown>)[label.trim()] = null;
      continue;
    }
    /* Address newlines encoded as HTML entity */
    const decoded = value.replace(/&#10;/g, "\n").replace(/&amp;/g, "&").trim();
    (record as Record<string, unknown>)[label.trim()] = decoded;
  }
  return record;
}

function assertNotUpstreamError(data: Node[]): void {
  for (const n of walk(data)) {
    const t = (n.data as { text?: unknown } | undefined)?.text;
    if (typeof t === "string" && t.includes(UPSTREAM_ERR)) {
      throw new PeiRegistryError(
        "upstream rejected the request (bad parameters, no such record, or backend fault — the API does not distinguish these)",
        { raw: data },
      );
    }
  }
}

/* ─── Cache helpers ──────────────────────────────────────── */

async function readCache<T>(key: string): Promise<T | null> {
  try {
    await ensureLookupsIndex();
    const col = await lookups();
    const doc = await col.findOne({ _id: key });
    if (!doc) return null;
    if (Date.now() - doc.fetchedAt.getTime() > CACHE_TTL_MS) return null;
    return doc.payload as T;
  } catch {
    return null;
  }
}

async function writeCache(key: string, payload: unknown): Promise<void> {
  try {
    await ensureLookupsIndex();
    const col = await lookups();
    await col.replaceOne(
      { _id: key },
      { source: "pei", payload, fetchedAt: new Date() },
      { upsert: true },
    );
  } catch {
    /* Cache write is best-effort — swallow. */
  }
}

/* ─── Utility ─────────────────────────────────────────────── */

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 200);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
