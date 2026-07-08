import { NextResponse } from "next/server";
import { outreachSuppression, ensureOutreachIndexes } from "@/lib/outreach-mongo";
import { verifyUnsubscribe } from "@/lib/outreach-token";

/**
 * GET /api/outreach/unsubscribe?e=<email>&s=<hmac>&t=<token>
 *
 * Public unsubscribe endpoint. The link is signed with an HMAC keyed to the
 * email address so recipients can't forge each other's unsubs. On success we
 * upsert the email into the suppression list and redirect to a confirmation
 * page.
 *
 * We return HTTP 302 in every non-error case so email clients that pre-fetch
 * links don't accidentally show the raw JSON — the confirmation page handles
 * the human-facing message.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://corporateregistryservices.ca";

export async function GET(req: Request) {
  const url   = new URL(req.url);
  const email = (url.searchParams.get("e") ?? "").trim().toLowerCase();
  const sig   = (url.searchParams.get("s") ?? "").trim();
  const token = (url.searchParams.get("t") ?? "").trim();

  if (!email || !sig || !verifyUnsubscribe(email, sig)) {
    return NextResponse.redirect(new URL("/unsubscribed?err=invalid", SITE_URL), 302);
  }

  try {
    await ensureOutreachIndexes();
    await (await outreachSuppression()).updateOne(
      { email },
      {
        $setOnInsert: {
          email,
          reason:      "unsubscribed",
          addedAt:     new Date(),
          sourceToken: token || undefined,
        },
      },
      { upsert: true },
    );
  } catch (e: unknown) {
    console.error("[outreach/unsubscribe] failed to record:", e);
    return NextResponse.redirect(new URL("/unsubscribed?err=server", SITE_URL), 302);
  }

  return NextResponse.redirect(new URL(`/unsubscribed?e=${encodeURIComponent(email)}`, SITE_URL), 302);
}
