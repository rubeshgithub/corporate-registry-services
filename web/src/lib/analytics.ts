import Stripe from "stripe";

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

export type AnalyticsData = {
  windowDays:      number;
  totalOrders:     number;
  totalRevenue:    number;   // dollars
  currency:        string;
  avgOrderValue:   number;
  byService:       Bucket[];
  bySrc:           Bucket[];
  byJurisdiction:  Bucket[];
  dailyRevenue:    Array<{ date: string; count: number; amount: number }>;
  recent:          OrderRow[];
  fetchedAt:       string;
};

/** Format a stripe amount (cents) into dollars, rounded to 2 decimal. */
function centsToDollars(cents: number | null | undefined): number {
  if (!cents) return 0;
  return Math.round(cents) / 100;
}

/** Local YYYY-MM-DD for a Date, in the site's canonical Canadian time zone.
 *  Kept naive on purpose — dashboard shows local business days, not UTC. */
function localDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

export async function getAnalyticsData(windowDays = 30): Promise<AnalyticsData> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return emptyAnalytics(windowDays);
  }
  const stripe    = new Stripe(key);
  const sinceUnix = Math.floor((Date.now() - windowDays * 24 * 3600 * 1000) / 1000);
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

  // Build day buckets so the trend line has a point for every day in the
  // window, not just days that had orders (keeps sparklines honest).
  const dailyMap = new Map<string, { count: number; amount: number }>();
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    dailyMap.set(localDate(d), { count: 0, amount: 0 });
  }
  for (const r of rows) {
    const d = localDate(new Date(r.createdAt));
    const bucket = dailyMap.get(d);
    if (bucket) {
      bucket.count  += 1;
      bucket.amount += r.amount;
    }
  }
  const dailyRevenue = [...dailyMap.entries()].map(([date, v]) => ({ date, ...v }));

  return {
    windowDays,
    totalOrders,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    currency,
    avgOrderValue: totalOrders ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
    byService:     bucketize(rows, (r) => ({ key: r.service,      label: r.serviceLabel })),
    bySrc:         bucketize(rows, (r) => ({ key: r.src,          label: prettySrc(r.src) })),
    byJurisdiction: bucketize(rows, (r) => ({ key: r.jurisdiction, label: r.jurisdiction })),
    dailyRevenue,
    recent:        rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 25),
    fetchedAt:     new Date().toISOString(),
  };
}

function emptyAnalytics(windowDays: number): AnalyticsData {
  return {
    windowDays,
    totalOrders:     0,
    totalRevenue:    0,
    currency:        "CAD",
    avgOrderValue:   0,
    byService:       [],
    bySrc:           [],
    byJurisdiction:  [],
    dailyRevenue:    [],
    recent:          [],
    fetchedAt:       new Date().toISOString(),
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
