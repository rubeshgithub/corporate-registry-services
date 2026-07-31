/**
 * peiRegistry.js — PEI Corporate Registry client.
 *
 * Server-side only (Node 18+, no dependencies). Do not import into a browser
 * bundle: the upstream host will not send CORS headers for your origin.
 *
 * The upstream is a Spring Boot "workflow gateway" that fronts both PEI
 * registries. Everything goes through one endpoint, POST /api/workflow, with
 * the service + activity named in the body.
 *
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE TRUSTING THE PARSER
 *
 * The request shape below was reconstructed by reading PEI's own Angular
 * bundles (js/common.js, js/620.js) and verified end-to-end only through
 * rendered deep links — the raw JSON response body has never been observed.
 * `body.data` is a tree of "dynamic element" descriptors that their client
 * converts to HTML; parseSearch()/parseRecord() below walk it defensively and
 * will not throw on an unexpected shape, but they are informed guesses.
 *
 * Before you rely on this, run:
 *     node peiRegistry.js probe "BABA'S LOUNGE"
 * and look at the real payload. Then tighten the two parsers. Every call also
 * returns `.raw`, so you can ship while the parser is still provisional.
 * ---------------------------------------------------------------------------
 */

const API = 'https://wdf.princeedwardisland.ca/api';

/** Verified live: GET /api/preflight/{service} reports scope null for both, so
 *  the POST path is /api/workflow with no scope prefix. If PEI ever gives a
 *  service a scope, the path becomes /api/{scope}/workflow. */
const REGISTRIES = {
  // Current registry. Fronts the OCBR system. Names match fuzzily.
  current: {
    service: 'BusinessAPI',
    searchActivity: 'BusinessSearch',
    viewActivity: 'BusinessView',
    // Every form key must appear in queryVars — null for blanks, never omitted.
    // Omitting one yields "The service is not available at this time.",
    // which is a validation failure masquerading as an outage.
    formKeys: ['name', 'business_number', 'company_type', 'status'],
  },
  // "- Original" registry. Names match as case-insensitive substrings.
  legacy: {
    service: 'LegacyBusiness',
    searchActivity: 'LegacyBusinessSearch',
    viewActivity: null, // legacy has no view activity; search returns all of it
    formKeys: ['name', 'business_number', 'business_status'],
  },
};

/** Upstream's single catch-all error string. It means *any* of: malformed
 *  request, no such record, or a genuine backend fault. They are not
 *  distinguishable from the response — do not report it to users as an outage. */
const UPSTREAM_ERROR = 'The service is not available at this time.';

class PeiRegistryError extends Error {
  constructor(message, { status, cause, raw } = {}) {
    super(message);
    this.name = 'PeiRegistryError';
    this.status = status;
    this.cause = cause;
    this.raw = raw;
  }
}

