import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { searchLeads, ensureSearchLeadIndexes } from "@/lib/search-leads-mongo";
import { isSuppressed } from "@/lib/outreach-mongo";
import { sendOutreach } from "@/lib/outreach-ses";

/**
 * POST /api/notify/search-lead
 *
 * Public soft email capture from /canada-corporations-search results.
 * Validate → dedupe on (email, query) within 24 h → store in `search_leads`
 * → fire one SES confirmation with the re-run link + pricing. No ops
 * notification: this is passive interest, not a booking.
 *
 * Suppressed addresses are silently accepted (no error surface to bots) —
 * the row is skipped and no email is sent.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL   = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.corporateregistryservices.ca";
const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEDUPE_MS  = 24 * 60 * 60 * 1000;
const MAX_QUERY  = 200;

const PROV_LABEL: Record<string, string> = {
  all: "any Canadian jurisdiction", bc: "British Columbia", ab: "Alberta",
  on: "Ontario", federal: "Federal", mb: "Manitoba", sk: "Saskatchewan",
  ns: "Nova Scotia", nb: "New Brunswick", nl: "Newfoundland and Labrador",
  pe: "Prince Edward Island", nt: "Northwest Territories", yt: "Yukon", nu: "Nunavut",
};

type Body = {
  email?:       string;
  query?:       string;
  province?:    string;
  resultCount?: number;
  path?:        string;
  sessionId?:   string;
};

function ipHashFromRequest(req: Request): string {
  const raw = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "").split(",")[0]?.trim() ?? "";
  if (!raw) return "";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export async function POST(req: Request) {
  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const email    = String(body.email ?? "").trim().toLowerCase();
  const query    = String(body.query ?? "").trim().slice(0, MAX_QUERY);
  const province = String(body.province ?? "all").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (query.length < 2)      return NextResponse.json({ error: "Search query is missing." }, { status: 400 });

  if (await isSuppressed(email)) {
    /* Don't reveal suppression state — return the same success shape */
    return NextResponse.json({ ok: true, message: "Saved. Watch your inbox." });
  }

  await ensureSearchLeadIndexes();
  const col = await searchLeads();
  const now = new Date();

  const dupe = await col.findOne({
    email,
    query,
    createdAt: { $gte: new Date(now.getTime() - DEDUPE_MS) },
  });
  if (dupe) {
    return NextResponse.json({ ok: true, duplicate: true, message: "Already saved — check your inbox." });
  }

  const resultCount = Number.isFinite(Number(body.resultCount)) ? Number(body.resultCount) : 0;
  await col.insertOne({
    email,
    query,
    province,
    resultCount,
    path:      String(body.path ?? ""),
    sessionId: body.sessionId ? String(body.sessionId) : undefined,
    ipHash:    ipHashFromRequest(req) || undefined,
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 200) || undefined,
    createdAt: now,
  });

  await sendConfirmationEmail({ email, query, province, resultCount });

  return NextResponse.json({ ok: true, message: "Saved. Check your inbox in a minute." });
}

/* ─────────────── Email ─────────────── */

async function sendConfirmationEmail(args: {
  email: string; query: string; province: string; resultCount: number;
}) {
  const provLabel = PROV_LABEL[args.province] ?? args.province;
  const searchQs  = new URLSearchParams();
  searchQs.set("q", args.query);
  if (args.province && args.province !== "all") searchQs.set("province", args.province);
  const searchUrl = `${SITE_URL}/canada-corporations-search?${searchQs.toString()}`;

  const subject = `Your CRS search: "${args.query.slice(0, 60)}"`;
  const countLine = args.resultCount > 0
    ? `That returned ${args.resultCount} result${args.resultCount === 1 ? "" : "s"}.`
    : `That returned no direct match — reply to this email with the corporation name and our team will run a deeper search.`;

  const text = [
    `Hi,`,
    ``,
    `You saved this search on Corporate Registry Services:`,
    `  "${args.query}" — ${provLabel}`,
    ``,
    countLine,
    ``,
    `Re-run the search any time:`,
    `  ${searchUrl}`,
    ``,
    `When you're ready to file, we handle the paperwork in 24 hours:`,
    `  • Corporate Profile Report — $49 all-in`,
    `  • Certificate of Good Standing — $79 all-in`,
    `  • Annual Return Filing — from $99/yr`,
    ``,
    `Reply to this email with any questions — a specialist watches this inbox during business hours.`,
    ``,
    `— Corporate Registry Services`,
    SITE_URL,
  ].join("\n");

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1D2A35;">
    <p>Hi,</p>
    <p>You saved this search on <strong>Corporate Registry Services</strong>:</p>
    <p style="padding:0.5rem 0.85rem;background:#f4f7fa;border-left:3px solid #2a7d8f;font-family:monospace;font-size:13px;">
      <strong>${escapeHtml(args.query)}</strong> &middot; ${escapeHtml(provLabel)}
    </p>
    <p>${args.resultCount > 0
        ? `That returned <strong>${args.resultCount} result${args.resultCount === 1 ? "" : "s"}</strong>.`
        : `That returned no direct match — reply to this email with the corporation name and our team will run a deeper search.`}</p>
    <p><a href="${searchUrl}" style="display:inline-block;padding:0.55rem 1rem;background:#003d5b;color:#fff;text-decoration:none;border-radius:0.4rem;font-weight:600;">Re-run this search →</a></p>
    <p>When you're ready to file, we handle the paperwork in <strong>24 hours</strong>:</p>
    <ul>
      <li>Corporate Profile Report — <strong>$49 all-in</strong></li>
      <li>Certificate of Good Standing — <strong>$79 all-in</strong></li>
      <li>Annual Return Filing — <strong>from $99/yr</strong></li>
    </ul>
    <p>Reply to this email with any questions — a specialist watches this inbox during business hours.</p>
    <p style="color:#8A99A8;">— Corporate Registry Services · <a href="${SITE_URL}">${SITE_URL}</a></p>
  </body></html>`;

  await sendOutreach({ to: [args.email], cc: [], bcc: [], subject, html, text });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
