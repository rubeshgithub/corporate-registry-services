import { db } from "@/lib/mongo";

/**
 * Who opened the unsubscribe confirmation page (owner, Oct 2026: "how to see who clicked the link").
 * Recorded only for a VALID signed link, so the address is one we emailed and nobody can plant rows.
 * Mail scanners open these links too — the user agent is kept so docu10 can set those apart. Opening the page
 * is NOT an unsubscribe; only the button (outreach_suppression) is.
 */
export async function recordUnsubscribeView(email: string, token: string, userAgent: string): Promise<void> {
  if (!process.env.MONGODB_URI) return;
  await (await db()).collection("unsubscribe_views").insertOne({
    email: email.slice(0, 200),
    token: token.slice(0, 80),
    userAgent: userAgent.slice(0, 300),
    ts: new Date(),
  });
}
