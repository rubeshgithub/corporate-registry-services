import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { orderDrafts, ensureOrderDraftIndexes, type OrderDraftDoc } from "@/lib/order-drafts-mongo";

/**
 * POST /api/order/draft
 *
 * Public beacon fired by order-form components on debounced input change
 * (typed a name/email/phone character, picked a company). Upsert keyed on
 * (sessionId, service). Body:
 *
 *   {
 *     sessionId: string,       // required
 *     service:   string,       // required — "annual-return" | "profile-report" | ...
 *     path:      string,       // "/order/annual-return"
 *     contact?:  { name?, email?, phone? },
 *     company?:  { name?, registryId?, businessNumber?, jurisdiction?, provinceKey? }
 *   }
 *
 * Any missing field on the request leaves that field unchanged in the
 * existing draft (safe when the user is still typing). Rejects payloads
 * without either a contact field or a company selection — we don't want
 * an empty draft for every /order/* pageview (the pageview log already
 * captures raw arrival).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_STR = 200;
const trunc = (v: unknown, max = MAX_STR): string => {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return s.length > max ? s.slice(0, max) : s;
};

function ipHashFromRequest(req: Request): string {
  const raw = (req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "").split(",")[0]?.trim() ?? "";
  if (!raw) return "";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

type Body = {
  sessionId?: string;
  service?:   string;
  path?:      string;
  contact?:   { name?: string; email?: string; phone?: string };
  company?:   {
    name?: string; registryId?: string; businessNumber?: string;
    jurisdiction?: string; provinceKey?: string;
  };
};

export async function POST(req: Request) {
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const sessionId = trunc(body.sessionId, 64);
  const service   = trunc(body.service,   40);
  const path      = trunc(body.path,     120);
  if (sessionId.length < 8) return NextResponse.json({ error: "bad session" }, { status: 400 });
  if (!service)             return NextResponse.json({ error: "service required" }, { status: 400 });

  const contactIn = body.contact ?? {};
  const companyIn = body.company ?? {};

  const anyContact = trunc(contactIn.name)  || trunc(contactIn.email) || trunc(contactIn.phone);
  const anyCompany = trunc(companyIn.name)  || trunc(companyIn.registryId);
  if (!anyContact && !anyCompany) {
    /* Empty beacon — don't store, don't 4xx (client may batch). */
    return NextResponse.json({ ok: true, ignored: true });
  }

  await ensureOrderDraftIndexes();
  const col = await orderDrafts();
  const now = new Date();

  /* Build $set with only supplied fields — leaving prior partial fills
   *  intact. Undefined values are skipped so we don't overwrite good data
   *  with empty strings on a keystroke. */
  const setFields: Record<string, unknown> = {
    sessionId, service, path,
    updatedAt: now,
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 200) || undefined,
    ipHash:    ipHashFromRequest(req) || undefined,
  };
  const setOnInsert: Partial<OrderDraftDoc> = { createdAt: now };

  const setIf = (path: string, val: string) => { if (val) setFields[path] = val; };
  setIf("contact.name",  trunc(contactIn.name));
  setIf("contact.email", trunc(contactIn.email).toLowerCase());
  setIf("contact.phone", trunc(contactIn.phone));
  setIf("company.name",           trunc(companyIn.name));
  setIf("company.registryId",     trunc(companyIn.registryId, 60));
  setIf("company.businessNumber", trunc(companyIn.businessNumber, 60));
  setIf("company.jurisdiction",   trunc(companyIn.jurisdiction, 80));
  setIf("company.provinceKey",    trunc(companyIn.provinceKey, 8));

  await col.updateOne(
    { sessionId, service },
    { $set: setFields, $setOnInsert: setOnInsert },
    { upsert: true },
  );

  return NextResponse.json({ ok: true });
}
