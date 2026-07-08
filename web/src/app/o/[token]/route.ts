import { NextResponse } from "next/server";
import { outreachTokens, type OutreachService } from "@/lib/outreach-mongo";

/**
 * GET /o/<token>[?s=<service>][?ack=filed]
 *
 * Public landing for CTAs in outreach emails.
 *
 *   Plain `/o/<token>` — records a click, redirects to the token's stored
 *   service order flow with the company pre-filled.
 *
 *   `?s=<service>` — overrides the destination service. Used by the
 *   general-intro template where the same email has multiple per-service
 *   CTAs. Adds the clicked service to `clickedServices` on the token so we
 *   can see which service actually converted attention.
 *
 *   `?ack=filed` — anti-CTA. Records `ackFiled` on the token (and increments
 *   click count) then redirects to a thanks page. Signals the recipient
 *   already handled this filing themselves — should be excluded from repeat
 *   outreach on the same service.
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
  "general":         "/#services",  // no single order flow — fall back to services grid
};

const VALID_SERVICES = new Set<OutreachService>([
  "annual-return", "profile-report", "good-standing", "dissolution", "revival", "general",
]);

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!token || !/^[A-Za-z0-9]{8,32}$/.test(token)) {
    return NextResponse.redirect(new URL("/", SITE_URL), 302);
  }

  const url = new URL(req.url);
  const ack = url.searchParams.get("ack");
  const rawService = url.searchParams.get("s") as OutreachService | null;
  const serviceOverride: OutreachService | null =
    rawService && VALID_SERVICES.has(rawService) && rawService !== "general" ? rawService : null;

  const tokens = await outreachTokens();

  // Anti-CTA: "I already filed" — record the ack, thanks page, no order flow.
  if (ack === "filed") {
    const doc = await tokens.findOneAndUpdate(
      { token },
      {
        $inc: { clickCount: 1 },
        $set: { firstClickedAt: new Date(), ackFiled: new Date() },
      },
      { returnDocument: "before" },
    );
    if (doc?.firstClickedAt) {
      await tokens.updateOne({ token }, { $set: { firstClickedAt: doc.firstClickedAt } });
    }
    return NextResponse.redirect(new URL("/o/thanks/filed", SITE_URL), 302);
  }

  // Normal click: increment, record first-click time, add to clickedServices
  // if a per-service override was used.
  const update: Record<string, unknown> = {
    $inc: { clickCount: 1 },
    $set: { firstClickedAt: new Date() },
  };
  if (serviceOverride) {
    update.$addToSet = { clickedServices: serviceOverride };
  }
  const doc = await tokens.findOneAndUpdate({ token }, update, { returnDocument: "before" });

  if (doc?.firstClickedAt) {
    await tokens.updateOne({ token }, { $set: { firstClickedAt: doc.firstClickedAt } });
  }

  if (!doc) {
    return NextResponse.redirect(new URL("/", SITE_URL), 302);
  }

  const effectiveService = serviceOverride ?? doc.service;
  const path = ORDER_PATH[effectiveService] ?? "/#services";
  const params = new URLSearchParams();
  if (doc.company.name)        params.set("q",           doc.company.name);
  if (doc.company.provinceKey) params.set("jurisdiction", doc.company.provinceKey);
  if (doc.company.registryId)  params.set("registryId",   doc.company.registryId);
  params.set("src", `outreach${doc.campaignId ? `-${doc.campaignId}` : ""}`);
  params.set("ref", token);

  const dest = new URL(`${path}?${params.toString()}`, SITE_URL);
  return NextResponse.redirect(dest, 302);
}
