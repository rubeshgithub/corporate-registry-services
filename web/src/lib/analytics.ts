import Stripe from "stripe";
import { pageviews, clicks, searches } from "./mongo";

/**
 * Aggregate paid Stripe checkout sessions into the shapes the admin
 * dashboard renders. Stripe is the source of truth for paid revenue —
 * every session we create carries service / src / jurisdiction metadata
 * so we can slice attribution without a separate analytics pipeline.
 *
 * Not cached at the module level — pass a windowDays and the caller
 * (page.tsx) sets its own Next revalidate so the same request cycle
 * doesn't hit Stripe repeatedly.
 */

const SERVICE_LABELS: Record<string, string> = {
  "annual-return":          "Annual Return",
  "annual-return-multiple": "Annual Return (multi-year)",
  "incorporation":          "Incorporation",
  "profile-report":         "Corporate Profile Report",
  "good-standing":          "Good Standing",
  "corporate-search":       "Corporate Name Search",
  "nuans-search":           "NUANS Search",
  "change-directors":       "Director / Officer Change",
  "change-address":         "Registered Address Change",
  "voluntary-dissolution":  "Voluntary Dissolution",
  "revival":                "Corporate Revival",
};

export type OrderRow = {
  sessionId:    string;
  createdAt:    string;      // ISO
  service:      string;
  serviceLabel: string;
  amount:       number;      // dollars (from cents)
  currency:     string;
  companyName:  string;
  jurisdiction: string;
  src:          string;
  customerEmail: string;
};

export type Bucket = { key: string; label: string; count: number; amount: number };

/** Valid time-window tokens shown in the admin dashboard tab bar. */
export type WindowToken = "1h" | "today" | "7d" | "30d" | "90d" | "1y";

export const WINDOW_TOKENS: WindowToken[] = ["1h", "today", "7d", "30d", "90d", "1y"];

export type BucketMode = "5min" | "hour" | "day";

export type WindowConfig = {
  token:      WindowToken;
  sinceMs:    number;       // start of the window, JS epoch ms
  bucketMode: BucketMode;
  label:      string;       // human label, e.g. "Today (MST)"
  windowDays: number;       // rough number-of-days approximation for callers that still care
};

export type AnalyticsData = {
  windowToken:     WindowToken;
  windowLabel:     string;
  windowDays:      number;   // approximate — retained for surfaces that still expect a number
  bucketMode:      BucketMode;
  totalOrders:     number;
  totalRevenue:    number;   // dollars
  currency:        string;
  avgOrderValue:   number;
  byService:       Bucket[];
  bySrc:           Bucket[];
  byJurisdiction:  Bucket[];
  trend:           Array<{ label: string; count: number; amount: number }>;
  recent:          OrderRow[];
  fetchedAt:       string;
};

/** Format a stripe amount (cents) into dollars, rounded to 2 decimal. */
function centsToDollars(cents: number | null | undefined): number {
  if (!cents) return 0;
  return Math.round(cents) / 100;
}

/**
 * Alberta (Mountain Time) is the operator's timezone — governed-by-Alberta-law
 * per the disclaimer. Daily and hourly buckets need to align with Alberta
 * business days, not the Render/UTC server clock, otherwise "today" would
 * appear to end at 5pm local time in the winter.
 */
export const OPERATOR_TZ = "America/Edmonton";

/** Break a Date into Mountain Time parts. Uses Intl.DateTimeFormat so DST
    transitions are handled automatically. */
function inOperatorTime(d: Date): { yyyy: string; mm: string; dd: string; hh: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATOR_TZ,
    year:     "numeric",
    month:    "2-digit",
    day:      "2-digit",
    hour:     "2-digit",
    hour12:   false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { yyyy: get("year"), mm: get("month"), dd: get("day"), hh: get("hour") };
}

/** YYYY-MM-DD in Mountain Time. */
function localDate(d: Date): string {
  const { yyyy, mm, dd } = inOperatorTime(d);
  return `${yyyy}-${mm}-${dd}`;
}

/** YYYY-MM-DD HH in Mountain Time — used for hourly buckets. */
function localHour(d: Date): string {
  const { yyyy, mm, dd, hh } = inOperatorTime(d);
  return `${yyyy}-${mm}-${dd} ${hh}`;
}

/** Human hour label like "9am" or "5pm" — used on hour-bucket trend axes. */
function hourLabel(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATOR_TZ,
    hour:     "numeric",
    hour12:   true,
  }).formatToParts(d);
  return (parts.find((p) => p.type === "hour")?.value + (parts.find((p) => p.type === "dayPeriod")?.value ?? "")).toLowerCase();
}

