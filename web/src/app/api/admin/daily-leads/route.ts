import { NextResponse } from "next/server";
import crypto from "node:crypto";
import Stripe from "stripe";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { db, pageviews } from "@/lib/mongo";
import { orderDrafts } from "@/lib/order-drafts-mongo";
import { searchLeads } from "@/lib/search-leads-mongo";
import { inboundMessages } from "@/lib/inbound-messages-mongo";
import { listPaidSessions, OPERATOR_TZ } from "@/lib/analytics";
import { getPrices, formatCents } from "@/lib/pricing";

/**
 * POST /api/admin/daily-leads — one lead summary a day to support@.
 *
 * Replaces the per-draft abandoned-order emails (abandoned-sweep ran every
 * 15 min and mailed each cold draft). Owner decision 2026-09-25: a single
 * digest at 9:00 am Mountain covering the previous 24 hours:
 *
 *   1. Needs action today   — "can't find my company" hand-lookup requests
 *                             (we promised a reply within a few hours)
 *   2. Started an order, left contact details, didn't pay
 *   3. Asked for something by email — snapshots, saved searches, profile
 *                             unlocks, PC name checks
 *   4. Showed intent, no contact — picked a company on an order page, typed
 *                             nothing (company known, visits counted)
 *   + paid orders in the window, and what was filtered out (bots, scanners,
 *     the owner's own admin sessions, test searches).
 *
 * Anyone who paid in the window is dropped from the lead lists.
 *
 * Schedule: .github/workflows/daily-leads.yml fires at 15:00 and 16:00 UTC;
 * only the run landing at 09:xx America/Edmonton sends (covers MDT and MST),
 * and a per-day marker in `digest_runs` stops double sends.
 *
 * Auth: Bearer ADMIN_SWEEP_TOKEN or the admin cookie.
 * Query: dry=1 (build, don't send) · force=1 (ignore the 9 am check) ·
 *        preview=1 on GET (admin cookie) returns the HTML for the browser.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.corporateregistryservices.ca";
const TO       = process.env.DAILY_LEADS_TO ?? "support@corporateregistryservices.ca";
const FROM     = process.env.SES_FROM ?? process.env.FROM_EMAIL ?? "noreply@corporateregistryservices.ca";

/* The owner tests with his own company and throwaway strings. */
const TEST_QUERY   = /^(zzqx|asd|sdf|test|qwe|xxx)/i;
const TEST_COMPANY = (process.env.DAILY_LEADS_EXCLUDE ?? "2682736 ALBERTA").toUpperCase().split(",").map((s) => s.trim()).filter(Boolean);
const BOT_UA       = /bot|crawl|spider|slurp|headless|lighthouse|preview|puppeteer|playwright|selenium|python|curl|wget|gptbot|chatgpt|openai|perplexity|claude|anthropic|bytespider|ccbot|semrush|ahrefs/i;

function staleUa(ua: string): boolean {
  if (/Firefox\/109\.0/.test(ua) || /Edge\/1[2-8]\./.test(ua)) return true;
  const m = /(?:Chrome|CriOS)\/(\d+)/.exec(ua);
  return !!m && Number(m[1]) < 135;
}

function authorized(req: Request): boolean {
  const expected = process.env.ADMIN_SWEEP_TOKEN?.trim();
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!presented) return false;
  const a = Buffer.from(presented, "utf8"), b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

const esc  = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mask = (e: string) => { const [u, d] = e.split("@"); return d ? `${u.slice(0, 1)}•••@${d}` : e; };
const time = (d: Date) => d.toLocaleTimeString("en-CA", { timeZone: OPERATOR_TZ, hour: "numeric", minute: "2-digit" });
const day  = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: OPERATOR_TZ, weekday: "short", month: "short", day: "numeric" });
const localHour = (d: Date) => Number(d.toLocaleString("en-CA", { timeZone: OPERATOR_TZ, hour: "numeric", hour12: false }));
const localDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: OPERATOR_TZ });

