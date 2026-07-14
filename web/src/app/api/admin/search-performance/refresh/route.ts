import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { fetchTopPages, fetchTopQueries, fetchPageQueryJoin } from "@/lib/gsc-api";
import { gscSnapshots, type GscSnapshot, type PageRow, type QueryRow, type PageQueryRow } from "@/lib/gsc-mongo";

/**
 * POST /api/admin/search-performance/refresh?window=7
 *
 * Pulls fresh GSC data for the requested window (default 7 days, max 90),
 * ending on GSC's most-recent-available date (usually today - 2 or 3 days
 * because GSC lags by 2-3 days for finalized counts). Persists as a single
 * snapshot document that the dashboard queries as a whole.
 *
 * Auth-gated. Can also be triggered by a Render cron by passing the
 * `Authorization: Bearer <ADMIN_CRON_SECRET>` header instead of the admin
 * session cookie — useful for weekly automated pulls.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.ADMIN_CRON_SECRET;
const MAX_WINDOW  = 90;

/** GSC data is finalized ~2-3 days after the fact. Query from 3 days ago
 *  back N days to make sure counts are stable. */
function computeDateRange(windowDays: number): { start: string; end: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 3);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (windowDays - 1));
  return {
    start: start.toISOString().slice(0, 10),
    end:   end.toISOString().slice(0, 10),
  };
}

export async function POST(req: Request) {
  /* Auth: admin session cookie OR cron secret bearer token */
  const authed = await isAdminAuthenticated();
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const cronAllowed = !!CRON_SECRET && bearer === CRON_SECRET;
  if (!authed && !cronAllowed) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  const url = new URL(req.url);
  const windowDays = Math.min(MAX_WINDOW, Math.max(1, parseInt(url.searchParams.get("window") ?? "7", 10) || 7));
  const range = computeDateRange(windowDays);

  try {
    /* Fire the three queries in parallel — different dimension sets, so
       GSC treats them as separate calls but they're independent. */
    const [pagesRaw, queriesRaw, pageQueriesRaw] = await Promise.all([
      fetchTopPages(range.start, range.end, 500),
      fetchTopQueries(range.start, range.end, 1000),
      fetchPageQueryJoin(range.start, range.end, 5000),
    ]);

    const pages: PageRow[] = pagesRaw.map((r) => ({
      path:        r.keys?.[0] ?? "",
      clicks:      r.clicks,
      impressions: r.impressions,
      ctr:         r.ctr,
      position:    r.position,
    })).filter((r) => r.path);

    const queries: QueryRow[] = queriesRaw.map((r) => ({
      query:       r.keys?.[0] ?? "",
      clicks:      r.clicks,
      impressions: r.impressions,
      ctr:         r.ctr,
      position:    r.position,
    })).filter((r) => r.query);

    const pageQueries: PageQueryRow[] = pageQueriesRaw.map((r) => ({
      path:        r.keys?.[0] ?? "",
      query:       r.keys?.[1] ?? "",
      clicks:      r.clicks,
      impressions: r.impressions,
      ctr:         r.ctr,
      position:    r.position,
    })).filter((r) => r.path && r.query);

    const now = new Date();
    const snapshot: GscSnapshot = {
      _id:        now.toISOString().slice(0, 10),
      pulledAt:   now,
      rangeStart: range.start,
      rangeEnd:   range.end,
      windowDays,
      pages,
      queries,
      pageQueries,
    };

    /* Upsert — running multiple pulls the same day just refreshes today's
       snapshot rather than piling up dups. */
    const col = await gscSnapshots();
    await col.replaceOne({ _id: snapshot._id }, snapshot, { upsert: true });

    return NextResponse.json({
      ok:          true,
      snapshotId:  snapshot._id,
      range,
      windowDays,
      counts:      { pages: pages.length, queries: queries.length, pageQueries: pageQueries.length },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Refresh failed.";
    console.error("[gsc/refresh] error:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
