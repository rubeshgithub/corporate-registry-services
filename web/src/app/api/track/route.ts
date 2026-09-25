import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/admin-auth";
import { ipHashFrom } from "@/lib/public-form-guard";
import { pageviews, clicks, searches, ensureIndexes } from "@/lib/mongo";
import { sendAlertSms } from "@/lib/sms-infobip";

/**
 * POST /api/track
 *
 * Accepts one of two event shapes:
 *
 * Pageview:
 *   { type: "pageview", path, referrer, sessionId, utm? }
 *
 * Click:
 *   { type: "click", path, target, label, sessionId }
 *
 * Deliberately no-auth — visitors are anonymous — but we filter obviously
 * junk requests (empty sessionId, admin paths, oversized payload) and cap
 * every string field.
 */

export const runtime = "nodejs";

type PageviewBody = {
  type:        "pageview";
  path:        string;
  referrer?:   string;
  sessionId:   string;
  userAgent?:  string;
  utmSource?:  string;
  utmMedium?:  string;
  utmCampaign?: string;
  fbclid?:     string;   // Facebook / Instagram click ID
  gclid?:      string;   // Google Ads click ID
  msclkid?:    string;   // Microsoft (Bing) Ads click ID
  src?:        string;   // our own ?src= attribution tag on order links
};

type ClickBody = {
  type:      "click";
  path:      string;
  target:    string;
  label?:    string;
  sessionId: string;
};

type SearchBody = {
  type:        "search";
  query:       string;
  province?:   string;
  resultCount: number;
  path:        string;
  sessionId:   string;
};

type Body = PageviewBody | ClickBody | SearchBody;

const MAX_STR = 400;

function trunc(v: unknown, max = MAX_STR): string {
  if (typeof v !== "string") return "";
  return v.length > max ? v.slice(0, max) : v;
}

function shouldIgnore(path: string): boolean {
  if (!path)                          return true;
  if (path.startsWith("/api/"))       return true;
  if (path.startsWith("/admin"))      return true;
  if (path.includes("/_next/"))       return true;
  return false;
}

/**
 * Defensive: even though the client now sends only `pathname`, historical
 * callers or third-party pings might arrive with `?fbclid=...` etc. still
 * attached. Strip everything after `?` so the path dimension stays clean.
 */
function normalizePath(path: string): string {
  const q = path.indexOf("?");
  return q >= 0 ? path.slice(0, q) : path;
}

export async function POST(req: Request) {
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  if (!body?.type || !body.sessionId || body.sessionId.length < 8) {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }
  if (shouldIgnore(trunc(body.path))) return NextResponse.json({ ok: true, ignored: true });

  await ensureIndexes();

  if (body.type === "pageview") {
    const isAdminBrowser = !!req.headers.get("cookie")?.includes(`${ADMIN_COOKIE_NAME}=`);
    const pv   = await pageviews();
    const path = normalizePath(trunc(body.path));
    const sid  = trunc(body.sessionId, 64);
    await pv.insertOne({
      path,
      referrer:    trunc(body.referrer),
      sessionId:   sid,
      userAgent:   trunc(body.userAgent, 200),
      utmSource:   trunc(body.utmSource,  100),
      utmMedium:   trunc(body.utmMedium,  100),
      utmCampaign: trunc(body.utmCampaign, 100),
      fbclid:      trunc(body.fbclid,     200),
      gclid:       trunc(body.gclid,      200),
      msclkid:     trunc(body.msclkid,    200),
      src:         trunc(body.src, 100).replace(/[^a-z0-9._-]/gi, "") || undefined,
      /* The owner browsing his own site while logged in to admin — marked so
         the journey report can set those sessions aside and they don't text. */
      admin:       isAdminBrowser || undefined,
      /* Where the request physically came from — Cloudflare's country code
         and a salted hash of the IP (never the IP itself). Two sessions
         from one hash a second apart, or a burst from one country at once,
         is a link scanner rather than two customers. */
      country:     trunc(req.headers.get("cf-ipcountry") ?? "", 4) || undefined,
      ipHash:      ipHashFrom(req) || undefined,
      ts:          new Date(),
    });
    /* Order-page arrival alert. Fires once per session per order path
     *  per hour. Look for a prior pageview by the same session on any
     *  /order/* path within the last hour — the insert we just did counts,
     *  so >1 hits means this isn't the first. Fire-and-forget SMS. */
    if (path.startsWith("/order/")) {
      void (async () => {
        try {
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
          const prior = await pv.countDocuments({
            sessionId: sid,
            path:      { $regex: "^/order/" },
            ts:        { $gte: oneHourAgo },
          });
          const ua = trunc(body.userAgent, 200);
          /* Crawlers and headless browsers run the tracker too — each used
             to text the owner as a "visitor". */
          if (prior <= 1 && !isAdminBrowser && !/bot|crawl|spider|slurp|headless|lighthouse|preview|puppeteer|playwright|selenium|python|curl|wget/i.test(ua)) {
            /* Say where they came from, so the text is actionable: the page
               they were on just before, else the external referrer. */
            const prev = await pv.find({ sessionId: sid, path: { $ne: path } }).sort({ ts: -1 }).limit(1).toArray();
            let from = prev[0]?.path ?? "";
            if (!from) {
              try { from = body.referrer ? new URL(body.referrer).host.replace(/^www\./, "") : "direct"; } catch { from = "direct"; }
            }
            const dev = /iPad|Tablet/i.test(ua) ? "tablet" : /Mobi|Android|iPhone/i.test(ua) ? "mobile" : "desktop";
            void sendAlertSms(`CRS: Visitor on ${path} from ${from} (${dev}) - session ${sid.slice(0, 6)}`.slice(0, 155));
          }
        } catch { /* SMS is fire-and-forget; failure never affects the pageview */ }
      })();
    }
    return NextResponse.json({ ok: true });
  }

  if (body.type === "click") {
    const cl = await clicks();
    await cl.insertOne({
      path:      normalizePath(trunc(body.path)),
      target:    trunc(body.target),
      label:     trunc(body.label, 120),
      sessionId: trunc(body.sessionId, 64),
      ts:        new Date(),
    });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "search") {
    const q = trunc(body.query, 200).trim();
    if (q.length < 2) return NextResponse.json({ ok: true, ignored: true });
    const sr = await searches();
    await sr.insertOne({
      query:       q,
      queryLower:  q.toLowerCase(),
      province:    trunc(body.province, 20) || "all",
      resultCount: Math.max(0, Math.floor(Number(body.resultCount) || 0)),
      path:        normalizePath(trunc(body.path)),
      sessionId:   trunc(body.sessionId, 64),
      ts:          new Date(),
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown type" }, { status: 400 });
}