/** Short label for a 5-minute bucket like "3:45pm". */
function minuteLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATOR_TZ,
    hour:     "numeric",
    minute:   "2-digit",
    hour12:   true,
  }).format(d).toLowerCase().replace(" ", "");
}

/** Start-of-today midnight in Mountain Time, as a JS epoch (UTC ms). */
function startOfTodayMountain(): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OPERATOR_TZ,
    hour:     "2-digit",
    minute:   "2-digit",
    second:   "2-digit",
    hour12:   false,
  }).formatToParts(now);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  const secondsIntoDay = get("hour") * 3600 + get("minute") * 60 + get("second");
  return now.getTime() - secondsIntoDay * 1000;
}

/** Turn a token into a concrete window config. */
export function resolveWindow(token: WindowToken): WindowConfig {
  const now = Date.now();
  const day = 24 * 3600 * 1000;
  switch (token) {
    case "1h":    return { token, sinceMs: now - 3600 * 1000,        bucketMode: "5min", label: "Past 1 hour",     windowDays: 1 / 24 };
    case "today": return { token, sinceMs: startOfTodayMountain(),   bucketMode: "hour", label: "Today (MST)",     windowDays: 1 };
    case "7d":    return { token, sinceMs: now - 7   * day,          bucketMode: "day",  label: "Last 7 days",     windowDays: 7 };
    case "30d":   return { token, sinceMs: now - 30  * day,          bucketMode: "day",  label: "Last 30 days",    windowDays: 30 };
    case "90d":   return { token, sinceMs: now - 90  * day,          bucketMode: "day",  label: "Last 90 days",    windowDays: 90 };
    case "1y":    return { token, sinceMs: now - 365 * day,          bucketMode: "day",  label: "Last 1 year",     windowDays: 365 };
  }
}

/** Parse a raw ?window= param string into a WindowToken, defaulting safely. */
export function parseWindowToken(raw: string | null | undefined): WindowToken {
  const t = (raw ?? "").trim().toLowerCase();
  return (WINDOW_TOKENS as string[]).includes(t) ? (t as WindowToken) : "30d";
}

/** Get every paid Stripe checkout session in the window. Paginates until
 *  we hit a session older than the window (Stripe returns newest-first). */
async function listPaidSessions(stripe: Stripe, sinceUnix: number): Promise<Stripe.Checkout.Session[]> {
  const out: Stripe.Checkout.Session[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 20; page++) {  // hard cap ~2,000 sessions
    const res: Stripe.ApiList<Stripe.Checkout.Session> = await stripe.checkout.sessions.list({
      limit:          100,
      starting_after: startingAfter,
      created:        { gte: sinceUnix },
    });
    for (const s of res.data) {
      if (s.payment_status === "paid" && (s.amount_total ?? 0) > 0) out.push(s);
    }
    if (!res.has_more) break;
    startingAfter = res.data[res.data.length - 1]?.id;
    if (!startingAfter) break;
  }
  return out;
}

function bucketize(rows: OrderRow[], keyOf: (r: OrderRow) => { key: string; label: string }): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    const { key, label } = keyOf(r);
    const cur = map.get(key) ?? { key, label, count: 0, amount: 0 };
    cur.count  += 1;
    cur.amount += r.amount;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

/**
 * Build a chronological list of empty buckets for the trend line — one per
 * unit in the window, so days with zero orders still show a point. Returns
 * both a Map keyed by the bucket key and the ordered [key, label] pairs so
 * we can emit stable labels.
 */