async function post(body, { timeoutMs = 15000, retries = 2 } = {}) {
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 300 * 2 ** (attempt - 1)));

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    try {
      const res = await fetch(`${API}/workflow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Client-Show-Status': 'true',
        },
        body: JSON.stringify(body),
        signal: ac.signal,
      });

      if (res.status >= 500) {           // transient — worth retrying
        lastErr = new PeiRegistryError(`upstream ${res.status}`, { status: res.status });
        continue;
      }
      if (!res.ok) {                     // 4xx — our fault, retrying won't help
        throw new PeiRegistryError(`upstream ${res.status}`, { status: res.status });
      }
      return await res.json();
    } catch (err) {
      if (err instanceof PeiRegistryError && err.status && err.status < 500) throw err;
      lastErr = err;                     // network error or abort — retry
    } finally {
      clearTimeout(timer);
    }
  }

  throw new PeiRegistryError('upstream unreachable', { cause: lastErr });
}

function buildBody({ registry, activity, vars }) {
  const cfg = REGISTRIES[registry];
  if (!cfg) throw new PeiRegistryError(`unknown registry "${registry}"`);

  // Start with every form key present and null. This is what the real form
  // sends when its inputs are blank, and it is what makes an "any type"
  // search possible — something the site's own URL format cannot express.
  const queryVars = Object.fromEntries((cfg.formKeys ?? []).map(k => [k, null]));

  for (const [k, v] of Object.entries(vars)) {
    queryVars[k] = v === undefined || v === '' ? null : v;
  }

  queryVars.wdf_url_query = 'true';
  queryVars.service = cfg.service;
  queryVars.activity = activity;

  return {
    appName: cfg.service,
    featureName: cfg.service,
    queryName: activity,
    metaVars: { service_id: null, save_location: null },
    queryVars,
  };
}

/* -------------------------------------------------------------------------
 * Response parsing — provisional, see the header note.
 * ---------------------------------------------------------------------- */

/** Depth-first walk yielding every node in the dynamic-element tree. */
function* walk(node) {
  if (Array.isArray(node)) {
    for (const n of node) yield* walk(n);
  } else if (node && typeof node === 'object') {
    yield node;
    for (const key of ['children', 'elements', 'nodes', 'content', 'data']) {
      if (node[key]) yield* walk(node[key]);
    }
  }
}

const tagOf = n => String(n.tag ?? n.tagName ?? n.type ?? '').toLowerCase();
const textOf = n => {
  for (const k of ['text', 'innerText', 'value', 'label']) {
    if (typeof n[k] === 'string' && n[k].trim()) return n[k].trim();
  }
  return '';
};

function allText(root) {
  const out = [];
  for (const n of walk(root)) {
    const t = textOf(n);
    if (t) out.push(t);
  }
  return out;
}

function assertNotUpstreamError(data) {
  if (allText(data).some(t => t.includes(UPSTREAM_ERROR))) {
    throw new PeiRegistryError(
      'upstream rejected the request (bad parameters, no such record, or backend fault — ' +
      'the API does not distinguish these)',
      { raw: data },
    );
  }
}

/** Search results render as a table: header row, then one row per business. */
function parseSearch(data) {
  const rows = [];
  for (const node of walk(data)) {
    if (tagOf(node) !== 'tr') continue;
    const cells = [];
    for (const c of walk(node.children ?? node.elements ?? [])) {
      if (['td', 'th'].includes(tagOf(c))) cells.push(allText(c).join(' ').trim());
    }
    if (cells.length >= 3) rows.push(cells);
  }

  // Entity IDs live in the row links: .../BusinessView;id=24436
  const ids = [];
  for (const node of walk(data)) {
    const href = node.href ?? node.url ?? node.attributes?.href ?? '';
    const m = /BusinessView;id=(\d+)/.exec(String(href));
    if (m) ids.push(m[1]);
  }

  const body = rows.filter(r => !/^business name$|^name$/i.test(r[0] ?? ''));

  return body.map((cells, i) => ({
    name: cells[0] ?? null,
    businessNumber: cells[1] ?? null,
    companyType: cells[2] ?? null,
    status: cells[3] ?? null,
    entityId: ids[i] ?? null,     // positional — verify against a real payload
  }));
}

/** A single record renders as label/value pairs. */
function parseRecord(data) {
  const cells = allText(data);
  const LABELS = [
    'Business Type', 'Business Number', 'Entity Name', 'Entity Secondary Name',
    'Registration Date', 'Registration Number', 'Status', 'Address', 'End Date',
    'Former Name(s)', 'Nature of Business', 'Gazette Date', 'Renewal Date',
    'Expiry Date', 'Owner', 'Former Owner',
  ];
  const rec = {};
  for (let i = 0; i < cells.length; i++) {
    if (!LABELS.includes(cells[i])) continue;
    const next = cells[i + 1];
    rec[cells[i]] = next && !LABELS.includes(next) ? next : null;
  }
  return rec;
}

/* -------------------------------------------------------------------------
 * Public API
 * ---------------------------------------------------------------------- */

/**
 * Search the registry.
 *
 * Name matching in the current registry is fuzzy and ranked — "BABA" also
 * returns "Bass Pro Shops". Treat results as candidates for a human to pick
 * from, never auto-select the first one.
 */
export async function search({
  name,
  businessNumber,
  companyType = null,        // null = any type
  status = null,             // null = any status
  page,
  pageSize,
  registry = 'current',
  ...opts
} = {}) {
  if (!name && !businessNumber) {
    throw new PeiRegistryError('supply name or businessNumber');
  }

  const cfg = REGISTRIES[registry];
  const vars = { name, business_number: businessNumber };

  if (registry === 'legacy') {
    vars.business_status = status;      // "1" active, "0" inactive, null any
  } else {
    vars.company_type = companyType;
    vars.status = status;
  }
  if (page != null) vars.page_number = String(page);
  if (pageSize != null) vars.page_size = String(pageSize);

  const raw = await post(
    buildBody({ registry, activity: cfg.searchActivity, vars }),
    opts,
  );
  const data = raw?.data ?? raw;
  assertNotUpstreamError(data);

  return { results: parseSearch(data), raw };
}

export const searchByName = (name, opts = {}) => search({ name, ...opts });
export const searchByNumber = (businessNumber, opts = {}) => search({ businessNumber, ...opts });

/**
 * Fetch one full record by internal entity ID — the number search results link
 * to, and the same one OCBR uses at /ocbr/entityHome/{id}/. Current registry only.
 * This is where address, owner, nature of business and the dates live; search
 * results never carry them.
 */
export async function getEntity(id, opts = {}) {
  const raw = await post(
    buildBody({ registry: 'current', activity: 'BusinessView', vars: { id: String(id) } }),
    opts,
  );
  const data = raw?.data ?? raw;
  assertNotUpstreamError(data);

  return { record: parseRecord(data), raw };
}

export { PeiRegistryError };

/* -------------------------------------------------------------------------
 * Probe: dump a real response so you can fix the parsers.
 *     node peiRegistry.js probe "BABA'S LOUNGE"
 *     node peiRegistry.js probe-view 24436
 * ---------------------------------------------------------------------- */
if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, arg] = process.argv.slice(2);
  const run = async () => {
    if (cmd === 'probe') {
      const { raw, results } = await searchByName(arg ?? "BABA'S LOUNGE");
      console.log('--- parsed ---');
      console.table(results);
      console.log('--- raw ---');
      console.dir(raw, { depth: null });
    } else if (cmd === 'probe-view') {
      const { raw, record } = await getEntity(arg ?? 24436);
      console.log('--- parsed ---', record);
      console.log('--- raw ---');
      console.dir(raw, { depth: null });
    } else {
      console.log('usage: node peiRegistry.js probe "<name>" | probe-view <id>');
    }
  };
  run().catch(e => { console.error(e); process.exit(1); });
}