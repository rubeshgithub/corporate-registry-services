import { type Collection } from "mongodb";
import { MongoClient, type Db } from "mongodb";

/**
 * MongoDB connection helpers for the `crs` DB (the registrar corpus —
 * 1M+ companies + 1.4M events, loaded by scripts/import_registrar.mjs).
 *
 * Kept separate from the `crs_analytics` DB (pageviews/clicks/orders)
 * because the two workloads have different access patterns and different
 * durability requirements.
 *
 * Shares the same Atlas cluster and MONGODB_URI as everything else — just
 * a different database name inside the cluster.
 */

type GlobalWithMongo = typeof globalThis & { _crsRegistrarMongo?: MongoClient };
const g = globalThis as GlobalWithMongo;

async function client(): Promise<MongoClient> {
  /* Lazy-read env so Next.js hot-reload of .env picks up new values on
     the next request instead of requiring a full server restart. */
  const uri = process.env.MONGODB_URI ?? "";
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!g._crsRegistrarMongo) {
    g._crsRegistrarMongo = new MongoClient(uri, { maxPoolSize: 5 });
    await g._crsRegistrarMongo.connect();
  }
  return g._crsRegistrarMongo;
}

export async function registrarDb(): Promise<Db> {
  const c = await client();
  const dbName = process.env.REGISTRAR_DB_NAME ?? "crs";
  return c.db(dbName);
}

/* ── typed docs ────────────────────────────────────────────── */

export type CompanyDoc = {
  _id:      string;                        // corp number, or "name:<NORM>" for name-only shells
  name:     string;
  nameNorm: string;
  entityType?: string;
  slug:     string;
  status: {
    derived:        string;
    lastEventDate:  Date | null;
    lastIssue:      string;
    lastIssueDate?: Date | null;
    live?:          string | null;         // populated by live CBR fetches
    liveNotes?:     string | null;
    liveCheckedAt?: Date | null;
  };
  /** Earliest event date we've ever recorded for this corp — treated as
   *  its incorporation / registration date for filtering + anniversary
   *  computation. Set by scripts/backfill_first_event_date.mjs (one-time)
   *  and preserved / narrowed by import_registrar.mjs on future ingests. */
  firstEventDate?: Date | null;
  address?: {
    full:   string;
    city:   string;
    postal: string;
  };
  contact?: {
    email:          string | null;
    emailSourceUrl: string | null;
    website:        string | null;
    phone:          string | null;
    enrichedAt:     Date | null;
    enrichStatus:   "pending" | "found" | "phone_or_web_only" | "not_found" | "skip_numbered" | "bounced" | "unsubscribed";
    /** Set by the unsubscribe flow — denormalized from the source-of-
     *  truth outreach_suppression collection so the /admin/companies
     *  filter can badge without a join. */
    suppressed?:    boolean;
    suppressedAt?:  Date | null;
  };
  outreach?: {
    lastEmailAt:  Date | null;
    sequenceStep: number;
    replied:      boolean;
    orderId:      string | null;
  };
};

export type EventDoc = {
  corpNumber:      string;
  companyNameNorm: string;
  event:           string;
  section:         string;
  eventDate:       Date;
  issue:           string;
  issueDate?:      Date;
  address:         string;
  city:            string;
  postal:          string;
  entityType?:     string;
  oldName?:        string;
  oldNameNorm?:    string;
  predecessors?:   string[];
};

/** TTL-backed cache for live API responses (CBR / Places).
 *  _id format: "<source>:<corpNumber>", e.g., "cbr:2028192736" or "places:2028192736"  */
export type LookupDoc = {
  _id:       string;
  source:    "cbr" | "places" | "crawl";
  payload:   unknown;
  fetchedAt: Date;
};

export async function companies(): Promise<Collection<CompanyDoc>> {
  return (await registrarDb()).collection<CompanyDoc>("companies");
}
export async function events(): Promise<Collection<EventDoc>> {
  return (await registrarDb()).collection<EventDoc>("events");
}
export async function lookups(): Promise<Collection<LookupDoc>> {
  return (await registrarDb()).collection<LookupDoc>("lookups");
}

/** Best-effort TTL index for the lookups cache. Idempotent — first call
 *  in the app lifetime creates it, subsequent calls no-op. */
let lookupsIndexEnsured = false;
export async function ensureLookupsIndex(): Promise<void> {
  if (lookupsIndexEnsured) return;
  lookupsIndexEnsured = true;
  try {
    const c = await lookups();
    /* Different TTLs per source, but Mongo TTL is per-index. We store the
       longest max lifetime (90 days for Places) and let application-level
       code do finer-grained freshness gates on top. */
    await c.createIndex({ fetchedAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600, name: "ttl_fetched" });
  } catch (e) {
    lookupsIndexEnsured = false;
    console.error("[registrar-mongo] failed to ensure lookups TTL index:", e);
  }
}