function buildEmptyBuckets(cfg: WindowConfig): { map: Map<string, { count: number; amount: number }>; order: Array<{ key: string; label: string }> } {
  const now = Date.now();
  const map: Map<string, { count: number; amount: number }> = new Map();
  const order: Array<{ key: string; label: string }> = [];

  if (cfg.bucketMode === "5min") {
    // 12 five-minute buckets, ending at now.
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now - i * 5 * 60 * 1000);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}-${Math.floor(d.getUTCMinutes() / 5) * 5}`;
      map.set(key, { count: 0, amount: 0 });
      order.push({ key, label: minuteLabel(d) });
    }
    return { map, order };
  }

  if (cfg.bucketMode === "hour") {
    // From cfg.sinceMs (start of today MST) to now, one bucket per hour.
    // Snap sinceMs to the top of its Mountain-Time hour to avoid a partial
    // leading bucket that skews the y-axis.
    const first = new Date(cfg.sinceMs);
    let cursor = first.getTime();
    while (cursor <= now) {
      const d = new Date(cursor);
      const key = localHour(d);
      if (!map.has(key)) {
        map.set(key, { count: 0, amount: 0 });
        order.push({ key, label: hourLabel(d) });
      }
      cursor += 3600 * 1000;
    }
    return { map, order };
  }

  // Daily buckets.
  const days = Math.max(1, Math.round(cfg.windowDays));
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 3600 * 1000);
    const key = localDate(d);
    map.set(key, { count: 0, amount: 0 });
    order.push({ key, label: key.slice(5) }); // "MM-DD"
  }
  return { map, order };
}

/** Map an order timestamp into the bucket-key used by buildEmptyBuckets for the given mode. */
function bucketKeyFor(mode: BucketMode, when: Date): string {
  if (mode === "5min") {
    const d = when;
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}-${d.getUTCHours()}-${Math.floor(d.getUTCMinutes() / 5) * 5}`;
  }
  if (mode === "hour") return localHour(when);
  return localDate(when);
}

export async function getAnalyticsData(token: WindowToken = "30d"): Promise<AnalyticsData> {
  const cfg = resolveWindow(token);
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return emptyAnalytics(cfg);

  const stripe    = new Stripe(key);
  const sinceUnix = Math.floor(cfg.sinceMs / 1000);
  const sessions  = await listPaidSessions(stripe, sinceUnix);

  const rows: OrderRow[] = sessions.map((s) => {
    const m = s.metadata ?? {};
    const service = m.service ?? "unknown";
    return {
      sessionId:    s.id,
      createdAt:    new Date(s.created * 1000).toISOString(),
      service,
      serviceLabel: SERVICE_LABELS[service] ?? service,
      amount:       centsToDollars(s.amount_total),
      currency:     (s.currency ?? "cad").toUpperCase(),
      companyName:  m.company_name ?? m.proposed_name ?? "—",
      jurisdiction: m.jurisdiction ?? "—",
      src:          m.src ?? "direct",
      customerEmail: s.customer_details?.email ?? "—",
    };
  });

  const totalOrders  = rows.length;
  const totalRevenue = rows.reduce((sum, r) => sum + r.amount, 0);
  const currency     = rows[0]?.currency ?? "CAD";

  const { map: bucketMap, order: bucketOrder } = buildEmptyBuckets(cfg);
  for (const r of rows) {
    const k = bucketKeyFor(cfg.bucketMode, new Date(r.createdAt));
    const b = bucketMap.get(k);
    if (b) { b.count += 1; b.amount += r.amount; }
  }
  const trend = bucketOrder.map(({ key, label }) => ({
    label,
    ...(bucketMap.get(key) ?? { count: 0, amount: 0 }),
  }));

  return {
    windowToken:    cfg.token,
    windowLabel:    cfg.label,
    windowDays:     cfg.windowDays,
    bucketMode:     cfg.bucketMode,
    totalOrders,
    totalRevenue:   Math.round(totalRevenue * 100) / 100,
    currency,
    avgOrderValue:  totalOrders ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
    byService:      bucketize(rows, (r) => ({ key: r.service,      label: r.serviceLabel })),
    bySrc:          bucketize(rows, (r) => ({ key: r.src,          label: prettySrc(r.src) })),
    byJurisdiction: bucketize(rows, (r) => ({ key: r.jurisdiction, label: r.jurisdiction })),
    trend,
    recent:         rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 25),
    fetchedAt:      new Date().toISOString(),
  };
}

function emptyAnalytics(cfg: WindowConfig): AnalyticsData {
  return {
    windowToken:    cfg.token,
    windowLabel:    cfg.label,
    windowDays:     cfg.windowDays,
    bucketMode:     cfg.bucketMode,
    totalOrders:    0,
    totalRevenue:   0,
    currency:       "CAD",
    avgOrderValue:  0,
    byService:      [],
    bySrc:          [],
    byJurisdiction: [],
    trend:          [],
    recent:         [],
    fetchedAt:      new Date().toISOString(),
  };
}

/* ─────────────────────── Traffic + funnel data ─────────────────────── */

