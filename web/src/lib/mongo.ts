import { MongoClient, type Db, type Collection } from "mongodb";

/**
 * Shared MongoDB client. Reuses the MinuteBook cluster (same MONGODB_URI env
 * var) — the tracking collections live in a dedicated `crs_analytics`
 * database inside that cluster so they don't get mixed up with MinuteBook's
 * product data.
 *
 * Node module caching gives us a de-facto singleton per instance; in Next.js
 * dev with HMR we also stash on globalThis to survive the reload cycle
 * without leaking connections.
 */

const uri = process.env.MONGODB_URI ?? "";

type GlobalWithMongo = typeof globalThis & { _crsMongoClient?: MongoClient };

const g = globalThis as GlobalWithMongo;

async function client(): Promise<MongoClient> {
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!g._crsMongoClient) {
    g._crsMongoClient = new MongoClient(uri, { maxPoolSize: 5 });
    await g._crsMongoClient.connect();
  }
  return g._crsMongoClient;
}

export async function db(): Promise<Db> {
  const c = await client();
  return c.db("crs_analytics");
}

/* Typed collection accessors so callers don't sprinkle string names. */

export type PageviewDoc = {
  path:       string;       // "/articles/how-to-file-your-annual-return-in-alberta"
  referrer:   string;       // "" or full URL from document.referrer
  sessionId:  string;       // uuid, stable per browser session (see cookie in Analytics.tsx)
  userAgent:  string;       // best-effort UA — trimmed to 200 chars
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  fbclid?:    string;       // Facebook / Instagram click ID
  gclid?:     string;       // Google Ads click ID
  msclkid?:   string;       // Microsoft (Bing) Ads click ID
  ts:         Date;
};

export type ClickDoc = {
  path:      string;       // page where the click happened
  target:    string;       // href of the anchor / element
  label:     string;       // text content of the element (first 80 chars)
  sessionId: string;
  ts:        Date;
};

export type SearchDoc = {
  query:       string;    // raw text the user typed
  queryLower:  string;    // lowercased for grouping in aggregation
  province:    string;    // "all" or a JURISDICTIONS key
  resultCount: number;    // 0 signals demand we can't fulfill — highest-value bucket
  path:        string;    // where the search happened (usually /canada-corporations-search)
  sessionId:   string;
  ts:          Date;
};

export async function pageviews(): Promise<Collection<PageviewDoc>> {
  return (await db()).collection<PageviewDoc>("pageviews");
}

export async function clicks(): Promise<Collection<ClickDoc>> {
  return (await db()).collection<ClickDoc>("clicks");
}

export async function searches(): Promise<Collection<SearchDoc>> {
  return (await db()).collection<SearchDoc>("searches");
}

/** Best-effort index setup. Called from the /api/track route on first use. */
let indexesEnsured = false;
export async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    const pv = await pageviews();
    await pv.createIndex({ ts: -1 });
    await pv.createIndex({ path: 1, ts: -1 });
    await pv.createIndex({ sessionId: 1 });
    const cl = await clicks();
    await cl.createIndex({ ts: -1 });
    await cl.createIndex({ path: 1, ts: -1 });
    await cl.createIndex({ sessionId: 1 });
    const sr = await searches();
    await sr.createIndex({ ts: -1 });
    await sr.createIndex({ queryLower: 1, ts: -1 });
    await sr.createIndex({ resultCount: 1, ts: -1 });
  } catch (e) {
    indexesEnsured = false;
    console.error("[analytics] failed to ensure indexes:", e);
  }
}