const SERVICE: Record<string, string> = {
  "annual-return": "Annual return", "profile-report": "Profile report", "good-standing": "Good standing",
  "corporate-documents": "Corporate documents", "incorporation": "Incorporation", "change": "Change filing",
  "corporate-search": "Corporate search", "name-search": "Name search", "minute-book": "Minute book",
};
const INTENT: Record<string, string> = {
  "snapshot": "Free snapshot", "save-search": "Saved search", "unlock-profile": "Profile unlock", "pc-name-check": "PC name check",
};

type Digest = { subject: string; html: string; text: string; counts: Record<string, number> };

async function build(now: Date): Promise<Digest> {
  const since = new Date(now.getTime() - 24 * 3600_000);
  const prices = await getPrices();

  /* ── Paid orders (Stripe) — also the "already converted" filter ── */
  let paidCount = 0, paidTotal = 0;
  const paidEmails = new Set<string>();
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const sessions = await listPaidSessions(new Stripe(process.env.STRIPE_SECRET_KEY), Math.floor(since.getTime() / 1000));
      for (const s of sessions) {
        paidCount++; paidTotal += (s.amount_total ?? 0) / 100;
        const e = s.customer_details?.email?.toLowerCase(); if (e) paidEmails.add(e);
      }
    } catch (e) { console.warn("[daily-leads] Stripe failed:", e instanceof Error ? e.message : e); }
  }

  /* ── Sessions to set aside: the owner (admin cookie) and bots/scanners ── */
  const pv = await pageviews();
  const orderViews = await pv.find({ path: { $regex: "^/order/" }, ts: { $gte: since } }).toArray();
  const adminSessions = new Set(orderViews.filter((r) => r.admin).map((r) => r.sessionId));
  const botSessions   = new Set<string>();
  const perSession = new Map<string, number>();
  for (const r of orderViews) perSession.set(r.sessionId, (perSession.get(r.sessionId) ?? 0) + 1);
  for (const r of orderViews) {
    const ua = r.userAgent ?? "";
    if (!adminSessions.has(r.sessionId) && (BOT_UA.test(ua) || (staleUa(ua) && (perSession.get(r.sessionId) ?? 0) <= 1))) botSessions.add(r.sessionId);
  }

  /* ── 1. Hand-lookup requests (promised a reply) ── */
  const help = (await (await inboundMessages()).find({ source: "search-help", createdAt: { $gte: since } }).sort({ createdAt: -1 }).toArray())
    .filter((m) => !paidEmails.has(m.email) && !TEST_QUERY.test(String((m.payload as { query?: string })?.query ?? "")));
  const helpEmails = new Set(help.map((m) => m.email));

  /* ── 2 & 4. Order drafts ── */
  const drafts = (await (await orderDrafts()).find({ updatedAt: { $gte: since } }).sort({ updatedAt: -1 }).toArray())
    .filter((d) => !adminSessions.has(d.sessionId) && !botSessions.has(d.sessionId))
    .filter((d) => !TEST_COMPANY.some((t) => (d.company?.name ?? "").toUpperCase().includes(t)))
    .filter((d) => !d.contact?.email || !paidEmails.has(d.contact.email.toLowerCase()));

  const sessionIds = [...new Set(drafts.map((d) => d.sessionId))];
  const views = await pv.find({ sessionId: { $in: sessionIds }, ts: { $gte: new Date(since.getTime() - 6 * 3600_000) } }).sort({ ts: 1 }).toArray();
  const journeyOf = (sid: string, orderPath: string) => {
    const v = views.filter((r) => r.sessionId === sid);
    const firstOrder = v.findIndex((r) => r.path === orderPath);
    const before = firstOrder > 0 ? v.slice(0, firstOrder) : [];
    let entry = "direct";
    const first = v[0];
    if (first?.referrer) { try { entry = new URL(first.referrer).host.replace(/^www\./, ""); } catch { /* keep direct */ } }
    const landing = before[before.length - 1]?.path ?? first?.path ?? orderPath;
    const cameFrom = before.length ? `${entry === "direct" ? "" : entry + " → "}${landing}` : `${entry} → order page`;
    const after = firstOrder >= 0 ? v.slice(firstOrder + 1).map((r) => r.path) : [];
    const trust = [...new Set(after.filter((p) => /^\/(about|faq|terms|disclaimer|contact|privacy)/.test(p)).map((p) => p.split("/")[1]))];
    return { cameFrom: cameFrom.replace(/^\s*→\s*/, "").slice(0, 90), trust };
  };

  const withContact = drafts.filter((d) => d.contact?.email || d.contact?.phone);
  const noContactAll = drafts.filter((d) => !(d.contact?.email || d.contact?.phone) && d.company?.name);
  /* Group intent-only drafts by company — "came back 3 times" is the signal. */
  const intentOnly = new Map<string, { d: typeof drafts[number]; visits: number }>();
  for (const d of noContactAll) {
    const k = `${d.company?.name}|${d.service}`;
    const cur = intentOnly.get(k);
    if (cur) cur.visits++; else intentOnly.set(k, { d, visits: 1 });
  }

  /* ── 3. Email requests (search leads) ── */
  const leads = (await (await searchLeads()).find({ createdAt: { $gte: since } }).sort({ createdAt: -1 }).toArray())
    .filter((l) => !paidEmails.has(l.email) && !helpEmails.has(l.email))
    .filter((l) => !(l.intent === "snapshot" && l.resultCount === 0))     // hand-lookups — section 1
    .filter((l) => !TEST_QUERY.test(l.query ?? "") && !TEST_COMPANY.some((t) => (l.query ?? "").toUpperCase().includes(t)));

  const reachable = help.length + withContact.length + leads.length;
  const counts = {
    paid: paidCount, withContact: reachable, noContact: intentOnly.size, handLookups: help.length,
    bots: botSessions.size, admin: adminSessions.size,
  };

  /* ── Render ── */
  const td = 'style="padding:7px 9px;border-bottom:1px solid #EEF2F5;font-size:12.5px;vertical-align:top;color:#1D2A35;"';
  const th = 'style="padding:6px 9px;text-align:left;font-size:11px;color:#5B6B7A;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #D9E1E8;"';
  const table = (head: string[], rows: string[][]) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:6px 0 4px;">` +
    `<tr>${head.map((h) => `<th ${th}>${h}</th>`).join("")}</tr>` +
    rows.map((r) => `<tr>${r.map((c) => `<td ${td}>${c}</td>`).join("")}</tr>`).join("") + `</table>`;
  const section = (title: string, note: string, body: string) =>
    `<tr><td style="padding:18px 24px 4px;"><div style="font-size:15px;font-weight:700;color:#003d5b;">${title}</div>` +
    (note ? `<div style="font-size:12px;color:#5B6B7A;margin-top:2px;">${note}</div>` : "") + body + `</td></tr>`;
  const link = (href: string, label: string) => `<a href="${href}" style="color:#003d5b;font-weight:600;">${label}</a>`;
  const tick = (b: boolean) => (b ? "✓" : "—");
  const svc  = (s: string) => `${SERVICE[s] ?? s}${prices[s] ? ` (${formatCents(prices[s])})` : ""}`;

  const parts: string[] = [];
  const textParts: string[] = [];

  if (help.length) {
    parts.push(section("🔥 1. Needs action today — promised a reply", "Visitors told “we’ll look it up by hand within a few business hours”.", table(
      ["When", "Who", "Asked about", "Province", ""],
      help.map((m) => {
        const p = (m.payload ?? {}) as { query?: string; province?: string };
        return [time(m.createdAt), esc(mask(m.email)), esc(`“${p.query ?? "?"}”`), esc((p.province ?? "").toUpperCase()),
          link(`mailto:${m.email}?subject=${encodeURIComponent(`Your corporation lookup: ${p.query ?? ""}`)}`, "Reply")];
      }),
    )));
    textParts.push(`1. NEEDS ACTION TODAY (${help.length})\n` + help.map((m) => `- ${time(m.createdAt)} ${m.email} — "${(m.payload as { query?: string })?.query}"`).join("\n"));
  }

  if (withContact.length) {
    parts.push(section("📋 2. Started an order, didn’t pay — left contact details", "", table(
      ["When", "Company", "Service", "Name · Email · Phone", "Came from", "Got as far as", ""],
      withContact.map((d) => {
        const j = journeyOf(d.sessionId, d.path);
        const typed = [d.contact?.name, d.contact?.email, d.contact?.phone].filter(Boolean).length;
        const far = (d.etransferRequestedAt ? "Chose e-transfer, not received" : typed === 3 ? "Typed everything" : "Typed some details")
          + (j.trust.length ? `. Then read ${j.trust.join(", ")}` : "");
        const actions = [
          d.contact?.email ? link(`mailto:${d.contact.email}?subject=${encodeURIComponent(`Your ${SERVICE[d.service] ?? d.service} order — ${d.company?.name ?? ""}`)}`, "Email") : "",
          d.contact?.phone ? link(`tel:${d.contact.phone.replace(/[^\d+]/g, "")}`, "Call") : "",
        ].filter(Boolean).join(" · ");
        return [time(d.updatedAt), `<strong>${esc(d.company?.name ?? "—")}</strong>${d.company?.jurisdiction ? ` <span style="color:#5B6B7A">(${esc(d.company.jurisdiction)})</span>` : ""}`,
          esc(svc(d.service)), `${tick(!!d.contact?.name)} · ${tick(!!d.contact?.email)} · ${tick(!!d.contact?.phone)}`,
          esc(j.cameFrom), esc(far), actions];
      }),
    )));
    textParts.push(`2. STARTED AN ORDER, LEFT CONTACT (${withContact.length})\n` + withContact.map((d) =>
      `- ${time(d.updatedAt)} ${d.company?.name ?? "—"} · ${SERVICE[d.service] ?? d.service} · ${d.contact?.name ?? ""} ${d.contact?.email ?? ""} ${d.contact?.phone ?? ""}`).join("\n"));
  }

  if (leads.length) {
    parts.push(section("✉️ 3. Asked for something by email", "Free snapshots, saved searches, profile unlocks, PC name checks.", table(
      ["When", "Email", "Request", "Company / search", "Opted in", ""],
      leads.map((l) => [time(l.createdAt), esc(mask(l.email)), esc(INTENT[l.intent ?? ""] ?? l.intent ?? "Search"),
        esc(`${l.query ?? ""}${l.province && l.province !== "all" ? ` (${l.province.toUpperCase()})` : ""}`),
        l.marketingConsent ? "✓ yes" : "—", link(`mailto:${l.email}`, "Email")]),
    )));
    textParts.push(`3. ASKED BY EMAIL (${leads.length})\n` + leads.map((l) => `- ${time(l.createdAt)} ${l.email} — ${INTENT[l.intent ?? ""] ?? l.intent}: ${l.query}`).join("\n"));
  }

  if (intentOnly.size) {
    const rows = [...intentOnly.values()];
    parts.push(section("👀 4. Showed intent, no contact details", "Picked a company on an order page, then left without typing anything. Can’t be emailed — but the company is known.", table(
      ["When", "Company", "Service", "Came from", "Visits"],
      rows.map(({ d, visits }) => [time(d.updatedAt), `<strong>${esc(d.company?.name ?? "")}</strong>${d.company?.jurisdiction ? ` <span style="color:#5B6B7A">(${esc(d.company.jurisdiction)})</span>` : ""}`,
        esc(svc(d.service)), esc(journeyOf(d.sessionId, d.path).cameFrom), visits > 1 ? `<strong>Came back ${visits} times</strong>` : "1"]),
    )));
    textParts.push(`4. INTENT, NO CONTACT (${rows.length})\n` + rows.map(({ d, visits }) => `- ${time(d.updatedAt)} ${d.company?.name} · ${SERVICE[d.service] ?? d.service} · visits ${visits}`).join("\n"));
  }

  const quiet = !parts.length;
  const subject = `CRS daily leads — ${day(now)}: ${quiet ? "no new leads" : `${reachable + intentOnly.size} lead${reachable + intentOnly.size === 1 ? "" : "s"} (${reachable} with contact)`} · ${paidCount} paid order${paidCount === 1 ? "" : "s"}`;
  const stat = (n: string | number, label: string) =>
    `<td style="padding:10px 8px;text-align:center;border:1px solid #E1E8EE;"><div style="font-size:20px;font-weight:800;color:#003d5b;">${n}</div><div style="font-size:11px;color:#5B6B7A;">${label}</div></td>`;

  const html = `<!doctype html><html><body style="margin:0;background:#F4F7FA;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F7FA;padding:20px 0;"><tr><td align="center">
<table role="presentation" width="720" cellpadding="0" cellspacing="0" style="max-width:720px;width:100%;background:#fff;border-radius:10px;overflow:hidden;">
<tr><td style="background:#003d5b;padding:16px 24px;">
  <div style="color:#F9AC00;font-weight:800;font-size:18px;">CRS · Daily lead summary</div>
  <div style="color:#C9D8E3;font-size:12px;margin-top:2px;">${esc(now.toLocaleDateString("en-CA", { timeZone: OPERATOR_TZ, weekday: "long", month: "long", day: "numeric", year: "numeric" }))} · ${esc(`${day(since)} ${time(since)} → ${day(now)} ${time(now)}`)} (Mountain)</div>
</td></tr>
<tr><td style="padding:16px 24px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
  ${stat(`${paidCount}`, `Paid orders${paidCount ? ` · $${paidTotal.toFixed(0)}` : ""}`)}${stat(reachable, "Leads with contact")}${stat(intentOnly.size, "Leads without contact")}${stat(help.length, "Hand-lookups waiting")}
</tr></table></td></tr>
${quiet ? `<tr><td style="padding:18px 24px;font-size:14px;color:#1D2A35;">No new leads in the last 24 hours.</td></tr>` : parts.join("")}
<tr><td style="padding:16px 24px 20px;font-size:12px;color:#5B6B7A;">
  Filtered out: ${botSessions.size} bot / link-scanner visit${botSessions.size === 1 ? "" : "s"} and ${adminSessions.size} of your own admin session${adminSessions.size === 1 ? "" : "s"} on order pages, plus test searches.<br/>
  ${link(`${SITE_URL}/admin/analytics`, "Open the full dashboard →")}
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [subject, "", `Paid orders: ${paidCount}${paidCount ? ` ($${paidTotal.toFixed(0)})` : ""}`, "",
    ...(quiet ? ["No new leads in the last 24 hours."] : textParts.flatMap((t) => [t, ""])),
    `Filtered: ${botSessions.size} bots/scanners, ${adminSessions.size} admin sessions.`, `${SITE_URL}/admin/analytics`].join("\n");

  return { subject, html, text, counts };
}

export async function POST(req: Request) {
  if (!authorized(req) && !(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url   = new URL(req.url);
  const dry   = url.searchParams.get("dry") === "1";
  const force = url.searchParams.get("force") === "1";
  const now   = new Date();

  /* Cron fires at 15:00 and 16:00 UTC; only the one at 9 am local sends. */
  if (!force && localHour(now) !== 9) {
    return NextResponse.json({ ok: true, skipped: `local hour ${localHour(now)}, sends at 9` });
  }
  const runs = (await db()).collection<{ _id: string; sentAt: Date }>("digest_runs");
  const key  = `daily-leads:${localDate(now)}`;
  if (!force && !dry && (await runs.findOne({ _id: key }))) {
    return NextResponse.json({ ok: true, skipped: "already sent today" });
  }

  const digest = await build(now);
  if (dry) return NextResponse.json({ ok: true, dry: true, subject: digest.subject, counts: digest.counts });

  const ses = new SESClient({
    region: process.env.AWS_REGION ?? "us-east-1",
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID!, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY! },
  });
  await ses.send(new SendEmailCommand({
    Source: FROM,
    Destination: { ToAddresses: [TO] },
    Message: { Subject: { Data: digest.subject }, Body: { Html: { Data: digest.html }, Text: { Data: digest.text } } },
  }));
  await runs.updateOne({ _id: key }, { $set: { sentAt: now } }, { upsert: true });
  return NextResponse.json({ ok: true, sent: true, to: TO, subject: digest.subject, counts: digest.counts });
}

/* Admin-only browser preview: /api/admin/daily-leads?preview=1 */
export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const digest = await build(new Date());
  if (new URL(req.url).searchParams.get("preview") === "1") {
    return new NextResponse(digest.html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return NextResponse.json({ subject: digest.subject, counts: digest.counts });
}