export type TrafficData = {
  windowToken:      WindowToken;
  windowLabel:      string;
  windowDays:       number;
  totalPageviews:   number;
  uniqueSessions:   number;
  topPages:         Array<{ path: string; views: number; sessions: number }>;
  orderPageFunnel:  Array<{ path: string; views: number; sessions: number; clicksToPay: number }>;
  articleCtr:       Array<{ path: string; views: number; ctaClicks: number; ctr: number }>;
  // Registry search intelligence — what people type into /canada-corporations-search
  totalSearches:     number;
  zeroResultRate:    number;   // % of searches that returned 0 results
  topSearches:       Array<{ query: string; count: number; avgResults: number; provinces: string[] }>;
  zeroResultSearches: Array<{ query: string; count: number; provinces: string[] }>;
  searchesByProvince: Array<{ province: string; count: number; zeroResults: number }>;
  fetchedAt:        string;
};

/**
 * Traffic-side aggregations powered by the pageviews + clicks collections.
 * Uses MongoDB aggregation pipelines so we don't stream every event into
 * memory. Returns empty shapes when MONGODB_URI isn't configured so the
 * dashboard renders gracefully in setups without a Mongo cluster.
 */
export async function getTrafficData(token: WindowToken = "30d"): Promise<TrafficData> {
  const cfg = resolveWindow(token);
  if (!process.env.MONGODB_URI) return emptyTraffic(cfg);
  const since = new Date(cfg.sinceMs);

  const pv  = await pageviews();
  const cl  = await clicks();

  /* Total pageviews + unique sessions in the window. */
  const [totals] = await pv.aggregate<{ views: number; sessions: number }>([
    { $match: { ts: { $gte: since } } },
    {
      $group: {
        _id: null,
        views:      { $sum: 1 },
        sessionSet: { $addToSet: "$sessionId" },
      },
    },
    { $project: { views: 1, sessions: { $size: "$sessionSet" } } },
  ]).toArray();

  const totalPageviews = totals?.views    ?? 0;
  const uniqueSessions = totals?.sessions ?? 0;

  /* Top pages by view count. */
  const topPagesRaw = await pv.aggregate<{ _id: string; views: number; sessions: number }>([
    { $match: { ts: { $gte: since } } },
    {
      $group: {
        _id:        "$path",
        views:      { $sum: 1 },
        sessionSet: { $addToSet: "$sessionId" },
      },
    },
    { $project: { views: 1, sessions: { $size: "$sessionSet" } } },
    { $sort: { views: -1 } },
    { $limit: 20 },
  ]).toArray();
  const topPages = topPagesRaw.map((r) => ({ path: r._id, views: r.views, sessions: r.sessions }));

  /* Order-page funnel: for every /order/* page, count views + unique sessions
     + "clicks to pay" (approximated by anchor clicks going to /order/*
     targets, but here we care about /order/* pageviews). */
  const orderPagesRaw = await pv.aggregate<{ _id: string; views: number; sessions: number }>([
    { $match: { ts: { $gte: since }, path: { $regex: "^/order/" } } },
    {
      $group: {
        _id:        { $arrayElemAt: [{ $split: ["$path", "?"] }, 0] },
        views:      { $sum: 1 },
        sessionSet: { $addToSet: "$sessionId" },
      },
    },
    { $project: { views: 1, sessions: { $size: "$sessionSet" } } },
    { $sort: { views: -1 } },
  ]).toArray();

  const orderPageFunnel = orderPagesRaw.map((r) => ({
    path:         r._id,
    views:        r.views,
    sessions:     r.sessions,
    clicksToPay:  0, // populated below if we can find matching Stripe rows
  }));

  /* Article CTR: for content pages, how many of the visitors clicked into
     an order page? Groups by article path, counts pageviews and matching
     clicks that occurred on that path. */
  const articleViews = await pv.aggregate<{ _id: string; views: number }>([
    { $match: { ts: { $gte: since }, path: { $regex: "^/(articles|annual-return|incorporation|profile-reports|good-standing|minute-books|guides)/" } } },
    {
      $group: {
        _id:   { $arrayElemAt: [{ $split: ["$path", "?"] }, 0] },
        views: { $sum: 1 },
      },
    },
    { $sort: { views: -1 } },
    { $limit: 25 },
  ]).toArray();

  const clickCountsByPath = new Map<string, number>();
  if (articleViews.length > 0) {
    const paths = articleViews.map((v) => v._id);
    const clicksRaw = await cl.aggregate<{ _id: string; count: number }>([
      { $match: { ts: { $gte: since }, path: { $in: paths }, target: { $regex: "^/order/" } } },
      { $group: { _id: "$path", count: { $sum: 1 } } },
    ]).toArray();
    for (const r of clicksRaw) clickCountsByPath.set(r._id, r.count);
  }
  const articleCtr = articleViews.map((v) => ({
    path:      v._id,
    views:     v.views,
    ctaClicks: clickCountsByPath.get(v._id) ?? 0,
    ctr:       v.views ? Math.round(((clickCountsByPath.get(v._id) ?? 0) / v.views) * 1000) / 10 : 0,
  }));

  /* Registry search intelligence — what visitors type into /canada-corporations-search */
  const sr = await searches();
  const searchTotals = await sr.aggregate<{ total: number; zero: number }>([
    { $match: { ts: { $gte: since } } },
    {
      $group: {
        _id:   null,
        total: { $sum: 1 },
        zero:  { $sum: { $cond: [{ $eq: ["$resultCount", 0] }, 1, 0] } },
      },
    },
  ]).toArray();
  const totalSearches  = searchTotals[0]?.total ?? 0;
  const zeroResultRate = totalSearches ? Math.round((searchTotals[0]!.zero / totalSearches) * 1000) / 10 : 0;

  const topSearchesRaw = await sr.aggregate<{ _id: string; count: number; avg: number; provinces: string[] }>([
    { $match: { ts: { $gte: since } } },
    {
      $group: {
        _id:       "$queryLower",
        count:     { $sum: 1 },
        avg:       { $avg: "$resultCount" },
        provinces: { $addToSet: "$province" },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 25 },
  ]).toArray();
  const topSearches = topSearchesRaw.map((r) => ({
    query:      r._id,
    count:      r.count,
    avgResults: Math.round(r.avg * 10) / 10,
    provinces:  r.provinces.filter((p) => p).sort(),
  }));

  const zeroResultRaw = await sr.aggregate<{ _id: string; count: number; provinces: string[] }>([
    { $match: { ts: { $gte: since }, resultCount: 0 } },
    {
      $group: {
        _id:       "$queryLower",
        count:     { $sum: 1 },
        provinces: { $addToSet: "$province" },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 25 },
  ]).toArray();
  const zeroResultSearches = zeroResultRaw.map((r) => ({
    query:     r._id,
    count:     r.count,
    provinces: r.provinces.filter((p) => p).sort(),
  }));

  const byProvinceRaw = await sr.aggregate<{ _id: string; count: number; zero: number }>([
    { $match: { ts: { $gte: since } } },
    {
      $group: {
        _id:   "$province",
        count: { $sum: 1 },
        zero:  { $sum: { $cond: [{ $eq: ["$resultCount", 0] }, 1, 0] } },
      },
    },
    { $sort: { count: -1 } },
  ]).toArray();
  const searchesByProvince = byProvinceRaw.map((r) => ({
    province:    r._id || "all",
    count:       r.count,
    zeroResults: r.zero,
  }));

  return {
    windowToken:  cfg.token,
    windowLabel:  cfg.label,
    windowDays:   cfg.windowDays,
    totalPageviews,
    uniqueSessions,
    topPages,
    orderPageFunnel,
    articleCtr,
    totalSearches,
    zeroResultRate,
    topSearches,
    zeroResultSearches,
    searchesByProvince,
    fetchedAt: new Date().toISOString(),
  };
}

function emptyTraffic(cfg: WindowConfig): TrafficData {
  return {
    windowToken:  cfg.token,
    windowLabel:  cfg.label,
    windowDays:   cfg.windowDays,
    totalPageviews:     0,
    uniqueSessions:     0,
    topPages:           [],
    orderPageFunnel:    [],
    articleCtr:         [],
    totalSearches:      0,
    zeroResultRate:     0,
    topSearches:        [],
    zeroResultSearches: [],
    searchesByProvince: [],
    fetchedAt:          new Date().toISOString(),
  };
}

/** Turn compact attribution codes into human labels. article-<slug>,
 *  home-services, wizard, corp-search, direct, section-annual-return. */
function prettySrc(src: string): string {
  if (src === "direct")              return "Direct / unknown";
  if (src === "wizard")              return "Homepage wizard";
  if (src === "home-services")       return "Homepage services grid";
  if (src === "corp-search")         return "Canada Corporations Search";
  if (src.startsWith("section-"))    return `Section index (${src.replace("section-", "")})`;
  if (src.startsWith("article-"))    return `Article: ${src.replace("article-", "").replace(/-/g, " ")}`;
  return src;
}
