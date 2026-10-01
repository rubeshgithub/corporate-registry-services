import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { searchLeads, ensureSearchLeadIndexes } from "@/lib/search-leads-mongo";
import { isSuppressed } from "@/lib/outreach-mongo";
import { sendOutreach } from "@/lib/outreach-ses";
import { brandedEmail, signatureText, footerText, button, p, C, FONT, esc } from "@/lib/email-brand";
import { getPrices, formatCents } from "@/lib/pricing";

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
  email?:        string;
  query?:        string;
  province?:     string;
  resultCount?:  number;
  path?:         string;
  sessionId?:    string;
  /* Extra context from the "unlock full profile" gate */
  intent?:       string;   // "save-search" | "unlock-profile"
  registryId?:   string;
  jurisdiction?: string;
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
  const intent      = body.intent === "unlock-profile" ? "unlock-profile" as const
                    : body.intent === "save-search"    ? "save-search"    as const
                    : undefined;
  await col.insertOne({
    email,
    query,
    province,
    resultCount,
    path:         String(body.path ?? ""),
    sessionId:    body.sessionId ? String(body.sessionId) : undefined,
    ipHash:       ipHashFromRequest(req) || undefined,
    userAgent:    (req.headers.get("user-agent") ?? "").slice(0, 200) || undefined,
    createdAt:    now,
    intent,
    registryId:   body.registryId   ? String(body.registryId).trim().slice(0, 64) : undefined,
    jurisdiction: body.jurisdiction ? String(body.jurisdiction).trim().slice(0, 64) : undefined,
  });

  await sendConfirmationEmail({ email, query, province, resultCount });

  return NextResponse.json({ ok: true, message: "Saved. Check your inbox in a minute." });
}

/* ─────────────── Email ─────────────── */

async function sendConfirmationEmail(args: {
  email: string; query: string; province: string; resultCount: number;
}) {
  const provLabel = PROV_LABEL[args.province] ?? args.province;
  /* Prices come from the catalogue — this email used to hard-code $49/$79/$99
     and kept quoting them after the catalogue moved. Annual returns quote the
     lowest (British Columbia has its own price). */
  const prices = await getPrices();
  const price  = (key: string) => formatCents(prices[key]);
  const arFrom = formatCents(Math.min(prices["annual-return"] ?? Infinity, prices["annual-return-bc"] ?? Infinity, prices["annual-return-on"] ?? Infinity));
  const changeFrom = formatCents(Math.min(prices["change-directors"] ?? Infinity, prices["change-address"] ?? Infinity));
  const mbFrom = formatCents(prices["minute-book-young-self"]);

  const searchQs  = new URLSearchParams();
  searchQs.set("q", args.query);
  if (args.province && args.province !== "all") searchQs.set("province", args.province);
  const searchUrl = `${SITE_URL}/canada-corporations-search?${searchQs.toString()}`;
  const orderQs = new URLSearchParams({ q: args.query, src: "email-saved-search" });
  if (args.province && args.province !== "all") orderQs.set("jurisdiction", args.province);
  const profileUrl = `${SITE_URL}/order/profile-report?${orderQs.toString()}`;

  const subject = `Your saved search: "${args.query.slice(0, 60)}"`;
  const found = args.resultCount > 0
    ? `That returned <strong>${args.resultCount} result${args.resultCount === 1 ? "" : "s"}</strong>.`
    : "That returned no direct match — reply to this email with the corporation name and our team will run a deeper search for you.";
  const why = "You're receiving this because you saved a search on corporateregistryservices.ca.";

  const services = [
    ["Certificate of Status / Good Standing", `${price("good-standing")} + GST`],
    ["Annual Return / Annual Report filing", `from ${arFrom} + GST`],
    ["Changes to the corporation's information (directors, addresses, shareholders)", `from ${changeFrom} + GST`],
    ["Minute book services", `from ${mbFrom} + GST`],
    ["Incorporations, NUANS name searches, amendments and more", ""],
  ];

  const bodyHtml = [
    p("Hi,"),
    p("Thank you for using Corporate Registry Services. You saved this search:"),
    `<p style="margin:0 0 14px;padding:10px 14px;background:${C.box};border-left:3px solid ${C.navy};font-family:${FONT};font-size:14px;color:${C.text};"><strong>${esc(args.query)}</strong> &middot; ${esc(provLabel)}</p>`,
    p(found),
    `<p style="margin:0 0 18px;">${button(searchUrl, "Re-run this search")}</p>`,
    p(`<strong>Need the official record?</strong> A full Corporate Profile Report — <strong>${esc(price("profile-report"))} + GST</strong> — is the up-to-date record from the corporate registry: the directors, the shareholders where the registry records them, and the registered office and mailing addresses. The official PDF, by email within one business hour.`),
    `<p style="margin:0 0 18px;">${button(profileUrl, "Order a profile report", false)}</p>`,
    p("We can also help with:", "margin-bottom:6px;"),
    `<ul style="margin:0 0 16px;padding-left:20px;font-family:${FONT};font-size:15px;line-height:1.7;color:${C.text};">${services
      .map(([what, cost]) => `<li>${esc(what)}${cost ? ` — <strong>${esc(cost)}</strong>` : ""}</li>`).join("")}</ul>`,
    p("Just reply to this email with any questions — a specialist watches this inbox during business hours."),
  ].join("\n");

  const html = brandedEmail({
    subject, preheader: `Your saved search for ${args.query} — re-run it any time.`,
    eyebrow: "Your saved search", title: "", bodyHtml, to: args.email, why, kind: "saved-search",
  });
  const text = [
    `Hi,`,
    ``,
    `Thank you for using Corporate Registry Services. You saved this search:`,
    `  "${args.query}" — ${provLabel}`,
    ``,
    args.resultCount > 0
      ? `That returned ${args.resultCount} result${args.resultCount === 1 ? "" : "s"}.`
      : `That returned no direct match — reply to this email with the corporation name and our team will run a deeper search for you.`,
    ``,
    `Re-run the search any time:`,
    `  ${searchUrl}`,
    ``,
    `Need the official record? A full Corporate Profile Report — ${price("profile-report")} + GST — is the up-to-date record from the corporate registry: the directors, the shareholders where the registry records them, and the registered office and mailing addresses. The official PDF, by email within one business hour:`,
    `  ${profileUrl}`,
    ``,
    `We can also help with:`,
    ...services.map(([what, cost]) => `  • ${what}${cost ? ` — ${cost}` : ""}`),
    ``,
    `Just reply to this email with any questions — a specialist watches this inbox during business hours.`,
    ``,
    ...signatureText(),
    ``,
    ...footerText(args.email, why, "saved-search"),
  ].join("\n");
  await sendOutreach({ to: [args.email], cc: [], bcc: [], subject, html, text });
}


