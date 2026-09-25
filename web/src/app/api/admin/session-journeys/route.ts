import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { pageviews, clicks, searches } from "@/lib/mongo";
import { orderDrafts } from "@/lib/order-drafts-mongo";

/**
 * GET /api/admin/session-journeys?path=/order/annual-return&hours=24
 *
 * Why did people reach an order page and not pay? For every session that
 * viewed `path` in the window, reconstruct what happened: where they came
 * from (landing page, referrer, ad click ids), each page / click / search in
 * order with elapsed time, what they did on the order form (company picked?
 * name / email / phone typed? — booleans only, no contact values), whether
 * they reached /order/thanks, and a one-line verdict.
 *
 * Crawlers and headless browsers run our tracker too (and each fires the
 * order-page SMS), so sessions are flagged by user agent rather than hidden.
 *
 * Admin cookie required.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|python|curl|wget|axios|node-fetch|go-http|java\/|phantom|puppeteer|playwright|selenium|scrapy|monitor|uptime|pingdom/i;

function device(ua: string): string {
  if (!ua) return "unknown";
  if (BOT_UA.test(ua)) return "bot";
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
  return "desktop";
}

function host(url: string): string {
  if (!url) return "(direct)";
  try { return new URL(url).host.replace(/^www\./, ""); } catch { return url.slice(0, 60); }
}

function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `+${s}s` : `+${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url   = new URL(req.url);
  const path  = (url.searchParams.get("path") || "/order/annual-return").slice(0, 120);
  const hours = Math.min(Math.max(Number(url.searchParams.get("hours")) || 24, 1), 24 * 14);
  const now   = Date.now();
  const since = new Date(now - hours * 3600_000);
  /* Look back further than the window for each session's arrival — someone
     may have landed on an article an hour before reaching the order page. */
  const lookback = new Date(since.getTime() - 6 * 3600_000);

  const pv = await pageviews();
  const sessionIds = (await pv.distinct("sessionId", { path, ts: { $gte: since } })).slice(0, 80) as string[];

  const [views, clickRows, searchRows, draftRows] = await Promise.all([
    pv.find({ sessionId: { $in: sessionIds }, ts: { $gte: lookback } }).sort({ ts: 1 }).toArray(),
    (await clicks()).find({ sessionId: { $in: sessionIds }, ts: { $gte: lookback } }).sort({ ts: 1 }).toArray(),
    (await searches()).find({ sessionId: { $in: sessionIds }, ts: { $gte: lookback } }).sort({ ts: 1 }).toArray(),
    (await orderDrafts()).find({ sessionId: { $in: sessionIds } }).toArray(),
  ]);

  const sessions = sessionIds.map((sid) => {
    const v  = views.filter((r) => r.sessionId === sid);
    const c  = clickRows.filter((r) => r.sessionId === sid);
    const sr = searchRows.filter((r) => r.sessionId === sid);
    const d  = draftRows.filter((r) => r.sessionId === sid);
    const first = v[0];
    const t0 = first ? first.ts.getTime() : now;
    const ua = first?.userAgent ?? "";

    const events = [
      ...v.map((r)  => ({ ts: r.ts.getTime(), kind: "view",   detail: r.path + (r.referrer && r === first ? `  ← ${host(r.referrer)}` : "") })),
      ...c.map((r)  => ({ ts: r.ts.getTime(), kind: "click",  detail: `${r.label || "(no label)"} → ${r.target}`.slice(0, 160) })),
      ...sr.map((r) => ({ ts: r.ts.getTime(), kind: "search", detail: `"${r.query}" [${r.province}] → ${r.resultCount} result${r.resultCount === 1 ? "" : "s"} on ${r.path}` })),
    ].sort((a, b) => a.ts - b.ts).map((e) => ({ at: elapsed(e.ts - t0), kind: e.kind, detail: e.detail }));

    const orderViews   = v.filter((r) => r.path === path);
    const firstOrder   = orderViews[0]?.ts.getTime() ?? now;
    const afterOrder   = [...v, ...c, ...sr].map((r) => r.ts.getTime()).filter((t) => t > firstOrder);
    const secondsOnOrder = afterOrder.length ? Math.round((Math.max(...afterOrder) - firstOrder) / 1000) : 0;
    const paid         = v.some((r) => r.path.startsWith("/order/thanks"));
    const beforeOrder  = v.filter((r) => r.ts.getTime() < firstOrder);
    const cameFrom     = beforeOrder.length ? beforeOrder[beforeOrder.length - 1].path : "(landed directly on the order page)";

    const draft = d.map((x) => ({
      service:     x.service,
      company:     x.company?.name ? `${x.company.name} (${x.company.jurisdiction ?? x.company.provinceKey ?? "?"})` : null,
      typedName:   !!x.contact?.name,
      typedEmail:  !!x.contact?.email,
      typedPhone:  !!x.contact?.phone,
      etransfer:   !!x.etransferRequestedAt,
      lastTouch:   x.updatedAt,
    }));

    const dev = device(ua);
    const verdict =
      dev === "bot"                                                  ? "bot / crawler (fired the SMS, not a person)" :
      paid                                                           ? "paid" :
      draft.some((x) => x.typedEmail || x.typedPhone || x.typedName) ? "typed contact details, did not pay" :
      draft.some((x) => x.company)                                   ? "picked a company, typed nothing, left" :
      c.some((x) => x.path === path) || sr.some((x) => x.path === path) ? "interacted on the order page, no company picked" :
      secondsOnOrder <= 10 && orderViews.length === 1                ? "bounced from the order page (no interaction)" :
                                                                       "viewed the order page, no interaction";

    return {
      session:   sid.slice(0, 6),
      firstSeen: first?.ts ?? null,
      device:    dev,
      userAgent: ua.slice(0, 140),
      landing: {
        path:      first?.path ?? null,
        referrer:  host(first?.referrer ?? ""),
        utm:       [first?.utmSource, first?.utmMedium, first?.utmCampaign].filter(Boolean).join(" / ") || null,
        adClick:   first?.gclid ? "google-ads" : first?.msclkid ? "bing-ads" : first?.fbclid ? "facebook" : null,
      },
      cameToOrderFrom: cameFrom,
      orderPageViews:  orderViews.length,
      secondsAfterOrderPage: secondsOnOrder,
      searches: sr.map((r) => ({ query: r.query, province: r.province, results: r.resultCount, on: r.path })),
      draft,
      paid,
      verdict,
      journey: events.slice(-40),
    };
  });

  const tally: Record<string, number> = {};
  for (const s of sessions) tally[s.verdict] = (tally[s.verdict] ?? 0) + 1;
  const from: Record<string, number> = {};
  for (const s of sessions) if (s.device !== "bot") from[s.cameToOrderFrom] = (from[s.cameToOrderFrom] ?? 0) + 1;

  return NextResponse.json({
    path,
    window: { hours, since },
    sessions: sessions.length,
    verdicts: tally,
    humanSessionsCameFrom: from,
    detail: sessions.sort((a, b) => +new Date(b.firstSeen ?? 0) - +new Date(a.firstSeen ?? 0)),
  });
}
