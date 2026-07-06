import { NextResponse } from "next/server";
import { pageviews, clicks, ensureIndexes } from "@/lib/mongo";

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
};

type ClickBody = {
  type:      "click";
  path:      string;
  target:    string;
  label?:    string;
  sessionId: string;
};

type Body = PageviewBody | ClickBody;

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

export async function POST(req: Request) {
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  if (!body?.type || !body.sessionId || body.sessionId.length < 8) {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }
  if (shouldIgnore(trunc(body.path))) return NextResponse.json({ ok: true, ignored: true });

  await ensureIndexes();

  if (body.type === "pageview") {
    const pv = await pageviews();
    await pv.insertOne({
      path:        trunc(body.path),
      referrer:    trunc(body.referrer),
      sessionId:   trunc(body.sessionId, 64),
      userAgent:   trunc(body.userAgent, 200),
      utmSource:   trunc(body.utmSource,  100),
      utmMedium:   trunc(body.utmMedium,  100),
      utmCampaign: trunc(body.utmCampaign, 100),
      ts:          new Date(),
    });
    return NextResponse.json({ ok: true });
  }

  if (body.type === "click") {
    const cl = await clicks();
    await cl.insertOne({
      path:      trunc(body.path),
      target:    trunc(body.target),
      label:     trunc(body.label, 120),
      sessionId: trunc(body.sessionId, 64),
      ts:        new Date(),
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown type" }, { status: 400 });
}
