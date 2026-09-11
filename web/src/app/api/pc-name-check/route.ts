import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { checkNameAvailability, type Scope } from "@/lib/name-availability";
import { searchLeads, ensureSearchLeadIndexes } from "@/lib/search-leads-mongo";
import { isSuppressed } from "@/lib/outreach-mongo";
import { sendOutreach } from "@/lib/outreach-ses";
import { sendAlertSms } from "@/lib/sms-infobip";

/**
 * POST /api/pc-name-check
 *
 * Free preliminary name check for a professional corporation, in exchange for
 * contact details. A physician proposes the name their college will require —
 * "Dr. Jane A. Smith Professional Corporation" — and we tell them whether a
 * conflicting registration already exists, then email the same answer as a
 * short report.
 *
 * ── Why this is its own endpoint ─────────────────────────────────────────
 * /api/notify/search-lead captures an email against a registry *search*. This
 * captures a name, email and phone against a *proposed* name plus the result
 * of checking it, and promises a specific deliverable. Different payload,
 * different email, and a lead an operator is expected to act on — so it gets
 * its own route rather than more optional fields on that one.
 *
 * ── The honesty constraint ───────────────────────────────────────────────
 * A name absent from the registry is NOT an available name. The college has
 * to approve it, and a named incorporation still needs a NUANS. Every string
 * this route emits says "no conflicting registration found", never
 * "available". Overpromising here buys refunds and a complaint to a college.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME  = 200;
const DEDUPE_MS = 24 * 60 * 60 * 1000;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.corporateregistryservices.ca";
const VALID_SCOPES: Scope[] = ["all", "federal", "bc", "ab", "pe"];

type Body = {
  proposedName?: string;
  scope?:        string;
  contact?:      { name?: string; email?: string; phone?: string };
  profession?:   string;   // free text, e.g. "physician" — used in the email only
  path?:         string;
  sessionId?:    string;
  src?:          string;
};

function ipHashFromRequest(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (!ip) return "";
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 24);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function POST(req: Request) {
  let body: Body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const proposedName = String(body.proposedName ?? "").trim().slice(0, MAX_NAME);
  const name         = String(body.contact?.name  ?? "").trim().slice(0, 120);
  const email        = String(body.contact?.email ?? "").trim().toLowerCase().slice(0, 160);
  const phone        = String(body.contact?.phone ?? "").trim().slice(0, 40);
  const scope        = (VALID_SCOPES as string[]).includes(String(body.scope))
    ? (body.scope as Scope) : "all";

  if (proposedName.length < 2)  return NextResponse.json({ error: "Enter the corporation name you want to check." }, { status: 400 });
  if (!name)                    return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (!EMAIL_RE.test(email))    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!phone)                   return NextResponse.json({ error: "Enter a phone number." }, { status: 400 });

  /* Suppressed addresses are accepted silently — no error surface for bots,
     and we simply don't store or email. */
  let suppressed = false;
  try { suppressed = await isSuppressed(email); } catch { /* fail open */ }

  const result = await checkNameAvailability(proposedName, scope);
  const clean  = result.matchCount === 0;

  if (suppressed) {
    return NextResponse.json({ ok: true, result, reportSent: false });
  }

  /* Store the lead. Deduped on (email, proposedName) within 24h so a double
     submit doesn't create two leads or two emails. */
  try {
    await ensureSearchLeadIndexes();
    const col   = await searchLeads();
    const since = new Date(Date.now() - DEDUPE_MS);
    const dupe  = await col.findOne({ email, query: proposedName, createdAt: { $gte: since } });
    if (!dupe) {
      await col.insertOne({
        email,
        query:        proposedName,
        province:     scope,
        resultCount:  result.matchCount,
        path:         String(body.path ?? ""),
        sessionId:    body.sessionId ? String(body.sessionId) : undefined,
        ipHash:       ipHashFromRequest(req) || undefined,
        userAgent:    (req.headers.get("user-agent") ?? "").slice(0, 200) || undefined,
        createdAt:    new Date(),
        intent:       "pc-name-check",
        contactName:  name,
        contactPhone: phone,
        profession:   String(body.profession ?? "").slice(0, 60) || undefined,
        src:          String(body.src ?? "").slice(0, 100) || undefined,
      });
    } else {
      return NextResponse.json({ ok: true, result, reportSent: true, deduped: true });
    }
  } catch (e) {
    console.error("[pc-name-check] lead store failed:", e instanceof Error ? e.message : e);
    /* Storing is best-effort — still give the visitor their answer. */
  }

  /* ── The report ─────────────────────────────────────────────────────── */
  const verdict = clean
    ? `We found no conflicting registration for "${proposedName}" in ${result.scopeLabel}.`
    : `We found ${result.matchCount} similar registration${result.matchCount === 1 ? "" : "s"} to "${proposedName}" in ${result.scopeLabel}.`;

  const matchLines = result.matches.slice(0, 10).map((m) => `  • ${m.name}`).join("\n");

  const text = [
    `Hi ${name.split(" ")[0] || "there"},`,
    ``,
    `Here is your preliminary name check.`,
    ``,
    `PROPOSED NAME`,
    `  ${proposedName}`,
    ``,
    `RESULT`,
    `  ${verdict}`,
    result.matchCount > 0 ? `\nSIMILAR NAMES ON THE REGISTRY\n${matchLines}` : "",
    result.coverageNote ? `\nCOVERAGE\n  ${result.coverageNote}` : "",
    ``,
    `WHAT THIS DOES AND DOESN'T TELL YOU`,
    `  This is a preliminary check of public registry records. It is not a`,
    `  NUANS report and it is not your college's approval. A named`,
    `  incorporation still needs a NUANS, and a professional corporation`,
    `  name has to satisfy your college's naming rules before the registry`,
    `  will accept it. A clean preliminary check means the obvious blockers`,
    `  aren't there — it is not a reservation and it is not a guarantee.`,
    ``,
    `NEXT STEP`,
    `  We set up professional corporations end to end — the college`,
    `  submission, the NUANS, the articles and the registry filing:`,
    `  ${SITE_URL}/professional-corporation`,
    ``,
    `Reply to this email if you'd like us to start, or with any questions.`,
    ``,
    `— The CRS Team`,
    `Corporate Registry Services`,
    SITE_URL,
  ].filter(Boolean).join("\n");

  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1D2A35;">
    <p>Hi ${esc(name.split(" ")[0] || "there")},</p>
    <p>Here is your preliminary name check.</p>
    <p style="padding:0.6rem 0.9rem;background:#f4f7fa;border-left:3px solid #2a7d8f;">
      <strong style="font-size:15px;">${esc(proposedName)}</strong><br>
      <span style="color:${clean ? "#166534" : "#B45309"};">${esc(verdict)}</span>
    </p>
    ${result.matchCount > 0 ? `<p><strong>Similar names on the registry</strong></p><ul>${
      result.matches.slice(0, 10).map((m) => `<li>${esc(m.name)}</li>`).join("")
    }</ul>` : ""}
    ${result.coverageNote ? `<p style="color:#5A6B7A;font-size:13px;">${esc(result.coverageNote)}</p>` : ""}
    <p><strong>What this does and doesn't tell you</strong><br>
      This is a preliminary check of public registry records. It is <strong>not</strong> a NUANS report
      and <strong>not</strong> your college's approval. A named incorporation still needs a NUANS, and a
      professional corporation name has to satisfy your college's naming rules before the registry will
      accept it. A clean preliminary check means the obvious blockers aren't there — it is not a
      reservation and not a guarantee.</p>
    <p><a href="${SITE_URL}/professional-corporation" style="display:inline-block;padding:0.55rem 1rem;background:#003d5b;color:#fff;text-decoration:none;border-radius:0.4rem;font-weight:600;">See how we set up professional corporations →</a></p>
    <p>Reply to this email if you'd like us to start, or with any questions.</p>
    <p style="color:#8A99A8;">— Corporate Registry Services · <a href="${SITE_URL}">${SITE_URL}</a></p>
  </body></html>`;

  let reportSent = false;
  try {
    await sendOutreach({
      to: [email], cc: [], bcc: [],
      subject: `Preliminary name check: ${proposedName.slice(0, 80)}`,
      html, text,
    });
    reportSent = true;
  } catch (e) {
    console.error("[pc-name-check] report send failed:", e instanceof Error ? e.message : e);
  }

  /* Tell the operator. A physician who just handed over a phone number for a
     professional-corporation name is the highest-intent lead the site
     produces, and the setup is sold by conversation, not checkout. */
  void sendAlertSms(
    `CRS: PC name check — ${name} (${phone}) — "${proposedName.slice(0, 60)}" — ${clean ? "no conflicts" : result.matchCount + " similar"}`,
  );

  return NextResponse.json({ ok: true, result, reportSent });
}
