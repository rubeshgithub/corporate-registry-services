import { NextResponse } from "next/server";
import { outreachTokens, type OutreachService } from "@/lib/outreach-mongo";

/**
 * GET /o/<token>
 *
 * Public landing for CTAs in outreach emails. Records the click on the
 * token, then 302-redirects to the correct order flow with the company
 * pre-filled via query params (same shape CompanySearch already uses).
 *
 * If the token is unknown, we redirect to the homepage rather than showing
 * an error page — most "bad" hits are stale links from forwarded emails
 * and don't deserve a scary error.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://corporateregistryservices.ca";

const ORDER_PATH: Record<OutreachService, string> = {
  "annual-return":   "/order/annual-return",
  "profile-report":  "/order/profile-report",
  "good-standing":   "/order/good-standing",
  "dissolution":     "/order/voluntary-dissolution",
  "revival":         "/order/revival",
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!token || !/^[A-Za-z0-9]{8,32}$/.test(token)) {
    return NextResponse.redirect(new URL("/", SITE_URL), 302);
  }

  const tokens = await outreachTokens();
  const doc = await tokens.findOneAndUpdate(
    { token },
    {
      $inc: { clickCount: 1 },
      $set: { firstClickedAt: new Date() },
    },
    { returnDocument: "before" },
  );

  // If firstClickedAt was already set on the previous doc, put it back —
  // we want the FIRST click's timestamp, not the latest one.
  if (doc?.firstClickedAt) {
    await tokens.updateOne({ token }, { $set: { firstClickedAt: doc.firstClickedAt } });
  }

  if (!doc) {
    return NextResponse.redirect(new URL("/", SITE_URL), 302);
  }

  const path = ORDER_PATH[doc.service] ?? "/#services";
  const params = new URLSearchParams();
  if (doc.company.name)        params.set("q",           doc.company.name);
  if (doc.company.provinceKey) params.set("jurisdiction", doc.company.provinceKey);
  if (doc.company.registryId)  params.set("registryId",   doc.company.registryId);
  params.set("src", `outreach${doc.campaignId ? `-${doc.campaignId}` : ""}`);
  params.set("ref", token);

  const dest = new URL(`${path}?${params.toString()}`, SITE_URL);
  return NextResponse.redirect(dest, 302);
}
